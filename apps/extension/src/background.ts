/**
 * This is a background script
 * It is running in the background process of chrome
 * You can debug it by clicking the "background page"
 * button in the extension settings
 *
 */

import { sourceToGtrProxySource, transload } from "./transload";
import { Download } from "./state";
import { validateTransloadConfig } from "./config";
export { validateTransloadConfig } from "./config";
import prettyBytes from "pretty-bytes";
import pako from "pako";

console.log("initialized gtr extension");

const takeoutDownloadHosts = new Set([
  "apidata.googleusercontent.com",
  "storage.googleapis.com",
  "takeout.google.com",
  "takeout-download.usercontent.google.com",
  "gtr-cf-test-origin.677472.xyz",
  "gtr-test.677472.xyz"
]);

function getConfig(): Promise<[boolean, string, string]> {
  // Immediately return a promise and start asynchronous work
  return new Promise((resolve, reject) => {
    // Asynchronously fetch all data from storage.sync.
    chrome.storage.local.get(
      ["enabled", "azureSasUrl", "proxyBaseUrl"],
      (result) => {
        // Pass any observed errors down the promise chain.
        if (chrome.runtime.lastError) {
          return reject(chrome.runtime.lastError);
        }
        const enabled = result.enabled as boolean;
        const azureSasUrl = result.azureSasUrl as string;
        const proxyBaseUrl = result.proxyBaseUrl as string;
        resolve([enabled, azureSasUrl, proxyBaseUrl]);
      }
    );
  });
}

function getDownloads(): Promise<{ [key: string]: Download }> {
  // Immediately return a promise and start asynchronous work
  return new Promise((resolve, reject) => {
    // Asynchronously fetch all data from storage.sync.
    chrome.storage.local.get("downloads", (result) => {
      // Pass any observed errors down the promise chain.
      if (chrome.runtime.lastError) {
        return reject(chrome.runtime.lastError);
      }
      const state = result.downloads as { [key: string]: Download };
      resolve(state);
    });
  });
}

export function getEncodedCookies(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.cookies.getAll({ url }, (cookies) => {
      if (chrome.runtime.lastError) {
        return reject(chrome.runtime.lastError);
      }
      // Skip NID cookie since it is very large and not needed for Google Takeout requests.
      const filteredCookies = cookies.filter((cookie) => cookie.name !== "NID");
      const cookieString = filteredCookies
        .map((cookie) => `${cookie.name}=${cookie.value}`)
        .join("; ");
      const compressedData = pako.gzip(cookieString);
      const b64encoded_string = btoa(
        String.fromCharCode(...new Uint8Array(compressedData))
      );
      resolve(b64encoded_string);
    });
  });
}

export function isEligibleDownloadUrl(url: string | undefined): boolean {
  if (!url) {
    return false;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch (err) {
    return false;
  }

  if (!takeoutDownloadHosts.has(parsedUrl.hostname)) {
    return false;
  }

  if (
    parsedUrl.hostname === "gtr-cf-test-origin.677472.xyz" ||
    parsedUrl.hostname === "gtr-test.677472.xyz"
  ) {
    return true;
  }

  if (parsedUrl.hostname === "apidata.googleusercontent.com") {
    return (
      parsedUrl.pathname.startsWith(
        "/download/storage/v1/b/dataliberation/o/"
      ) || parsedUrl.pathname.startsWith("/download/storage/v1/b/takeout")
    );
  }

  if (parsedUrl.hostname === "storage.googleapis.com") {
    return parsedUrl.pathname.startsWith("/takeout-");
  }

  return (
    parsedUrl.pathname.startsWith("/takeout/download") ||
    parsedUrl.pathname.startsWith("/download")
  );
}

const activeTransfers = new Map<number, string>();
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "gtr-active-transfers") {
    sendResponse({ names: Array.from(activeTransfers.values()) });
  }
});

// Serialize read/modify/write updates so parallel archives retain each other's state.
let downloadWrites: Promise<void> = Promise.resolve();
function saveDownload(download: Download): Promise<void> {
  const write = downloadWrites.then(async () => {
    const downloads = await getDownloads();
    await new Promise<void>((resolve, reject) => {
      chrome.storage.local.set(
        { downloads: { ...downloads, [download.name]: download } },
        () => {
          if (chrome.runtime.lastError)
            reject(new Error("Could not save transfer status"));
          else resolve();
        }
      );
    });
  });
  downloadWrites = write.catch(() => {});
  return write;
}

