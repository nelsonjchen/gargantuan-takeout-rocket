import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
  Policy,
  privateDirectory,
  StateStore,
  TransferService
} from "./service";
import { BLOCK_BYTES, BLOCK_CONCURRENCY } from "../src/transferQueue";

const DEFAULT_DIRECTORY = path.join(
  os.homedir(),
  "Library/Application Support/GTR/agent"
);
async function acquireLease(directory: string) {
  const child = spawn(
    process.env.GTR_PYTHON || "python3",
    [path.join(__dirname, "lease.py"), directory],
    { stdio: ["pipe", "pipe", "pipe"] }
  );
  child.stderr.resume();
  let ready = false;
  let releasing = false;
  await new Promise<void>((resolve, reject) => {
    let line = "";
    child.stdout.on("data", (data) => {
      if (ready) return;
      line += data.toString();
      if (!line.includes("\n")) return;
      if (line === "locked\n") {
        ready = true;
        resolve();
      } else {
        child.kill();
        reject(new Error("Invalid service lease acknowledgement"));
      }
    });
    child.once("error", () =>
      reject(new Error("Could not start the service lease helper"))
    );
    child.once("exit", () => {
      if (!ready)
        reject(
          Object.assign(
            new Error(
              "A service already owns the lease, or lease permissions are unsafe"
            ),
            { code: "EEXIST" }
          )
        );
      else if (!releasing) process.exit(1); // Fail closed if exclusivity is lost.
    });
  });
  return async () => {
    releasing = true;
    if (child.exitCode !== null) return;
    await new Promise<void>((resolve) => {
      child.once("exit", () => resolve());
      child.stdin.end();
    });
  };
}
export async function startService(
  directory: string,
  policy: Policy,
  archiveLimit = 3,
  blockBytes = BLOCK_BYTES,
  blockConcurrency = BLOCK_CONCURRENCY
) {
  const store = new StateStore(directory);
  await privateDirectory(directory);
  const releaseLease = await acquireLease(directory);
  const servers: net.Server[] = [];
  const sockets: string[] = [];
  try {
    let state = await store.load();
    if (!state) {
      state = { version: 1, policy, paused: true, jobs: {}, receipts: {} };
      await store.save(state);
    }
    if (
      state.version !== 1 ||
      state.policy.container !== policy.container ||
      state.policy.proxy !== policy.proxy
    )
      throw new Error(
        "Stored service policy differs; no destination change was applied"
      );
    const service = new TransferService(
      state,
      store,
      undefined,
      archiveLimit,
      blockBytes,
      blockConcurrency
    );
    for (const ingest of [false, true]) {
      const socketPath = path.join(
        directory,
        ingest ? "ingest.sock" : "control.sock"
      );
      if (Buffer.byteLength(socketPath) > 100)
        throw new Error("Unix socket path is too long");
      // The kernel lease proves the previous service instance has exited.
      try {
        const info = await fs.lstat(socketPath);
        if (
          !info.isSocket() ||
          info.uid !== process.getuid?.() ||
          info.mode & 0o077
        )
          throw new Error("Unsafe existing socket");
        await fs.unlink(socketPath);
      } catch (error: any) {
        if (error.code !== "ENOENT") throw error;
      }
      const server = net.createServer((connection) => {
        connection.setEncoding("utf8");
        let body = "";
        let handled = false;
        connection.setTimeout(90_000, () => connection.destroy());
        connection.on("error", () => {});
        connection.on("data", (chunk) => {
          if (handled) return;
          body += chunk.toString("utf8");
          if (Buffer.byteLength(body) > 16_384) {
            handled = true;
            connection.end('{"ok":false,"error":"request_too_large"}\n');
            return;
          }
          if (!body.includes("\n")) return;
          handled = true;
          let request: unknown;
          try {
            request = JSON.parse(body.slice(0, body.indexOf("\n")));
          } catch {
            connection.end('{"ok":false,"error":"invalid_json"}\n');
            return;
          }
          void service
            .request(request, ingest)
            .then((response) => connection.end(JSON.stringify(response) + "\n"))
            .catch(() =>
              connection.end('{"ok":false,"error":"request_interrupted"}\n')
            );
        });
      });
      server.maxConnections = 8;
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(socketPath, () => {
          server.removeListener("error", reject);
          resolve();
        });
      });
      await fs.chmod(socketPath, 0o600);
      servers.push(server);
      sockets.push(socketPath);
    }
    const timer = setInterval(() => {
      void service.tick();
    }, 1000);
    let closed = false;
    return {
      service,
      async close() {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        service.state.paused = true;
        // Wait for issued bounded requests; their checkpoints remain resumable.
        while (service.active.size)
          await new Promise((resolve) => setTimeout(resolve, 100));
        await store.save(service.state);
        await Promise.all(
          servers.map(
            (server) =>
              new Promise<void>((resolve) => server.close(() => resolve()))
          )
        );
        for (const socket of sockets) await fs.rm(socket, { force: true });
        await releaseLease();
      }
    };
  } catch (error) {
    for (const server of servers) server.close();
    for (const socket of sockets) await fs.rm(socket, { force: true });
    await releaseLease();
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const directory = option("--state-dir") || DEFAULT_DIRECTORY;
  const command = args[0];
  if (command === "serve") {
    const config = option("--config");
    if (!config)
      throw new Error("serve requires a reviewed policy configuration");
    const policy = JSON.parse(await fs.readFile(config, "utf8")) as Policy;
    const container = new URL(policy.container);
    const proxy = new URL(policy.proxy);
    if (
      container.protocol !== "https:" ||
      !container.hostname.endsWith(".blob.core.windows.net") ||
      !/^\/[a-z0-9-]{3,63}$/.test(container.pathname) ||
      container.search ||
      container.hash ||
      container.username ||
      container.password ||
      proxy.protocol !== "https:" ||
      proxy.origin !== policy.proxy ||
      !Array.isArray(policy.reservations) ||
      policy.reservations.some((name) => typeof name !== "string")
    )
      throw new Error(
        "Policy must specify a container identity and HTTPS proxy without credentials"
      );
    const archiveLimit = option("--archive-limit");
    const blockMiB = option("--block-mib");
    const blocksPerFile = option("--blocks-per-file");
    const running = await startService(
      directory,
      policy,
      archiveLimit === undefined ? 3 : Number(archiveLimit),
      blockMiB === undefined ? BLOCK_BYTES : Number(blockMiB) * 1024 * 1024,
      blocksPerFile === undefined ? BLOCK_CONCURRENCY : Number(blocksPerFile)
    );
    process.stdout.write(
      JSON.stringify({
        ok: true,
        owner: "gtr-transfer-service",
        directory,
        paused: running.service.state.paused
      }) + "\n"
    );
    const stop = () => {
      void running.close().then(
        () => process.exit(0),
        () => process.exit(1)
      );
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    return;
  }
  if (
    !["status", "pause", "resume", "retry", "reconcile-reservations"].includes(
      command
    )
  )
    throw new Error(
      "Commands: serve, status, pause, resume, retry --job NAME, reconcile-reservations"
    );
  const id = option("--request-id") || randomUUID().replace(/-/g, "");
  if (!/^[a-f0-9]{32}$/.test(id))
    throw new Error("request-id must be 32 lowercase hex characters");
  if (command === "retry" && !option("--job"))
    throw new Error("Commands: retry requires --job NAME");
  const request = {
    id,
    method: command,
    ...(command === "retry" ? { params: { name: option("--job") } } : {})
  };
  const result = await new Promise<string>((resolve, reject) => {
    const socket = net.createConnection(path.join(directory, "control.sock"));
    socket.setEncoding("utf8");
    let body = "";
    socket.setTimeout(90_000, () => socket.destroy(new Error("timeout")));
    socket.on("connect", () => socket.write(JSON.stringify(request) + "\n"));
    socket.on("data", (data) => {
      body += data.toString("utf8");
      if (Buffer.byteLength(body) > 1024 * 1024) {
        socket.destroy(new Error("response_too_large"));
        return;
      }
      if (body.includes("\n")) {
        resolve(body.slice(0, body.indexOf("\n")));
        socket.end();
      }
    });
    socket.on("error", () =>
      reject(
        new Error(
          "Service unavailable or response unknown; reuse request ID " + id
        )
      )
    );
    socket.on("end", () => {
      if (!body.includes("\n"))
        reject(new Error("Incomplete response; reuse request ID " + id));
    });
  });
  process.stdout.write(
    JSON.stringify({ requestId: id, ...JSON.parse(result) }) + "\n"
  );
}
if (require.main === module)
  void main().catch((error) => {
    // Own fixed errors only; do not serialize submitted payloads or network errors.
    process.stderr.write(
      JSON.stringify({
        ok: false,
        error:
          error instanceof Error &&
          /^(Commands:|request-id|serve requires|Policy must|Stored service|Service unavailable|Incomplete response)/.test(
            error.message
          )
            ? error.message
            : "Service operation failed; inspect the local service and file permissions."
      }) + "\n"
    );
    process.exitCode = 1;
  });
