import { promises as fs } from "node:fs";
import path from "node:path";
import net from "node:net";
import {
  Policy,
  ServiceState,
  StateStore,
  TransferService,
  validateSubmission
} from "../agent/service";
import { startService } from "../agent/server";
import { BLOCK_BYTES, QueueBackend, TransferError } from "../src/transferQueue";

const policy: Policy = {
  container: "https://backup.blob.core.windows.net/backups",
  proxy: "https://proxy.test",
  reservations: []
};
const submission = {
  name: "archive.zip",
  source: "https://takeout.google.com/takeout/download/example",
  container: policy.container + "?sig=private-sas-token",
  proxy: policy.proxy,
  cookies: "private-cookie-payload"
};
let sequence = 0;
const request = (method: string, params?: unknown) => ({
  id: (++sequence).toString(16).padStart(32, "0"),
  method,
  ...(params === undefined ? {} : { params })
});
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function fixture(
  length = 20,
  reservations: string[] = [],
  archiveLimit = 3,
  blockBytes = BLOCK_BYTES,
  blockConcurrency = 3
) {
  const state: ServiceState = {
    version: 1,
    policy: { ...policy, reservations },
    paused: true,
    jobs: {},
    receipts: {}
  };
  let saved = clone(state);
  const store = {
    save: jest.fn(async (s: ServiceState) => {
      saved = clone(s);
    })
  };
  const blocks: Record<string, number> = {};
  const blobs: Record<string, { size: number; jobId?: string }> = {};
  const backend: QueueBackend = {
    inspectSource: jest.fn(async () => length),
    inspectBlob: jest.fn(async (name) => blobs[name]),
    stagedBlocks: jest.fn(async () => ({ ...blocks })),
    stage: jest.fn(async (name, id, _source, _offset, size) => {
      expect(saved.jobs[name].job.plan?.blocks.some((b) => b.id === id)).toBe(
        true
      );
      blocks[id] = size;
    }),
    commit: jest.fn(async (name, ids, jobId) => {
      blobs[name] = {
        jobId,
        size: ids.reduce((sum, id) => sum + blocks[id], 0)
      };
    })
  };
  const service = new TransferService(
    state,
    store,
    () => backend,
    archiveLimit,
    blockBytes,
    blockConcurrency
  );
  return { service, state, store, backend, blobs, saved: () => saved };
}

