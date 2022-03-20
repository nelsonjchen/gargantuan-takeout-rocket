/**
 * This is a background script
 * It is running in the background process of chrome
 * You can debug it by clicking the "background page"
 * button in the extension settings
 *
 */

console.log("Initialized GTR Extension");

export {};

function captureDownload(
  downloadItem: chrome.downloads.DownloadItem,
  suggestion: Function
) {
  console.log("Download started", downloadItem);
  suggestion();
  console.log("Got final URL", downloadItem.finalUrl);
  chrome.downloads.cancel(downloadItem.id);
  console.log("Download cancelled", downloadItem);
}

//  Stop all the downloading
chrome.downloads.onDeterminingFilename.addListener(captureDownload);
