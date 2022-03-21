/**
 * This is a background script
 * It is running in the background process of chrome
 * You can debug it by clicking the "background page"
 * button in the extension settings
 *
 */

import { sourceToGtrProxySource, transload } from "./transload";

console.log("initialized gtr extension");

export {};

async function captureDownload(
  downloadItem: chrome.downloads.DownloadItem,
  suggestion: Function
) {
  console.log("download started:", downloadItem);
  suggestion();
  console.log("final url:", downloadItem.finalUrl);
  console.log("filename:", downloadItem.filename);
  chrome.downloads.cancel(downloadItem.id);
  console.log("download cancelled:", downloadItem);
  chrome.storage.sync.get("sas", async function (result) {
    let sas = result.sas;
    console.log("Value currently is " + sas);
    await transload(
      sourceToGtrProxySource(downloadItem.finalUrl),
      sas,
      downloadItem.filename
    );
    console.log("Transload complete");
  });
}

//  Stop all the downloading
chrome.downloads.onDeterminingFilename.addListener(captureDownload);
