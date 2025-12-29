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
  proxyBase?: string
): string {
  if (proxyBase === undefined) {
    proxyBase = built_in_proxy_base;
  }
  if (proxyBase === "") {
    return source;
  }
  // Replace all %2F with %252F and remove scheme
  const url = source.replace(/%2F/g, "%252F").replace(/https?:\/\//, "");

  return `${proxyBase}/p/${url}`;
}

export async function createJobPlan(
  source_url: string,
  options?: { chunk_size_mb?: number; cookies?: string }
): Promise<JobPlan> {
  const chunk_size_mb = options?.chunk_size_mb ?? 1000;
  const cookies = options?.cookies;

  // Fetch HEAD of source
  const fetchOptions: RequestInit = {
    method: "HEAD",
    headers: {
      "Range": "bytes=0-0"
    }
  };

  if (cookies) {
    // Note: Cookie header might be stripped by browser, but we leave it for compatibility if environment allows
    (fetchOptions.headers as Record<string, string>)["Cookie"] = cookies;
  }

  const resp = await fetch(source_url, fetchOptions);

  let length = 0;
  const content_range = resp.headers.get("content-range");
  if (content_range) {
    const match = content_range.match(/\/(\d+)$/);
    if (match) {
      length = parseInt(match[1]);
    }
  }

  if (!length) {
    const content_length_header = resp.headers.get("content-length");
    if (content_length_header) {
      length = parseInt(content_length_header);
    }
  }

  if (!length) {
    throw new Error("No content-length or content-range header");
  }

  console.log(`Got length bytes: ${length}`);

  // Divide into chunks
  const chunkSize = chunk_size_mb * 1024 * 1024;
  const numChunks = Math.floor(length / chunkSize);
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

export async function transload(
  sourceUrl: string,
  destination: string,
  name: string,
  proxyBase?: string,
  options?: { chunk_size_mb?: number; cookies?: string }
): Promise<Download> {
  console.log(`Transloading ${sourceUrl} to ${destination}`);

  const containerClient = new ContainerClient(destination);
  if (proxyBase === undefined) {
    proxyBase = built_in_proxy_base;
  }
  const blobClient = containerClient.getBlockBlobClient(name, proxyBase);
  const jobPlan = await createJobPlan(sourceUrl, options);
  console.log(`Got job plan: `, jobPlan);
  console.log(`Staging Blocks`);
  const responses = jobPlan.chunks.map(async (chunk) =>
    blobClient.stageBlockFromURL(
      chunk.blockId,
      sourceUrl,
      chunk.start,
      chunk.size
    )
  );
  const results = await Promise.all(responses);
  console.log(`Staged blocks: `, results);
  console.log(`Committing Block List`);
  const commitResp = await blobClient.commitBlockList(
    jobPlan.chunks.map((c) => c.blockId)
  );
  console.log(`Blocklist: `, commitResp);

  console.log(`Committed Block List`);

  console.log(`Transloaded ${sourceUrl} to ${destination}`);
  return { name, status: "complete", size: jobPlan.length };
}
