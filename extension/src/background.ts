/**
 * This is a background script
 * It is running in the background process of chrome
 * You can debug it by clicking the "background page"
 * button in the extension settings
 *
 */

import { sourceToGtrProxySource, transload } from "./transload";
import { Download } from "./state";
import prettyBytes from "pretty-bytes";

console.log("initialized gtr extension");


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

async function captureDownload(
  downloadItem: chrome.downloads.DownloadItem,
  suggestion: Function
) {
  const [enabled, azureSasUrl, proxyBaseUrl] = await getConfig();
  if (!enabled) {
    console.log("Skipping interception of download.");
    return;
  }

  console.log("download started:", downloadItem);
  console.log("final url:", downloadItem.finalUrl);
  console.log("filename:", downloadItem.filename);
  chrome.notifications.create(`transload-start-${downloadItem.filename}`, {
    title: "🚀 GTR Transload Started",
    message: `⏳ ${downloadItem.filename} started (disable interception in extension popup)`,
    type: "basic",
    iconUrl: "/logo512.png",
    priority: 0
  });
  chrome.downloads.cancel(downloadItem.id);
  console.log("chrome native download cancelled:", downloadItem);
  const sas = azureSasUrl;
  console.log("Azure sas:", sas);

  // Add download to pending
  const pendingDownload: Download = {
    name: downloadItem.filename,
    status: "pending"
  };
  const preDownloadsState = await getDownloads();
  await chrome.storage.local.set({
    downloads: (() => {
      const downloads = { ...preDownloadsState };
      downloads[pendingDownload.name] = pendingDownload;
      return downloads;
    })()
  });

  let download: Download;
  let prettySpeed: string = "";
  try {
    const now = new Date();
    download = await transload(
      sourceToGtrProxySource(downloadItem.finalUrl, proxyBaseUrl),
      sas,
      downloadItem.filename,
      proxyBaseUrl
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

  const updateDownloadsState = await getDownloads();
  await chrome.storage.local.set({
    downloads: (() => {
      const downloads = { ...updateDownloadsState };
      downloads[download.name] = download;
      return downloads;
    })()
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

//  Stop all the downloading
chrome.downloads.onDeterminingFilename.addListener(captureDownload);
