import { QueueBackend, TransferError } from "./transferQueue";
import { sourceToGtrProxySource } from "./transload";
import { azBlobSASUrlToProxyPathname } from "./azb";

// Includes response-body reads: slow bodies must not leave a slot stuck forever.
export async function boundedRequest(
  url: string,
  init: RequestInit = {},
  timeoutMs = 25_000
): Promise<{ status: number; headers: Headers; body: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return {
      status: response.status,
      headers: response.headers,
      body: await response.text()
    };
  } catch {
    throw new TransferError(
      "Network request timed out or was interrupted; Azure will be reconciled before retrying.",
      true
    );
  } finally {
    clearTimeout(timer);
  }
}

const SAFE_AZURE_ERRORS = new Set([
  "CannotVerifyCopySource",
  "OperationTimedOut",
  "ServerBusy",
  "InternalError",
  "PendingCopyOperation",
  "BlobOperationNotSupported",
  "CopySourceAuthorizationFailure",
  "SourceConditionNotMet",
  "ResourceAlreadyExists",
  "InvalidBlock",
  "InvalidBlockList",
  "InvalidSourceBlobType",
  "BlobArchived",
  "AuthorizationFailure",
  "CannotChangeToLowerTier"
]);
function check(status: number, service: string, azureCode?: string | null) {
  if (status >= 200 && status < 300) return;
  if (status === 401 || status === 403)
    throw new TransferError(
      `${service} authorization is required. Renew access or sign in, then resume.`
    );
  if (status === 412)
    throw new TransferError(
      "A destination blob already exists. No data was overwritten; resume to reconcile the commit.",
      true
    );
  throw new TransferError(
    `${service} returned HTTP ${status}${
      azureCode && SAFE_AZURE_ERRORS.has(azureCode) ? ` (${azureCode})` : ""
    }`,
    status === 408 || status === 409 || status === 429 || status >= 500
  );
}

export function parseBlockList(xml: string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const match of xml.matchAll(
    /<Block>\s*<Name>([A-Za-z0-9+/=]+)<\/Name>\s*<Size>(\d+)<\/Size>\s*<\/Block>/g
  )) {
    const size = Number(match[2]);
    if (Number.isSafeInteger(size) && size > 0) result[match[1]] = size;
  }
  return result;
}

export function queueBackend(
  container: string,
  proxy: string,
  cookies: (url: string) => Promise<string>,
  timeoutMs = 25_000
): QueueBackend {
  const request = (url: string, init: RequestInit = {}) =>
    boundedRequest(url, init, timeoutMs);
  const blobUrl = (name: string, params: Record<string, string> = {}) => {
    const url = new URL(container);
    url.pathname =
      url.pathname.replace(/\/$/, "") +
      "/" +
      name.split("/").map(encodeURIComponent).join("/");
    for (const [key, value] of Object.entries(params))
      url.searchParams.set(key, value);
    return url;
  };
  const sourceUrl = async (source: string) =>
    sourceToGtrProxySource(source, proxy, await cookies(source));
  return {
    async inspectSource(source) {
      const r = await request(await sourceUrl(source), {
        method: "HEAD"
      });
      check(r.status, "Google source");
      const contentType = r.headers.get("content-type") || "";
      if (/text\/html/i.test(contentType))
        throw new TransferError(
          "Google returned a sign-in page. Complete Google sign-in before resuming."
        );
      const length = r.headers.get("content-length") || "";
      if (!/^\d+$/.test(length))
        throw new TransferError(
          "Source did not provide an archive content-length"
        );
      return Number(length);
    },
    async inspectBlob(name) {
      const r = await request(blobUrl(name).toString(), {
        method: "HEAD",
        headers: { "x-ms-version": "2021-08-06" }
      });
      if (r.status === 404) return undefined;
      check(r.status, "Azure");
      return {
        size: Number(r.headers.get("content-length")),
        jobId: r.headers.get("x-ms-meta-gtr_job") || undefined
      };
    },
    async stagedBlocks(name) {
      const r = await request(
        blobUrl(name, { comp: "blocklist", blocklisttype: "all" }).toString(),
        { headers: { "x-ms-version": "2021-08-06" } }
      );
      if (r.status === 404) return {};
      check(r.status, "Azure");
      return parseBlockList(r.body);
    },
    async stage(name, id, source, start, size) {
      const url = azBlobSASUrlToProxyPathname(
        blobUrl(name, { comp: "block", blockid: id }),
        proxy
      );
      const r = await request(url.toString(), {
        method: "PUT",
        body: "",
        headers: {
          "x-ms-version": "2021-08-06",
          "x-ms-copy-source": await sourceUrl(source),
          "x-ms-source-range": `bytes=${start}-${start + size - 1}`
        }
      });
      check(r.status, "Azure copy", r.headers.get("x-ms-error-code"));
    },
    async commit(name, blocks, jobId) {
      const r = await request(blobUrl(name, { comp: "blocklist" }).toString(), {
        method: "PUT",
        headers: {
          "x-ms-version": "2021-08-06",
          "Content-Type": "application/xml",
          "If-None-Match": "*",
          "x-ms-meta-gtr_job": jobId
        },
        body: `<?xml version="1.0" encoding="utf-8"?><BlockList>${blocks
          .map((id) => `<Latest>${id}</Latest>`)
          .join("")}</BlockList>`
      });
      check(r.status, "Azure commit");
    }
  };
}
