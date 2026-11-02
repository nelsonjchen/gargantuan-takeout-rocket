import { v4 as uuid } from "uuid";
import { Download } from "./state";

// Credentials are supplied at execution time, never included in these records.
// The source URL is sensitive and belongs only in trusted extension storage.
export interface TransferJob {
  id: string;
  name: string;
  source: string;
  destination: string;
  state: "queued" | "running" | "waiting" | "blocked" | "complete";
  createdAt: number;
  updatedAt: number;
  attempts: number;
  retryAt?: number;
  progress?: { copiedBytes: number; completedBlocks: number };
  reason?: string;
  plan?: {
    length: number;
    blocks: { id: string; start: number; size: number }[];
  };
}

export class TransferError extends Error {
  constructor(message: string, public readonly retryable = false) {
    super(message);
    Object.setPrototypeOf(this, TransferError.prototype);
  }
}

export interface QueueBackend {
  inspectSource(source: string): Promise<number>;
  inspectBlob(
    name: string
  ): Promise<{ size: number; jobId?: string } | undefined>;
  stagedBlocks(name: string): Promise<Record<string, number>>;
  stage(
    name: string,
    id: string,
    source: string,
    start: number,
    size: number
  ): Promise<void>;
  commit(name: string, blocks: string[], jobId: string): Promise<void>;
}

export const MAX_TRANSFERS = 3;
// Small server-side ranges finish within the MV3 fetch response window more
// reliably than the old 3 GiB requests. Bytes still flow from the proxy to Azure.
export const BLOCK_BYTES = 256 * 1024 * 1024;
export const BLOCK_CONCURRENCY = 3;

export function destinationIdentity(container: string): string {
  const url = new URL(container);
  return url.origin + url.pathname.replace(/\/$/, "");
}

export function newJob(
  name: string,
  source: string,
  container: string
): TransferJob {
  return {
    id: uuid(),
    name,
    source,
    destination: destinationIdentity(container),
    state: "queued",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    attempts: 0
  };
}

export function jobDownload(
  job: TransferJob,
  copied = job.progress?.copiedBytes || 0,
  blocks = job.progress?.completedBlocks || 0
): Download {
  return {
    name: job.name,
    status:
      job.state === "complete"
        ? "complete"
        : job.state === "blocked"
        ? "failed"
        : "pending",
    phase:
      job.state === "queued"
        ? "queued"
        : job.state === "waiting"
        ? "waiting"
        : job.plan
        ? "copying"
        : "inspecting",
    reason: job.reason,
    startedAt: job.createdAt,
    updatedAt: job.updatedAt,
    totalBytes: job.plan?.length,
    totalBlocks: job.plan?.blocks.length,
    transferredBytes: copied,
    completedBlocks: blocks,
    ...(job.state === "complete"
      ? {
          size: job.plan?.length,
          transferredBytes: job.plan?.length,
          completedBlocks: job.plan?.blocks.length
        }
      : {})
  };
}

// One bounded step. Every wake re-reads Azure, including after a lost response.
// Repeating a stage uses the SAME block ID/range; commits never overwrite a blob.
export async function advanceJob(
  job: TransferJob,
  backend: QueueBackend,
  save: (job: TransferJob, progress?: Download) => Promise<void>,
  blockBytes = BLOCK_BYTES,
  blockConcurrency = BLOCK_CONCURRENCY
): Promise<void> {
  if (
    !Number.isInteger(blockConcurrency) ||
    blockConcurrency < 1 ||
    blockConcurrency > BLOCK_CONCURRENCY
  )
    throw new Error("Block concurrency must be an integer from 1 to 3");
  const checkpoint = async (progress?: Download) => {
    job.updatedAt = Date.now();
    if (
      progress?.transferredBytes !== undefined &&
      progress.completedBlocks !== undefined
    )
      job.progress = {
        copiedBytes: progress.transferredBytes,
        completedBlocks: progress.completedBlocks
      };
    await save({ ...job }, progress);
  };
  const finish = async () => {
    job.state = "complete";
    job.reason = undefined;
    // Release expiring source authentication as soon as the job is committed.
    job.source = "";
    await checkpoint(jobDownload(job));
  };
  try {
    job.state = "running";
    await checkpoint();
    const existing = await backend.inspectBlob(job.name);
    if (existing) {
      if (
        existing.jobId !== job.id ||
        !job.plan ||
        existing.size !== job.plan.length
      )
        throw new TransferError(
          "A destination blob already exists. Verify it before replacing or skipping this job."
        );
      await finish();
      return;
    }
    if (!job.plan) {
      if (
        !Number.isSafeInteger(blockBytes) ||
        blockBytes <= 0 ||
        blockBytes > 4000 * 1024 * 1024
      )
        throw new TransferError(
          "Block size is outside Azure's supported range"
        );
      const length = await backend.inspectSource(job.source);
      if (!Number.isSafeInteger(length) || length <= 0)
        throw new TransferError(
          "Source content-length must be a positive safe integer"
        );
      job.plan = { length, blocks: [] };
      for (let start = 0; start < length; start += blockBytes)
        job.plan.blocks.push({
          id: btoa(uuid()),
          start,
          size: Math.min(blockBytes, length - start)
        });
      // Save all IDs BEFORE issuing the first mutating Azure request.
      await checkpoint();
    }
    const staged = await backend.stagedBlocks(job.name);
    const matching = job.plan.blocks.filter(
      (block) => staged[block.id] === block.size
    );
    let copied = matching.reduce((sum, block) => sum + block.size, 0);
    let count = matching.length;
    await checkpoint(jobDownload(job, copied, count));
    const missing = job.plan.blocks.filter(
      (block) => staged[block.id] !== block.size
    );
    const batch = missing.slice(0, blockConcurrency);
    // Await ALL results before freeing a slot, even if one stage failed.
    const results = await Promise.allSettled(
      batch.map(async (block) => {
        await backend.stage(
          job.name,
          block.id,
          job.source,
          block.start,
          block.size
        );
      })
    );
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === "fulfilled") {
        copied += batch[i].size;
        count++;
      }
    }
    await checkpoint(jobDownload(job, copied, count));
    const failed = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    );
    if (failed) throw failed.reason;
    if (missing.length > batch.length) {
      job.state = "queued";
      job.attempts = 0;
      await checkpoint(jobDownload(job, copied, count));
      return;
    }
    await checkpoint({
      ...jobDownload(job, copied, count),
      phase: "committing"
    });
    await backend.commit(
      job.name,
      job.plan.blocks.map((block) => block.id),
      job.id
    );
    // A successful PUT alone isn't our final verification.
    const committed = await backend.inspectBlob(job.name);
    if (
      !committed ||
      committed.size !== job.plan.length ||
      committed.jobId !== job.id
    )
      throw new TransferError("Azure commit could not be verified", true);
    await finish();
  } catch (error) {
    job.attempts++;
    const retryable = error instanceof TransferError && error.retryable;
    job.state = retryable && job.attempts < 8 ? "waiting" : "blocked";
    // Only our fixed messages reach history; fetch exceptions can contain URLs.
    job.reason =
      error instanceof TransferError
        ? error.message
        : "Transfer interrupted. Check the connection and resume the queue.";
    job.retryAt =
      Date.now() + Math.min(30, 2 ** Math.min(job.attempts - 1, 5)) * 60_000;
    await checkpoint(jobDownload(job));
  }
}
