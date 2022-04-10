/**
 * This is a background script
 * It is running in the background process of chrome
 * You can debug it by clicking the "background page"
 * button in the extension settings
 *
 */

import { sourceToGtrProxySource, transload } from "./transload";
import { State } from "./state";

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
    console.log("Skipping inter");
    return;
  }

  console.log("download started:", downloadItem);
  console.log("final url:", downloadItem.finalUrl);
  console.log("filename:", downloadItem.filename);
  chrome.downloads.cancel(downloadItem.id);
  console.log("download cancelled:", downloadItem);
  const sas = state.azureSasUrl;
  console.log("SAS currently is " + sas);
  const download = await transload(
    sourceToGtrProxySource(downloadItem.finalUrl),
    sas,
    downloadItem.filename
  );
  chrome.storage.sync.set({
    state: (() => {
      const downloads = { ...state.downloads };
      downloads[download.name] = download;
      return {
        ...state,
        downloads
      };
    })()
  });
  console.log("Transload complete");
}

//  Stop all the downloading
chrome.downloads.onDeterminingFilename.addListener(captureDownload);
