/**
 * This is a background script
 * It is running in the background process of chrome
 * You can debug it by clicking the "background page"
 * button in the extension settings
 *
 */

import { QueueRuntime, readLocal, writeLocal } from "./queueRuntime";
import { Download } from "./state";
import { validateTransloadConfig } from "./config";
export { validateTransloadConfig } from "./config";
import pako from "pako";
import { ExportAutomation, exportPage } from "./exportAutomation";
import { handoffNewDownload } from "./agentHandoff";
import { v4 as uuid } from "uuid";

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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type?.startsWith("gtr-export-")) {
    const page = exportPage(sender.url || "");
    if (!page || sender.id !== chrome.runtime.id || sender.frameId !== 0)
      return;
    void runAutomation(async () => {
      if (message.type === "gtr-export-start")
        return automation.start(page, message.parts);
      if (message.type === "gtr-export-pause") {
        await automation.pause();
        return "New parts paused. Captured transfers can continue.";
      }
      if (message.type === "gtr-export-tick") return automation.tick();
      return "Unknown export action";
    })
      .then((notice) => sendResponse({ notice }))
      .catch(() =>
        sendResponse({
          notice:
            "Export queue could not be updated. No uncertain download will be retried automatically."
        })
      );
    return true;
  }
  // Controls belong to this extension's UI, never arbitrary webpages.
  if (sender.url && !sender.url.startsWith(chrome.runtime.getURL(""))) return;
  if (message?.type === "gtr-active-transfers") {
    sendResponse({ names: Array.from(queue.active) });
    return;
  }
  if (message?.type === "gtr-queue-status") {
    void Promise.all([queue.jobs(), readLocal(["queuePaused", "downloads"])])
      .then(([jobs, settings]) => {
        sendResponse({
          paused: !!settings.queuePaused,
          legacy: Object.values(settings.downloads || {})
            .filter(
              (d: any) =>
                d.status === "pending" && !jobs.some((j) => j.name === d.name)
            )
            .map((d: any) => d.name),
          jobs: jobs.map(({ name, state, reason, updatedAt, retryAt }) => ({
            name,
            state,
            reason,
            updatedAt,
            retryAt
          }))
        });
      })
      .catch(() => sendResponse({ error: "Could not read queue" }));
    return true;
  }
  if (
    message?.type === "gtr-queue-pause" ||
    message?.type === "gtr-queue-resume"
  ) {
    void writeLocal({ queuePaused: message.type === "gtr-queue-pause" })
      .then(() =>
        message.type === "gtr-queue-resume" ? queue.resume() : undefined
      )
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ error: "Could not update queue" }));
    return true;
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

export const queue = new QueueRuntime(getEncodedCookies, saveDownload);
const automation = new ExportAutomation(queue);
let automationWrites: Promise<unknown> = Promise.resolve();
function runAutomation<T>(operation: () => Promise<T>): Promise<T> {
  const result = automationWrites.then(operation);
  automationWrites = result.catch(() => {});
  return result;
}
// The alarm is a recovery mechanism for this queue, not a second backup monitor.
queue.install();

export async function captureDownload(
  downloadItem: chrome.downloads.DownloadItem,
  suggest: (suggestion?: chrome.downloads.DownloadFilenameSuggestion) => void
) {
  try {
    const [enabled, container, proxy] = await getConfig();
    const source = downloadItem.finalUrl || downloadItem.url;
    if (
      !enabled ||
      !isEligibleDownloadUrl(source) ||
      validateTransloadConfig(container, proxy)
    )
      return;
    if ((await readLocal("agentServiceEnabled")).agentServiceEnabled) {
      const id = uuid().replace(/-/g, "");
      const recordKey = `gtr-service-handoff:${downloadItem.id}`;
      // This is only a submission receipt, not a proxy for extension controls.
      await writeLocal({
        [recordKey]: { id, name: downloadItem.filename, state: "requested" }
      });
      try {
        const jobId = await handoffNewDownload({
          id,
          params: {
            name: downloadItem.filename,
            source,
            container: container.trim(),
            proxy: proxy?.trim() || "https://gtr-proxy.677472.xyz",
            cookies: await getEncodedCookies(source)
          }
        });
        await writeLocal({
          [recordKey]: {
            id,
            jobId,
            name: downloadItem.filename,
            state: "acknowledged"
          }
        });
        await saveDownload({
          name: downloadItem.filename,
          status: "pending",
          phase: "delegated",
          owner: "service",
          updatedAt: Date.now()
        });
        await runAutomation(() => automation.captured(downloadItem));
      } catch {
        await saveDownload({
          name: downloadItem.filename,
          status: "failed",
          owner: "service",
          reason:
            "Local service handoff is unconfirmed. Check the service's own job status before retrying.",
          updatedAt: Date.now()
        });
      } finally {
        // An unknown handoff never falls back to a second browser transfer or
        // a multi-terabyte local download.
        chrome.downloads.cancel(downloadItem.id);
      }
      return;
    }
    // Persist ownership before cancelling the browser download. Storage failure
    // leaves the native download intact instead of losing the user's request.
    const captured = await queue.enqueue(
      downloadItem.filename,
      source,
      container.trim()
    );
    chrome.downloads.cancel(downloadItem.id);
    if (captured) await runAutomation(() => automation.captured(downloadItem));
  } finally {
    suggest();
  }
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
