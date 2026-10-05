import { ContainerClient } from "./jeContainerClient";
import "isomorphic-fetch";
import { v4 as uuidv4 } from "uuid";
import { btoa } from "abab";
import { Download } from "./state";

const built_in_proxy_base = "https://gtr-proxy.677472.xyz";

interface JobPlan {
  chunks: {
    blockId: string;
    start: number;
    size: number;
  }[];
  length: number;
}

export function sourceToGtrProxySource(
  source: string,
  proxyBase?: string,
  encodedCookies?: string
): string {
  if (!proxyBase) {
    proxyBase = built_in_proxy_base;
  }
  // Replace all %2F with %252F and remove scheme
  const url = source.replace(/%2F/g, "%252F").replace(/https?:\/\//, "");

  let proxyUrl = `${proxyBase}/p/${url}`;
  if (encodedCookies) {
    const separator = proxyUrl.includes("?") ? "&" : "?";
    proxyUrl += `${separator}a=${encodeURIComponent(encodedCookies)}`;
  }

  // Azure imposes a 2 KiB limit on the length of the source URL in
  // the Put Blob From Url API.
  if (proxyUrl.length > 2048) {
    throw new Error(
      `Proxy URL length (${proxyUrl.length}) exceeds the maximum of 2048 bytes.`
    );
  }

  return proxyUrl;
}

export async function createJobPlan(
  source_url: string,
  chunk_size_mb?: number
): Promise<JobPlan> {
  if (chunk_size_mb === undefined) {
    chunk_size_mb = 3000;
  }
  const chunkSize = chunk_size_mb * 1024 * 1024;
  if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) {
    throw new Error("Chunk size must be a positive whole number of bytes");
  }
  // Fetch HEAD of source
  const resp = await fetch(source_url, {
    method: "HEAD"
  });
  if (!resp.ok) {
    throw new Error(`Failed to inspect source: HTTP ${resp.status}`);
  }
  const content_length_header = resp.headers.get("content-length");
  if (!content_length_header) {
    throw new Error("No content-length header");
  }
  const length = Number(content_length_header);
  if (
    !/^\d+$/.test(content_length_header) ||
    !Number.isSafeInteger(length) ||
    length <= 0
  ) {
    throw new Error("Source content-length must be a positive safe integer");
  }

  console.log(`Got length bytes: ${length}`);

  // Divide into chunks
  const numChunks = Math.ceil(length / chunkSize);
  console.log(`Will divide into ${numChunks} chunks`);
  let chunks = [];
  for (let i = 0; i < length; i += chunkSize)
    chunks.push({
      blockId: btoa(uuidv4())!,
      start: i,
      size: Math.min(length - i, chunkSize)
    });
  return {
    chunks: chunks,
    length
  };
}

export interface TransferProgress {
  phase: "copying" | "committing";
  transferredBytes: number;
  totalBytes: number;
  completedBlocks: number;
  totalBlocks: number;
}

export async function transload(
  sourceUrl: string,
  destination: string,
  name: string,
  proxyBase?: string,
  chunk_size_mb?: number,
  onProgress?: (progress: TransferProgress) => Promise<void> | void
): Promise<Download> {
  console.log(`Transloading ${name}`);

  const containerClient = new ContainerClient(destination);
  if (!proxyBase) {
    proxyBase = built_in_proxy_base;
  }
  const blobClient = containerClient.getBlockBlobClient(name, proxyBase);
  const jobPlan = await createJobPlan(sourceUrl, chunk_size_mb);
  let transferredBytes = 0;
  let completedBlocks = 0;
  let acceptingProgress = true;
  const reportProgress = (phase: TransferProgress["phase"]) =>
    onProgress?.({
      phase,
      transferredBytes,
      totalBytes: jobPlan.length,
      completedBlocks,
      totalBlocks: jobPlan.chunks.length
    });
  await reportProgress("copying");
  console.log(`Got job plan: `, jobPlan);
  console.log(`Staging Blocks`);
  const responses = jobPlan.chunks.map(async (chunk) => {
    const response = await blobClient.stageBlockFromURL(
      chunk.blockId,
      sourceUrl,
      chunk.start,
      chunk.size
    );
    if (acceptingProgress) {
      transferredBytes += chunk.size;
      completedBlocks += 1;
      await reportProgress("copying");
    }
    return response;
  });
  const results = await Promise.all(responses).catch((error) => {
    acceptingProgress = false;
    throw error;
  });
  console.log(`Staged ${results.length} blocks`);
  console.log(`Committing Block List`);
  await reportProgress("committing");
  const commitResp = await blobClient.commitBlockList(
    jobPlan.chunks.map((c) => c.blockId)
  );
  console.log(`Blocklist committed with status ${commitResp.status}`);

  console.log(`Committed Block List`);

  console.log(`Transloaded ${name}`);
  return { name, status: "complete", size: jobPlan.length };
}
