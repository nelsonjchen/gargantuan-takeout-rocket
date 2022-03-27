// Just Enough ContainerClient
// A reimplementation of the Azure Storage ContainerClient that only supports
// the methods we need.

import fetch from "node-fetch";
import { Response } from "node-fetch";

export class ContainerClient {
  constructor(public readonly containerUrl: string) {
    containerUrl = containerUrl;
  }

  getBlockBlobClient(blobName: string): BlockBlobClient {
    return new BlockBlobClient(this, blobName);
  }
}

export class BlockBlobClient {
  constructor(
    public readonly containerClient: ContainerClient,
    public readonly blobName: string
  ) {
    containerClient = containerClient;
    blobName = blobName;
  }

  async stageBlockFromURL(
    blockId: string,
    sourceUrl: string,
    offset: number,
    count: number
  ): Promise<Response> {
    console.log(`Staging block ${blockId} from ${sourceUrl}`);
    const containerUrl = new URL(this.containerClient.containerUrl);
    const blobUrl = new URL(
      containerUrl.protocol +
        "//" +
        containerUrl.host +
        containerUrl.pathname +
        `/${this.blobName}` +
        containerUrl.search +
        `&blockid=${blockId}` +
        `&comp=block`
    );
    const resp = fetch(blobUrl.toString(), {
      method: "PUT",
      headers: {
        "x-ms-version": "2020-10-02",
        "x-ms-source-range": `bytes=${offset}-${offset + count - 1}`,
        "x-ms-copy-source": sourceUrl
      }
    });
    return resp;
  }

  async commitBlockList(blocks: string[]): Promise<Response> {
    console.log(`Committing block list: ${blocks}`);
    const containerUrl = new URL(this.containerClient.containerUrl);
    const blobUrl = new URL(
      containerUrl.protocol +
        "//" +
        containerUrl.host +
        containerUrl.pathname +
        `/${this.blobName}` +
        containerUrl.search +
        `&comp=blocklist`
    );
    const data = `<?xml version="1.0" encoding="utf-8"?>
<BlockList>
${blocks.map((blockId) => `<Latest>${blockId}</Latest>`).join("\n")}
</BlockList>`;

    const resp = fetch(blobUrl.toString(), {
      method: "PUT",
      body: data,
      headers: {
        "x-ms-version": "2020-10-02"
      }
    });

    return resp;
  }
}
