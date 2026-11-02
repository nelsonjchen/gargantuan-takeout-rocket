// Fake browser APIs for visual checks. No credentials or network transfers.
const scenario = new URLSearchParams(location.search).get("state") || "history";
const completeName = "takeout-20261004T195635Z-1-001.zip";
const liveName = "takeout-20261004T203039Z-1-002.zip";
const oldName = "takeout-20251231T012820Z-9-004.zip";
const failureName = "takeout-20251231T012820Z-13-001.zip";
const active = ["active", "mini", "finalizing"].includes(scenario);
const expiry = new Date(
  Date.now() + (scenario === "expired" ? -1 : 1) * 86400000
).toISOString();
const values = {
  enabled: active || scenario === "expired",
  azureSasUrl:
    scenario === "empty"
      ? ""
      : `https://backup.blob.core.windows.net/takeout?sig=preview-only&se=${encodeURIComponent(
          expiry
        )}`,
  proxyBaseUrl: "https://gtr-proxy.677472.xyz",
  downloads: ["empty", "configured"].includes(scenario)
    ? {}
    : {
        [completeName]: {
          name: completeName,
          status: "complete",
          size: 4684195,
          reason: "4.68 MB @ 2.6 MB/s"
        },
        [oldName]: { name: oldName, status: "pending" },
        [failureName]: {
          name: failureName,
          status: "failed",
          reason: "No content-length header"
        },
        ...(active
          ? {
              [liveName]: {
                name: liveName,
                status: "pending",
                phase: scenario === "finalizing" ? "committing" : "copying",
                startedAt: Date.now(),
                totalBytes: scenario === "mini" ? 4684195 : 50000000000,
                transferredBytes:
                  scenario === "mini"
                    ? 0
                    : scenario === "finalizing"
                    ? 50000000000
                    : 24000000000,
                completedBlocks:
                  scenario === "mini" ? 0 : scenario === "finalizing" ? 17 : 8,
                totalBlocks: scenario === "mini" ? 1 : 17
              }
            }
          : {})
      }
};
const listeners = new Set();
function withError(callback, value) {
  chrome.runtime.lastError = { message: "Preview error" };
  callback(value);
  chrome.runtime.lastError = undefined;
}
window.chrome = {
  runtime: {
    sendMessage(message, callback) {
      if (scenario === "disconnected") withError(callback);
      else callback({ names: active ? [liveName] : [] });
    }
  },
  storage: {
    onChanged: {
      addListener(fn) {
        listeners.add(fn);
      },
      removeListener(fn) {
        listeners.delete(fn);
      }
    },
    local: {
      get(keys, callback) {
        if (scenario === "loading") return;
        if (scenario === "error") return withError(callback, {});
        const result = {};
        if (typeof keys === "object" && !Array.isArray(keys)) {
          for (const key in keys) result[key] = values[key] ?? keys[key];
        } else {
          for (const key of Array.isArray(keys) ? keys : [keys])
            result[key] = values[key];
        }
        callback(result);
      },
      set(update, callback) {
        if (scenario === "save-error") return withError(callback);
        const changes = {};
        for (const key in update) {
          changes[key] = { oldValue: values[key], newValue: update[key] };
          values[key] = update[key];
        }
        callback?.();
        for (const fn of listeners) fn(changes, "local");
      }
    }
  }
};
