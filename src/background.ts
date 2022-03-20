/**
 * This is a background script
 * It is running in the background process of chrome
 * You can debug it by clicking the "background page"
 * button in the extension settings
 *
 */

console.log("initialized gtr extension");

export {};

function captureDownload(
  downloadItem: chrome.downloads.DownloadItem,
  suggestion: Function
) {
  console.log("download started:", downloadItem);
  suggestion();
  console.log("final url:", downloadItem.finalUrl);
  console.log("filename:", downloadItem.filename);
  chrome.downloads.cancel(downloadItem.id);
  console.log("download cancelled:", downloadItem);
}

//  Stop all the downloading
chrome.downloads.onDeterminingFilename.addListener(captureDownload);
