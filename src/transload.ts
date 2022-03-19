import { BlobServiceClient, ContainerClient, StorageSharedKeyCredential } from "@azure/storage-blob";

interface TransloadOptions { }

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
}