export async function captureDownload(
  downloadItem: chrome.downloads.DownloadItem,
  suggest: (suggestion?: chrome.downloads.DownloadFilenameSuggestion) => void
) {
  let filenameReleased = false;
  const releaseFilename = () => {
    if (!filenameReleased) {
      filenameReleased = true;
      suggest();
    }
  };
  try {
    await captureDownloadInternal(downloadItem, releaseFilename);
  } finally {
    activeTransfers.delete(downloadItem.id);
    releaseFilename();
  }
}

async function captureDownloadInternal(
  downloadItem: chrome.downloads.DownloadItem,
  releaseFilename: () => void
) {
  const [enabled, azureSasUrl, proxyBaseUrl] = await getConfig();
  if (!enabled) {
    console.log("Skipping interception of download.");
    return;
  }

  const sourceUrl = downloadItem.finalUrl || downloadItem.url;
  if (!isEligibleDownloadUrl(sourceUrl)) {
    console.log("Skipping interception of ineligible download.", {
      id: downloadItem.id,
      filename: downloadItem.filename
    });
    return;
  }

  const configError = validateTransloadConfig(azureSasUrl, proxyBaseUrl);
  if (configError) {
    console.log("Skipping interception because settings are invalid.", {
      id: downloadItem.id,
      filename: downloadItem.filename,
      reason: configError
    });
    return;
  }

  activeTransfers.set(downloadItem.id, downloadItem.filename);
  console.log("download started:", {
    id: downloadItem.id,
    filename: downloadItem.filename
  });
  chrome.notifications.create(`transload-start-${downloadItem.filename}`, {
    title: "🚀 GTR Transload Started",
    message: `⏳ ${downloadItem.filename} started (disable interception in extension popup)`,
    type: "basic",
    iconUrl: "/logo512.png",
    priority: 0
  });
  chrome.downloads.cancel(downloadItem.id);
  releaseFilename();
  console.log("chrome native download cancelled:", {
    id: downloadItem.id,
    filename: downloadItem.filename
  });
  const sas = azureSasUrl.trim();
  const proxyBase = proxyBaseUrl?.trim();

  // Add download to pending
  const pendingDownload: Download = {
    name: downloadItem.filename,
    status: "pending",
    phase: "inspecting",
    startedAt: Date.now(),
    updatedAt: Date.now()
  };
  await saveDownload({ ...pendingDownload });

  let download: Download;
  let prettySpeed: string = "";
  try {
    const now = new Date();

    // gzip + base64 encode cookies
    const encodedCookies = await getEncodedCookies(sourceUrl);

    download = await transload(
      sourceToGtrProxySource(sourceUrl, proxyBase, encodedCookies),
      sas,
      downloadItem.filename,
      proxyBase,
      undefined,
      async (progress) => {
        Object.assign(pendingDownload, progress, { updatedAt: Date.now() });
        await saveDownload({ ...pendingDownload });
      }
    );
    const then = new Date();
    const duration = then.getTime() - now.getTime();
    if (download.size) {
      prettySpeed = `${prettyBytes(download.size)} @ ${prettyBytes(
        (download.size / duration) * 1000
      )}/s`;
    }
    download["reason"] = prettySpeed;
  } catch (err) {
    download = {
      name: downloadItem.filename,
      status: "failed"
    };
    if (err instanceof Error) {
      download["reason"] = err.message;
    }
  }

  await saveDownload({
    ...pendingDownload,
    ...download,
    updatedAt: Date.now()
  });
  chrome.notifications.clear(`transload-start-${downloadItem.filename}`);
  if (download.status === "complete") {
    chrome.notifications.create(`transload-complete-${downloadItem.filename}`, {
      title: "🚀 GTR Transload Complete",
      message: `✅ ${downloadItem.filename} complete (${prettySpeed}) (disable interception in extension popup)`,
      type: "basic",
      iconUrl: "/logo512.png",
      priority: 0
    });
  } else {
    chrome.notifications.create(`transload-failed-${downloadItem.filename}`, {
      title: "🚀 GTR Transload Failed",
      message: `❌ ${downloadItem.filename} failed (disable interception in extension popup)`,
      type: "basic",
      iconUrl: "/logo512.png",
      priority: 0
    });
  }
  console.log("Transload complete");
}

export function determineFilename(
  downloadItem: chrome.downloads.DownloadItem,
  suggest: (suggestion?: chrome.downloads.DownloadFilenameSuggestion) => void
): boolean {
  void captureDownload(downloadItem, suggest).catch(() => {
    console.error("Failed to process download interception");
  });
  // Chrome requires an explicit true when suggest is called asynchronously.
  return true;
}

chrome.downloads.onDeterminingFilename.addListener(determineFilename);
