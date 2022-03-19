import {
  BlobServiceClient,
  ContainerClient,
  StorageSharedKeyCredential
} from "@azure/storage-blob";
import fetch from "node-fetch";

interface TransloadOptions {}

export async function createJobPlan(source: string) {
  // Fetch HEAD of source
  const headers = await fetch(source, {
    method: "HEAD"
  });
  console.log(headers);
}

export async function transload(
  source: string,
  destination: string,
  options: TransloadOptions = {}
) {
  console.log(`Transloading ${source} to ${destination}`);
  const containerClient = new ContainerClient(destination);
  console.log("Stuf:");
  for await (const blob of containerClient.listBlobsFlat()) {
    console.log(`- ${blob.name}`);
  }
  const blobClient = containerClient.getBlobClient("test.dat");
  // await blobClient.beginCopyFromURL
  // console.log(`Copied ${source} to ${destination}`);
}
