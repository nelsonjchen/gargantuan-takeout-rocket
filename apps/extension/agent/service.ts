import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  advanceJob,
  BLOCK_CONCURRENCY,
  BLOCK_BYTES,
  destinationIdentity,
  newJob,
  QueueBackend,
  TransferJob
} from "../src/transferQueue";
import { queueBackend } from "../src/queueBackend";
import { validateTransloadConfig } from "../src/config";
import { sourceToGtrProxySource } from "../src/transload";
import { Download } from "../src/state";

export interface Policy {
  container: string;
  proxy: string;
  reservations: string[];
}
interface Authorization {
  container: string;
  proxy: string;
  cookies: string;
}
interface Entry {
  job: TransferJob;
  sourceIdentity: string;
  authorization: Authorization;
  progress?: Download;
}
interface Receipt {
  fingerprint: string;
  state: "started" | "finished";
  response?: unknown;
}
export interface ServiceState {
  version: 1;
  policy: Policy;
  paused: boolean;
  jobs: Record<string, Entry>;
  receipts: Record<string, Receipt>;
}
export interface Request {
  id: string;
  method: string;
  params?: unknown;
}
interface Submission {
  name: string;
  source: string;
  container: string;
  proxy: string;
  cookies: string;
}
type BackendFactory = (authorization: Authorization) => QueueBackend;

export async function privateDirectory(directory: string) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await fs.lstat(directory);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    info.uid !== process.getuid?.() ||
    info.mode & 0o077
  )
    throw new Error(
      "Agent state directory must be owned by this user with mode 0700"
    );
}

export class StateStore {
  private writes: Promise<void> = Promise.resolve();
  constructor(readonly directory: string) {}
  async load(): Promise<ServiceState | undefined> {
    await privateDirectory(this.directory);
    const file = path.join(this.directory, "state.json");
    try {
      const info = await fs.lstat(file);
      if (
        !info.isFile() ||
        info.isSymbolicLink() ||
        info.uid !== process.getuid?.() ||
        info.mode & 0o077
      )
        throw new Error("Unsafe state file permissions");
      return JSON.parse(await fs.readFile(file, "utf8"));
    } catch (error: any) {
      if (error.code === "ENOENT") return undefined;
      throw error;
    }
  }
  save(state: ServiceState): Promise<void> {
    const operation = this.writes.then(async () => {
      const file = path.join(this.directory, "state.json");
      const temp = file + "." + randomUUID();
      const handle = await fs.open(temp, "wx", 0o600);
      try {
        await handle.writeFile(JSON.stringify(state));
        await handle.sync();
      } finally {
        await handle.close();
      }
      await fs.rename(temp, file);
      const dir = await fs.open(this.directory, "r");
      try {
        await dir.sync();
      } finally {
        await dir.close();
      }
    });
    this.writes = operation.catch(() => {});
    return operation;
  }
}

export function validRequest(value: unknown): value is Request {
  const r = value as Request;
  return (
    !!r &&
    typeof r === "object" &&
    /^[a-f0-9]{32}$/.test(r.id) &&
    [
      "status",
      "capacity",
      "pause",
      "resume",
      "retry",
      "submit",
      "reconcile-reservations"
    ].includes(r.method) &&
    Object.keys(r).every((k) => ["id", "method", "params"].includes(k))
  );
}
export function validateSubmission(
  value: unknown,
  policy: Policy
): Submission | undefined {
  const p = value as Submission;
  if (
    !p ||
    typeof p.name !== "string" ||
    !p.name.length ||
    p.name.length > 1024 ||
    /[\x00-\x1f\x7f]/.test(p.name) ||
    p.name.includes("..") ||
    p.name.includes("\\")
  )
    return;
  if (
    typeof p.source !== "string" ||
    typeof p.container !== "string" ||
    typeof p.proxy !== "string" ||
    typeof p.cookies !== "string" ||
    p.cookies.length > 8192
  )
    return;
  if (
    Object.keys(p).some(
      (k) => !["name", "source", "container", "proxy", "cookies"].includes(k)
    )
  )
    return;
  try {
    const source = new URL(p.source);
    if (
      source.protocol !== "https:" ||
      source.username ||
      source.password ||
      ![
        "apidata.googleusercontent.com",
        "storage.googleapis.com",
        "takeout.google.com",
        "takeout-download.usercontent.google.com"
      ].includes(source.hostname)
    )
      return;
    if (
      source.hostname === "storage.googleapis.com"
        ? !source.pathname.startsWith("/takeout-")
        : !source.pathname.startsWith("/download") &&
          !source.pathname.startsWith("/takeout/download")
    )
      return;
    if (
      destinationIdentity(p.container) !== policy.container ||
      p.proxy !== policy.proxy ||
      validateTransloadConfig(p.container, p.proxy)
    )
      return;
    sourceToGtrProxySource(p.source, p.proxy, p.cookies);
  } catch {
    return;
  }
  return p;
}

