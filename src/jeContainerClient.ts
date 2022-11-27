// Just Enough ContainerClient
// A reimplementation of the Azure Storage ContainerClient that only supports
// the methods we need.
//
// Also modified to allow replacing the URL with a gtr-proxy base URL as an
// option.

import "isomorphic-fetch";
import fetchBuilder from "fetch-retry";
import { azBlobSASUrlToProxyPathname } from "./azb";

const fetch = fetchBuilder(globalThis.fetch);

export class ContainerClient {
  constructor(public readonly containerUrl: string) {
    containerUrl = containerUrl;
  }

  getBlockBlobClient(blobName: string, gtrProxyBase?: string): BlockBlobClient {
    return new BlockBlobClient(this, blobName, gtrProxyBase);
  }
}

export class BlockBlobClient {
  constructor(
    public readonly containerClient: ContainerClient,
    public readonly blobName: string,
    public readonly gtrProxyBase?: string
  ) {
    containerClient = containerClient;
    blobName = blobName;
    gtrProxyBase = gtrProxyBase;
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

    let fetchBlobUrl;
    if (this.gtrProxyBase) {
      fetchBlobUrl = azBlobSASUrlToProxyPathname(blobUrl, this.gtrProxyBase);
    } else {
      fetchBlobUrl = blobUrl;
    }

    const resp = await fetch(fetchBlobUrl.toString(), {
      method: "PUT",
      retries: 0,
      retryDelay: 1000,
      retryOn: [409, 520, 524],
      headers: {
        "x-ms-version": "2021-08-06",
        "x-gtr-copy-source": sourceUrl
      }
    });
    if (resp.ok) {
      return resp;
    }
    const text = await resp.text();
    throw new Error(`Failed to stage block: ${resp.status} ${text}`);
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

    const resp = await fetch(blobUrl.toString(), {
      method: "PUT",
      body: data,
      headers: {
        "x-ms-version": "2020-10-02"
      }
    });

    if (resp.ok) {
      return resp;
    }
    throw new Error(`Failed to commit block list: ${resp.status}`);
  }
}