test("service durably accepts new jobs, owns progress, and clears completed authorization", async () => {
  const f = fixture();
  const command = request("submit", submission);
  const accepted: any = await f.service.request(command, true);
  expect(accepted.ok).toBe(true);
  expect(f.saved().jobs[submission.name].job.id).toBe(accepted.result.jobId);
  await f.service.tick();
  expect(f.backend.stage).not.toHaveBeenCalled();
  await f.service.request(request("resume"));
  await f.service.tick();
  expect(f.service.status().jobs[0].state).toBe("complete");
  expect(f.saved().jobs[submission.name].authorization).toEqual({
    container: "",
    proxy: "",
    cookies: ""
  });
  const status = JSON.stringify(await f.service.request(request("status")));
  for (const secret of [
    "private-sas-token",
    "private-cookie-payload",
    submission.source,
    "authorization",
    "history"
  ])
    expect(status).not.toContain(secret);
  expect(status).toContain("gtr-transfer-service");
});
test("submission atomically limits unfinished archives to three", async () => {
  const f = fixture();
  for (let i = 0; i < 3; i++)
    expect(
      (
        (await f.service.request(
          request("submit", { ...submission, name: `archive-${i}.zip` }),
          true
        )) as any
      ).ok
    ).toBe(true);
  expect(
    await f.service.request(
      request("submit", { ...submission, name: "fourth.zip" }),
      true
    )
  ).toEqual({ ok: false, error: "queue_full" });
  expect(Object.keys(f.saved().jobs)).toHaveLength(3);
});
test("the native service plans larger blocks and reports its bounded deadline", async () => {
  const large = 1024 * 1024 * 1024;
  const f = fixture(large + 17, [], 3, large);
  await f.service.request(request("submit", submission), true);
  await f.service.request(request("resume"));
  await f.service.tick();
  expect(
    f.saved().jobs[submission.name].job.plan?.blocks.map((b) => b.size)
  ).toEqual([large, 17]);
  expect(f.service.status()).toMatchObject({
    archiveLimit: 3,
    newBlockBytes: large,
    requestTimeoutMs: 300000
  });
  for (const size of [0, BLOCK_BYTES / 2, 4 * large])
    expect(() => fixture(20, [], 3, size)).toThrow("Block size");
});
test("an approved six-archive run enforces capacity and pumps six jobs", async () => {
  const f = fixture(20, [], 6);
  for (let i = 0; i < 6; i++)
    expect(
      (
        (await f.service.request(
          request("submit", { ...submission, name: `six-${i}.zip` }),
          true
        )) as any
      ).ok
    ).toBe(true);
  expect(
    await f.service.request(
      request("submit", { ...submission, name: "seventh.zip" }),
      true
    )
  ).toEqual({ ok: false, error: "queue_full" });
  expect(f.service.status().archiveLimit).toBe(6);
  expect(
    ((await f.service.request(request("capacity"), true)) as any).result
      .availableSlots
  ).toBe(0);
  let active = 0;
  let peak = 0;
  const original = f.backend.stage;
  f.backend.stage = jest.fn(
    async (...args: Parameters<QueueBackend["stage"]>) => {
      peak = Math.max(peak, ++active);
      await new Promise<void>((resolve) => setImmediate(resolve));
      await original(...args);
      active--;
    }
  );
  await f.service.request(request("resume"));
  await f.service.tick();
  expect(peak).toBe(6);
  expect(
    f.service.status().jobs.filter((j) => j.state === "complete")
  ).toHaveLength(6);
});
test("four files with two block requests each stay within eight copies and preserve plans on rollback", async () => {
  const f = fixture(BLOCK_BYTES * 6 + 1, [], 4, BLOCK_BYTES, 2);
  for (let i = 0; i < 4; i++)
    expect(
      (
        (await f.service.request(
          request("submit", { ...submission, name: `four-${i}.zip` }),
          true
        )) as any
      ).ok
    ).toBe(true);
  expect(
    await f.service.request(
      request("submit", { ...submission, name: "fifth.zip" }),
      true
    )
  ).toEqual({ ok: false, error: "queue_full" });
  let active = 0;
  let peak = 0;
  const original = f.backend.stage;
  f.backend.stage = jest.fn(
    async (...args: Parameters<QueueBackend["stage"]>) => {
      peak = Math.max(peak, ++active);
      await new Promise<void>((resolve) => setImmediate(resolve));
      await original(...args);
      active--;
    }
  );
  await f.service.request(request("resume"));
  await f.service.tick();
  expect(peak).toBe(8);
  expect(f.service.status()).toMatchObject({
    archiveLimit: 4,
    blocksPerFile: 2,
    maxCopyRequests: 8
  });
  expect(f.backend.stage).toHaveBeenCalledTimes(8);
  const saved = clone(f.saved());
  const plans = Object.values(saved.jobs).map((e) => e.job.plan);
  const rollback = new TransferService(saved, f.store, () => f.backend);
  await rollback.tick();
  expect(Object.values(f.saved().jobs).map((e) => e.job.plan)).toEqual(plans);
  // The first three files each copy three missing blocks; accepted blocks stay reused.
  expect(f.backend.stage).toHaveBeenCalledTimes(17);
  expect(rollback.status()).toMatchObject({
    archiveLimit: 3,
    blocksPerFile: 3,
    maxCopyRequests: 9
  });
  for (const width of [0, 4, 1.5, NaN])
    expect(() => fixture(20, [], 4, BLOCK_BYTES, width)).toThrow(
      "Block concurrency"
    );
});
test("the archive limit rejects unsafe values and still counts reservations", async () => {
  for (const limit of [0, 7, 1.5, NaN])
    expect(() => fixture(20, [], limit)).toThrow("Archive limit");
  const f = fixture(20, ["legacy.zip"], 6);
  expect(
    ((await f.service.request(request("capacity"), true)) as any).result
      .availableSlots
  ).toBe(5);
});
test("a replacement service resumes its saved IDs and accepted Azure blocks", async () => {
  const f = fixture(BLOCK_BYTES * 3 + 1);
  await f.service.request(request("submit", submission), true);
  await f.service.request(request("resume"));
  await f.service.tick();
  const restarted = new TransferService(
    clone(f.saved()),
    f.store,
    () => f.backend
  );
  await restarted.tick();
  expect(restarted.status().jobs[0].state).toBe("complete");
  expect(f.backend.stage).toHaveBeenCalledTimes(4);
  expect(f.backend.inspectSource).toHaveBeenCalledTimes(1);
});
test("a fresh capture refreshes a waiting job without replacing its durable plan", async () => {
  const f = fixture();
  const accepted: any = await f.service.request(
    request("submit", submission),
    true
  );
  await f.service.request(request("resume"));
  (f.backend.stage as jest.Mock).mockRejectedValueOnce(
    new TransferError("Temporary source failure", true)
  );
  await f.service.tick();
  const before = clone(f.saved().jobs[submission.name].job);
  expect(before.state).toBe("waiting");
  const refreshed: any = await f.service.request(
    request("submit", { ...submission, cookies: "refreshed-cookie-fixture" }),
    true
  );
  const after = f.saved().jobs[submission.name];
  expect(refreshed.result.jobId).toBe(accepted.result.jobId);
  expect(after.job.plan).toEqual(before.plan);
  expect(after.authorization.cookies).toBe("refreshed-cookie-fixture");
  expect(after.job.state).toBe("queued");
  expect(Object.keys(f.saved().jobs)).toHaveLength(1);
});
test("a paused queued job can receive fresh same-object authorization without a duplicate", async () => {
  const f = fixture();
  const accepted: any = await f.service.request(
    request("submit", submission),
    true
  );
  await f.service.request(
    request("submit", {
      ...submission,
      cookies: "fresh-queued-cookie-fixture"
    }),
    true
  );
  expect(f.saved().jobs[submission.name].job.id).toBe(accepted.result.jobId);
  expect(f.saved().jobs[submission.name].authorization.cookies).toBe(
    "fresh-queued-cookie-fixture"
  );
  expect(Object.keys(f.saved().jobs)).toHaveLength(1);
});
test("lost responses and duplicate submissions never create a second job", async () => {
  const f = fixture();
  const command = request("submit", submission);
  expect(await f.service.request(command, true)).toEqual(
    await f.service.request(command, true)
  );
  await f.service.request(request("submit", submission), true);
  expect(Object.keys(f.state.jobs)).toHaveLength(1);
  expect(
    await f.service.request({ ...command, method: "pause", params: undefined })
  ).toEqual({ ok: false, error: "request_id_conflict" });
});
test("a different source cannot silently reuse a completed or partial filename", async () => {
  const f = fixture();
  await f.service.request(request("submit", submission), true);
  const conflict: any = await f.service.request(
    request("submit", {
      ...submission,
      source: submission.source + "-different-object"
    }),
    true
  );
  expect(conflict.error).toBe("source_identity_conflict");
  const refreshed: any = await f.service.request(
    request("submit", {
      ...submission,
      source: submission.source + "?rapt=refreshed-auth"
    }),
    true
  );
  expect(refreshed.ok).toBe(true);
  expect(f.saved().jobs[submission.name].sourceIdentity).not.toContain(
    "https:"
  );
});
test("an interrupted mutating command returns unknown without re-executing it", async () => {
  const f = fixture();
  const command = request("resume");
  f.store.save.mockRejectedValueOnce(new Error("disk full"));
  expect(((await f.service.request(command)) as any).error).toBe(
    "operation_interrupted"
  );
  expect(((await f.service.request(command)) as any).error).toBe(
    "outcome_unknown"
  );
  expect(f.state.paused).toBe(true);
});
test("legacy reservations block new work and reject attempts to submit their files", async () => {
  const f = fixture(20, ["old4.zip", "old8.zip", "old9.zip"]);
  await f.service.request(request("submit", submission), true);
  await f.service.request(request("resume"));
  await f.service.tick();
  expect(f.backend.stage).not.toHaveBeenCalled();
  expect(
    (
      (await f.service.request(
        request("submit", { ...submission, name: "old4.zip" }),
        true
      )) as any
    ).error
  ).toBe("legacy_reservation_unresolved");
  expect(
    ((await f.service.request(request("capacity"), true)) as any).result
      .availableSlots
  ).toBe(0);
});
test("only positive Azure evidence frees reservations; absence never proves failure", async () => {
  const f = fixture(20, ["old4.zip", "old8.zip"]);
  await f.service.request(request("submit", submission), true);
  f.blobs["old4.zip"] = { size: 100 };
  const response: any = await f.service.request(
    request("reconcile-reservations")
  );
  expect(response.result).toEqual({
    resolved: ["old4.zip"],
    remaining: ["old8.zip"]
  });
  expect(f.service.status().jobs.map((j) => j.name)).toEqual([submission.name]);
});
test("control and ingress endpoints enforce separate command sets", async () => {
  const f = fixture();
  expect(
    ((await f.service.request(request("submit", submission))) as any).error
  ).toBe("wrong_endpoint");
  expect(
    ((await f.service.request(request("status"), true)) as any).error
  ).toBe("wrong_endpoint");
  expect(
    ((await f.service.request(request("resume"), true)) as any).error
  ).toBe("wrong_endpoint");
  expect(
    (
      (await f.service.request({
        ...request("status"),
        code: "arbitrary code"
      })) as any
    ).error
  ).toBe("invalid_request");
});
test("submissions cannot change the destination/proxy, read arbitrary hosts, or smuggle fields", () => {
  expect(validateSubmission(submission, policy)).toBeTruthy();
  for (const patch of [
    { container: "https://elsewhere.blob.core.windows.net/backups?sig=x" },
    { proxy: "https://attacker.test" },
    { source: "http://takeout.google.com/takeout/download/x" },
    { source: "https://attacker.test/download/x" },
    { source: "https://takeout.google.com/settings" },
    { name: "../secret" },
    { eval: "code" }
  ])
    expect(
      validateSubmission({ ...submission, ...patch }, policy)
    ).toBeUndefined();
});
test("retry applies only to the service's own stopped jobs and preserves reservations", async () => {
  const f = fixture();
  expect(
    (
      (await f.service.request(
        request("retry", { name: "unknown.zip" })
      )) as any
    ).error
  ).toBe("job_not_retryable");
  await f.service.request(request("submit", submission), true);
  await f.service.request(request("resume"));
  (f.backend.inspectSource as jest.Mock).mockRejectedValueOnce(
    new TransferError("Google authorization required")
  );
  await f.service.tick();
  expect(f.state.jobs[submission.name].job.state).toBe("blocked");
  await f.service.request(request("retry", { name: submission.name }));
  await f.service.tick();
  expect(f.state.jobs[submission.name].job.state).toBe("complete");
});

