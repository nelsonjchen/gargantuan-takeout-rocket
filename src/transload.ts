import {
  BlobServiceClient,
  ContainerClient,
  StorageSharedKeyCredential
} from "@azure/storage-blob";
import fetch from "node-fetch";

interface TransloadOptions {}

interface JobPlan {
  chunks: {
    start: number;
    size: number;
  }[];
  length: number;
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
  options: TransloadOptions = {}
) {
  console.log(`Transloading ${source} to ${destination}`);
  const containerClient = new ContainerClient(destination);
  console.log("Stuff:");
  for await (const blob of containerClient.listBlobsFlat()) {
    console.log(`- ${blob.name}`);
  }
  const blobClient = containerClient.getBlobClient("test.dat");
  // await blobClient.beginCopyFromURL
  // console.log(`Copied ${source} to ${destination}`);
}
