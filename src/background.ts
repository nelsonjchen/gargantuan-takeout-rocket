/**
 * This is a background script
 * It is running in the background process of chrome
 * You can debug it by clicking the "background page"
 * button in the extension settings
 *
 */

import { sourceToGtrProxySource, transload } from "./transload";
import { Download, State } from "./state";

console.log("initialized gtr extension");

function getState(): Promise<State> {
  // Immediately return a promise and start asynchronous work
  return new Promise((resolve, reject) => {
    // Asynchronously fetch all data from storage.sync.
    chrome.storage.local.get("state", (result) => {
      // Pass any observed errors down the promise chain.
      if (chrome.runtime.lastError) {
        return reject(chrome.runtime.lastError);
      }
      const state = result.state as State;
      resolve(state);
    });
  });
}

async function captureDownload(
  downloadItem: chrome.downloads.DownloadItem,
  suggestion: Function
) {
  const state = await getState();
  if (!state.enabled) {
    console.log("Skipping interception of download.");
    return;
  }

  console.log("download started:", downloadItem);
  console.log("final url:", downloadItem.finalUrl);
  console.log("filename:", downloadItem.filename);
  chrome.downloads.cancel(downloadItem.id);
  console.log("chrome native download cancelled:", downloadItem);
  const sas = state.azureSasUrl;
  console.log("Azure sas:", sas);

  // Add download to pending
  const pendingDownload: Download = {
    name: downloadItem.filename,
    status: "pending"
  };
  const preDownloadsState = await getState();
  await chrome.storage.local.set({
    state: (() => {
      const downloads = { ...preDownloadsState.downloads };
      downloads[pendingDownload.name] = pendingDownload;
      return {
        ...preDownloadsState,
        downloads
      };
    })()
  });
  let download: Download;
  try {
    download = await transload(
      sourceToGtrProxySource(downloadItem.finalUrl),
      sas,
      downloadItem.filename
    );
  } catch (err) {
    download = {
      name: downloadItem.filename,
      status: "failed"
    };
    if (err instanceof Error) {
      download["reason"] = err.message;
    }
  }

  const updateDownloadsState = await getState();
  await chrome.storage.local.set({
    state: (() => {
      const downloads = { ...updateDownloadsState.downloads };
      downloads[download.name] = download;
      return {
        ...updateDownloadsState,
        downloads
      };
    })()
  });
  console.log("Transload complete");
}

//  Stop all the downloading
chrome.downloads.onDeterminingFilename.addListener(captureDownload);