describe("private state and actual Unix endpoint", () => {
  let directory: string;
  beforeEach(async () => {
    directory = await fs.mkdtemp("/tmp/gtr-agent-test-");
  });
  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });
  test("state is atomic, mode 0600, and refuses symlinked files", async () => {
    const store = new StateStore(directory);
    expect(await store.load()).toBeUndefined();
    await store.save(fixture().state);
    expect(
      (await fs.stat(path.join(directory, "state.json"))).mode & 0o777
    ).toBe(0o600);
    expect((await store.load())?.version).toBe(1);
    await fs.rename(
      path.join(directory, "state.json"),
      path.join(directory, "other.json")
    );
    await fs.symlink(
      path.join(directory, "other.json"),
      path.join(directory, "state.json")
    );
    await expect(store.load()).rejects.toThrow("Unsafe state file");
  });
  test("real IPC exposes service status, excludes duplicate servers and cleans up its sockets", async () => {
    const server = await startService(directory, policy);
    try {
      const status: any = await new Promise((resolve, reject) => {
        const socket = net.createConnection(
          path.join(directory, "control.sock")
        );
        let text = "";
        socket.on("connect", () =>
          socket.write(JSON.stringify(request("status")) + "\n")
        );
        socket.on("data", (data) => {
          text += data.toString();
          if (text.includes("\n")) {
            socket.end();
            resolve(JSON.parse(text));
          }
        });
        socket.on("error", reject);
      });
      expect(status.result.owner).toBe("gtr-transfer-service");
      expect(status.result.paused).toBe(true);
      expect(
        (await fs.stat(path.join(directory, "control.sock"))).mode & 0o777
      ).toBe(0o600);
      await expect(startService(directory, policy)).rejects.toMatchObject({
        code: "EEXIST"
      });
    } finally {
      await server.close();
    }
    await expect(
      fs.stat(path.join(directory, "control.sock"))
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});

test.each([1, 2, 3, 4, 5, 6])(
  "capacity reports configured limit and unfinished count through a real commit for limit %i",
  async (archiveLimit) => {
    const f = fixture(20, [], archiveLimit);
    const capacity = async () =>
      ((await f.service.request(request("capacity"), true)) as any).result;
    expect(await capacity()).toMatchObject({
      archiveLimit,
      unfinishedJobs: 0,
      availableSlots: archiveLimit
    });
    await f.service.request(request("submit", submission), true);
    expect(await capacity()).toMatchObject({
      archiveLimit,
      unfinishedJobs: 1,
      availableSlots: archiveLimit - 1
    });
    await f.service.request(request("resume"));
    await f.service.tick();
    expect(f.service.status().jobs[0].state).toBe("complete");
    expect(await capacity()).toMatchObject({
      archiveLimit,
      unfinishedJobs: 0,
      availableSlots: archiveLimit
    });
  }
);