function sourceIdentityHash(source: string): string {
  const url = new URL(source);
  for (const key of Array.from(url.searchParams.keys())) {
    if (
      /^(rapt|token|sig|signature|expires|googleaccessid|x-goog-.+)$/i.test(key)
    )
      url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return createHash("sha256")
    .update(url.origin + url.pathname + url.search)
    .digest("hex");
}

export class TransferService {
  private operations: Promise<unknown> = Promise.resolve();
  private pumping = false;
  private healthy = true;
  readonly active = new Set<string>();
  private backend: BackendFactory;
  readonly requestTimeoutMs: number;
  constructor(
    readonly state: ServiceState,
    private store: Pick<StateStore, "save">,
    backend: BackendFactory | undefined = undefined,
    readonly archiveLimit = 3,
    readonly blockBytes = BLOCK_BYTES,
    readonly blockConcurrency = BLOCK_CONCURRENCY
  ) {
    if (!Number.isInteger(archiveLimit) || archiveLimit < 1 || archiveLimit > 6)
      throw new Error("Archive limit must be an integer from 1 to 6");
    if (
      !Number.isInteger(blockConcurrency) ||
      blockConcurrency < 1 ||
      blockConcurrency > BLOCK_CONCURRENCY
    )
      throw new Error("Block concurrency must be an integer from 1 to 3");
    if (
      !Number.isSafeInteger(blockBytes) ||
      blockBytes < BLOCK_BYTES ||
      blockBytes > 3 * 1024 * 1024 * 1024 ||
      blockBytes % BLOCK_BYTES !== 0
    )
      throw new Error(
        "Block size must be a multiple of 256 MiB up to 3072 MiB"
      );
    // Larger server-side ranges need more time than the browser's fetch window.
    this.requestTimeoutMs = Math.min(
      300_000,
      75_000 * (blockBytes / BLOCK_BYTES)
    );
    this.backend =
      backend ||
      ((a) =>
        queueBackend(
          a.container,
          a.proxy,
          async () => a.cookies,
          this.requestTimeoutMs
        ));
  }
  status() {
    // This service owns these jobs. It does not read browser/profile history.
    return {
      protocol: 1,
      owner: "gtr-transfer-service",
      observedAt: new Date().toISOString(),
      paused: this.state.paused,
      storageHealthy: this.healthy,
      archiveLimit: this.archiveLimit,
      blocksPerFile: this.blockConcurrency,
      maxCopyRequests: this.archiveLimit * this.blockConcurrency,
      newBlockBytes: this.blockBytes,
      requestTimeoutMs: this.requestTimeoutMs,
      active: Array.from(this.active),
      reservations: [...this.state.policy.reservations],
      jobs: Object.values(this.state.jobs).map(({ job, progress }) => ({
        id: job.id,
        name: job.name,
        state: job.state,
        updatedAt: job.updatedAt,
        retryAt: job.retryAt,
        reason: job.reason,
        totalBytes: job.plan?.length,
        copiedBytes: progress?.transferredBytes,
        completedBlocks: progress?.completedBlocks,
        totalBlocks: job.plan?.blocks.length
      }))
    };
  }
  request(input: unknown, ingest = false): Promise<unknown> {
    if (!validRequest(input))
      return Promise.resolve({ ok: false, error: "invalid_request" });
    if (
      (input.method === "submit" || input.method === "capacity") !== ingest &&
      input.method !== "status"
    )
      return Promise.resolve({ ok: false, error: "wrong_endpoint" });
    if (ingest && input.method === "status")
      return Promise.resolve({ ok: false, error: "wrong_endpoint" });
    const operation = this.operations.then(() => this.execute(input));
    this.operations = operation.catch(() => {});
    return operation.catch(() => ({
      ok: false,
      error: "operation_interrupted",
      requestId: input.id
    }));
  }
  private async save() {
    await this.store.save(this.state);
  }
  private async execute(request: Request): Promise<unknown> {
    if (request.method === "status") return { ok: true, result: this.status() };
    if (request.method === "capacity") {
      const unfinishedJobs = Object.values(this.state.jobs).filter(
        (e) => e.job.state !== "complete"
      ).length;
      return {
        ok: true,
        result: {
          archiveLimit: this.archiveLimit,
          unfinishedJobs,
          availableSlots: Math.max(
            0,
            this.archiveLimit -
              this.state.policy.reservations.length -
              unfinishedJobs
          ),
          paused: this.state.paused,
          needsAttention:
            !!this.state.policy.reservations.length ||
            Object.values(this.state.jobs).some(
              (e) => e.job.state === "blocked"
            )
        }
      };
    }
    if (
      request.method !== "submit" &&
      request.method !== "retry" &&
      request.params !== undefined
    )
      return { ok: false, error: "unexpected_params" };
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify({ method: request.method, params: request.params })
      )
      .digest("hex");
    const prior = this.state.receipts[request.id];
    if (prior) {
      if (prior.fingerprint !== fingerprint)
        return { ok: false, error: "request_id_conflict" };
      return prior.state === "finished"
        ? prior.response
        : { ok: false, error: "outcome_unknown", requestId: request.id };
    }
    if (request.method === "retry") {
      const p = request.params as { name?: unknown };
      if (
        !p ||
        typeof p.name !== "string" ||
        Object.keys(p).some((k) => k !== "name")
      )
        return { ok: false, error: "invalid_job" };
      const job = this.state.jobs[p.name]?.job;
      if (
        !job ||
        this.active.has(p.name) ||
        !["waiting", "blocked"].includes(job.state)
      )
        return { ok: false, error: "job_not_retryable" };
    }
    const params =
      request.method === "submit"
        ? validateSubmission(request.params, this.state.policy)
        : undefined;
    if (request.method === "submit" && !params)
      return { ok: false, error: "submission_outside_policy" };
    if (params && this.state.policy.reservations.includes(params.name))
      return { ok: false, error: "legacy_reservation_unresolved" };
    const sourceIdentity = params
      ? sourceIdentityHash(params.source)
      : undefined;
    if (
      params &&
      this.state.jobs[params.name] &&
      this.state.jobs[params.name].sourceIdentity !== sourceIdentity
    )
      return { ok: false, error: "source_identity_conflict" };
    if (
      params &&
      !this.state.jobs[params.name] &&
      Object.values(this.state.jobs).filter(
        (entry) => entry.job.state !== "complete"
      ).length +
        this.state.policy.reservations.length >=
        this.archiveLimit
    )
      return { ok: false, error: "queue_full" };
    const receipts = this.state.receipts;
    // Don't evict uncertain OR completed IDs: a late retry of a lost response
    // must never execute again just because other commands happened meanwhile.
    if (Object.keys(receipts).length >= 4096)
      return { ok: false, error: "receipt_capacity_reached" };
    receipts[request.id] = { fingerprint, state: "started" };
    await this.save();
    let result: unknown;
    if (request.method === "pause" || request.method === "resume") {
      this.state.paused = request.method === "pause";
      if (request.method === "resume") this.healthy = true;
      result = { paused: this.state.paused, reservationsPreserved: true };
    } else if (request.method === "retry") {
      const name = (request.params as { name: string }).name;
      const job = this.state.jobs[name].job;
      job.state = "queued";
      job.attempts = 0;
      job.retryAt = undefined;
      job.reason = undefined;
      result = { name, state: job.state };
    } else if (request.method === "submit") {
      const p = params!;
      let entry = this.state.jobs[p.name];
      if (!entry) {
        entry = {
          job: newJob(p.name, p.source, p.container),
          sourceIdentity: sourceIdentity!,
          authorization: {
            container: p.container,
            proxy: p.proxy,
            cookies: p.cookies
          }
        };
        this.state.jobs[p.name] = entry;
      } else if (
        ["blocked", "waiting", "queued"].includes(entry.job.state) &&
        !this.active.has(p.name)
      ) {
        entry.authorization = {
          container: p.container,
          proxy: p.proxy,
          cookies: p.cookies
        };
        entry.job.source = p.source;
        entry.job.state = "queued";
        entry.job.reason = undefined;
        entry.job.attempts = 0;
        entry.job.retryAt = undefined;
        entry.job.updatedAt = Date.now();
      }
      result = {
        jobId: entry.job.id,
        name: p.name,
        state: entry.job.state,
        owner: "gtr-transfer-service"
      };
    } else {
      const auth = Object.values(this.state.jobs).find(
        (entry) => entry.authorization.container
      )?.authorization;
      if (!auth)
        result = {
          resolved: [],
          remaining: [...this.state.policy.reservations],
          notice:
            "No service-owned authorization is available to reconcile Azure."
        };
      else {
        const resolved: string[] = [];
        for (const name of this.state.policy.reservations)
          if (await this.backend(auth).inspectBlob(name)) resolved.push(name);
        this.state.policy.reservations = this.state.policy.reservations.filter(
          (name) => !resolved.includes(name)
        );
        result = { resolved, remaining: [...this.state.policy.reservations] };
      }
    }
    const response = { ok: true, result };
    receipts[request.id] = { fingerprint, state: "finished", response };
    await this.save();
    return response;
  }
  async tick(): Promise<void> {
    if (this.pumping || this.state.paused || !this.healthy) return;
    this.pumping = true;
    try {
      const entries = Object.values(this.state.jobs)
        .filter((e) => e.job.state !== "complete")
        .sort((a, b) => a.job.createdAt - b.job.createdAt)
        .slice(
          0,
          Math.max(0, this.archiveLimit - this.state.policy.reservations.length)
        )
        .filter(
          (e) =>
            e.job.state === "queued" ||
            e.job.state === "running" ||
            (e.job.state === "waiting" && (e.job.retryAt || 0) <= Date.now())
        );
      const outcomes = await Promise.allSettled(
        entries.map(async (entry) => {
          this.active.add(entry.job.name);
          try {
            await advanceJob(
              entry.job,
              this.backend(entry.authorization),
              async (job, progress) => {
                entry.job = job;
                if (progress) entry.progress = progress;
                if (job.state === "complete")
                  entry.authorization = {
                    container: "",
                    proxy: "",
                    cookies: ""
                  };
                await this.save();
              },
              this.blockBytes,
              this.blockConcurrency
            );
          } finally {
            this.active.delete(entry.job.name);
          }
        })
      );
      if (outcomes.some((result) => result.status === "rejected")) {
        this.healthy = false;
        this.state.paused = true;
      }
    } catch {
      this.healthy = false;
      this.state.paused = true;
    } finally {
      this.pumping = false;
    }
  }
}
