import { ContainerClient } from "./jeContainerClient";
import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid";
import { btoa } from "abab";

interface TransloadOptions {}

interface JobPlan {
  chunks: {
    blockId: string;
    start: number;
    size: number;
  }[];
  length: number;
}

export function sourceToGtrProxySource(source: string): string {
  const base = "https://gtr-proxy.mindflakes.com/p/";
  const url = btoa(source);
  return `${base}${url}`;
}

export async function createJobPlan(source: string): Promise<JobPlan> {
  // Fetch HEAD of source
  const resp = await fetch(source, {
    method: "HEAD"
  });
  const length = parseInt(resp.headers.get("content-length") || "0");
  if (!length) {
    throw new Error("No content-length header");
  }
  console.log(`Got length bytes: ${length}`);

  // Divide into 100MB chunks
  const chunkSize = 100 * 1024 * 1024;
  const numChunks = Math.floor(length / chunkSize);
  console.log(`Will divide into ${numChunks} chunks`);
  let chunks = [];
  for (var i = 0; i <= length; i += chunkSize)
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
  source: string,
  destination: string,
  name: string,
  options: TransloadOptions = {}
) {
  console.log(`Transloading ${source} to ${destination}`);
  const containerClient = new ContainerClient(destination);
  const blobClient = containerClient.getBlockBlobClient(name);
  const jobPlan = await createJobPlan(source);
  console.log(`Got job plan: `, jobPlan);
  console.log(`Staging Blocks`);
  const responses = jobPlan.chunks.map(async (chunk) =>
    blobClient.stageBlockFromURL(chunk.blockId, source, chunk.start, chunk.size)
  );
  const results = await Promise.all(responses);
  console.log(`Staged blocks: `, results);
  console.log(`Committing Block List`);
  const commitResp = await blobClient.commitBlockList(
    jobPlan.chunks.map((c) => c.blockId)
  );
  console.log(`Blocklist: `, commitResp);

  console.log(`Committed Block List`);
  // await blobClient.beginCopyFromURL
  // console.log(`Copied ${source} to ${destination}`);
}
