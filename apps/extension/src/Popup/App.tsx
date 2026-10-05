import React, { useEffect, useState } from "react";
import { useChromeStorageLocal } from "use-chrome-storage";
import { Download } from "../state";
import { destinationInfo, formatBytes, sortDownloads } from "./model";
import ArchiveHistory from "./ArchiveHistory";

const defaultProxy = "https://gtr-proxy.677472.xyz";
const takeout = "https://takeout.google.com/manage";

export default function App() {
  const [enabled, setEnabled, , enabledError, enabledLoaded] =
    useChromeStorageLocal("enabled", false);
  const [proxyBaseUrl, , , proxyError, proxyLoaded] = useChromeStorageLocal(
    "proxyBaseUrl",
    defaultProxy
  );
  const [azureSasUrl, , , sasError, sasLoaded] = useChromeStorageLocal(
    "azureSasUrl",
    ""
  );
  const [downloads, , , downloadsError, downloadsLoaded] =
    useChromeStorageLocal<Record<string, Download>>("downloads", {});
  const [draftSas, setDraftSas] = useState("");
  const [draftProxy, setDraftProxy] = useState(defaultProxy);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("all");
  const [activeNames, setActiveNames] = useState<string[] | undefined>();
  const [workerChecked, setWorkerChecked] = useState(false);
  const [now, setNow] = useState(Date.now());
  const loaded = enabledLoaded && proxyLoaded && sasLoaded && downloadsLoaded;
  const storageError = enabledError || proxyError || sasError || downloadsError;

  useEffect(() => {
    setDraftSas(azureSasUrl);
    setDraftProxy(proxyBaseUrl);
  }, [azureSasUrl, proxyBaseUrl]);
  useEffect(() => {
    const check = () => {
      setNow(Date.now());
      chrome.runtime.sendMessage(
        { type: "gtr-active-transfers" },
        (response) => {
          setWorkerChecked(true);
          if (chrome.runtime.lastError) setActiveNames(undefined);
          else
            setActiveNames(
              Array.isArray(response?.names) ? response.names : undefined
            );
        }
      );
    };
    check();
    const timer = window.setInterval(check, 3000);
    return () => window.clearInterval(timer);
  }, []);

  const destination = destinationInfo(azureSasUrl, proxyBaseUrl, now);
  const draftError = destinationInfo(draftSas, draftProxy, now).error;
  const dirty =
    draftSas.trim() !== azureSasUrl.trim() ||
    (draftProxy.trim() || defaultProxy) !==
      (proxyBaseUrl.trim() || defaultProxy);
  const blocked = enabled && !!destination.error;
  const all = sortDownloads(Object.values(downloads), activeNames);
  const completed = all.filter((d) => d.status === "complete");
  const attention = all.filter(
    (d) =>
      d.status === "failed" ||
      (d.status === "pending" &&
        workerChecked &&
        !activeNames?.includes(d.name))
  );
  const running = all.filter(
    (d) => d.status === "pending" && activeNames?.includes(d.name)
  );
  const visible =
    filter === "complete"
      ? completed
      : filter === "attention"
      ? attention
      : all;
  const total = completed.reduce((sum, d) => sum + (d.size || 0), 0);

  function saveSettings(event: React.FormEvent) {
    event.preventDefault();
    if (draftError || saving || !dirty) return;
    setSaving(true);
    chrome.storage.local.set(
      {
        azureSasUrl: draftSas.trim(),
        proxyBaseUrl: draftProxy.trim() || defaultProxy
      },
      () => {
        setSaving(false);
        setNotice(
          chrome.runtime.lastError
            ? "Settings could not be saved. Try again."
            : "Settings saved."
        );
      }
    );
  }

  return (
    <main className="workspace">
      <header className="masthead">
        <div className="brand">
          <span className="rocket" aria-hidden="true">
            🚀
          </span>
          <div>
            <h1>Takeout Rocket</h1>
            <p>Google Takeout → Azure</p>
          </div>
        </div>
        <a
          className="quiet-link"
          href="popup.html"
          target="_blank"
          rel="noreferrer"
        >
          Open in tab ↗
        </a>
      </header>
      <section
        className={`interception ${
          blocked ? "blocked" : enabled ? "armed" : ""
        }`}
        aria-labelledby="transfer-mode"
      >
        <div>
          <h2 id="transfer-mode">
            {!loaded
              ? "Reading transfer settings…"
              : storageError
              ? "Transfer settings unavailable"
              : blocked
              ? "Azure access needs attention"
              : enabled
              ? "Send downloads to Azure"
              : "Downloads stay on this device"}
          </h2>
          <p>
            {!loaded
              ? "Checking where new downloads will go."
              : storageError
              ? "Reopen the extension to check the saved configuration."
              : blocked
              ? "New downloads stay on this device until Settings are fixed."
              : enabled
              ? "New Takeout downloads will transfer to your backup."
              : "Enable when your Takeout archives are ready."}
          </p>
        </div>
        <label className="switch">
          <input
            type="checkbox"
            aria-label="Send Takeout downloads to Azure"
            checked={enabled}
            disabled={
              !loaded || !!storageError || (!enabled && !!destination.error)
            }
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span className="switch-track" />
          <span className="switch-label">
            {!loaded || storageError
              ? "—"
              : blocked
              ? "Blocked"
              : enabled
              ? "On"
              : "Off"}
          </span>
        </label>
      </section>
      {(enabled || !!running.length) && (
        <p className="mode-note">
          Transfers already started continue when this switch is off.
        </p>
      )}
      <section className="destination" aria-label="Backup destination">
        <div className="section-heading">
          <h2>Backup destination</h2>
          <span
            className={`access-state ${
              destination.error ? "needs-attention" : ""
            }`}
          >
            {loaded
              ? storageError
                ? "Unavailable"
                : destination.error
                ? destination.expiresAt && destination.expiresAt <= now
                  ? "Expired"
                  : "Needs setup"
                : "Configured"
              : "Loading…"}
          </span>
        </div>
        <p className="destination-name">
          {loaded
            ? storageError
              ? "Saved settings could not be read"
              : destination.label || "Add your Azure container in Settings"
            : "Reading saved settings…"}
        </p>
        {loaded && !storageError && destination.error ? (
          <p className="error-text">{destination.error}</p>
        ) : (
          destination.expiresAt && (
            <p className="expiry">
              Access expires{" "}
              {new Date(destination.expiresAt).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit"
              })}
            </p>
          )
        )}
        <details className="settings">
          <summary>Settings</summary>
          <form onSubmit={saveSettings}>
            <label htmlFor="azure-sas">Azure container SAS URL</label>
            <input
              id="azure-sas"
              type="password"
              autoComplete="off"
              disabled={!loaded || saving || !!storageError}
              spellCheck={false}
              value={draftSas}
              onChange={(e) => {
                setDraftSas(e.target.value);
                setNotice("");
              }}
              aria-describedby={`sas-help${
                draftError ? " settings-error" : ""
              }`}
              aria-invalid={!!draftError && !draftError.startsWith("GTR proxy")}
            />
            <p id="sas-help" className="field-help">
              Paste the container’s Blob SAS URL. It stays hidden here.
            </p>
            <label htmlFor="proxy-url">GTR proxy URL</label>
            <input
              id="proxy-url"
              type="url"
              value={draftProxy}
              disabled={!loaded || saving || !!storageError}
              spellCheck={false}
              aria-describedby={draftError ? "settings-error" : undefined}
              aria-invalid={!!draftError?.startsWith("GTR proxy")}
              onChange={(e) => {
                setDraftProxy(e.target.value);
                setNotice("");
              }}
            />
            {loaded && !storageError && draftError && (
              <p className="error-text" id="settings-error">
                {draftError}
              </p>
            )}
            {dirty && (
              <p className="field-help">
                Unsaved changes. New downloads use the saved settings.
              </p>
            )}
            <div className="settings-actions">
              <button
                className="primary-button"
                disabled={
                  !loaded || saving || !!storageError || !!draftError || !dirty
                }
              >
                {saving ? "Saving…" : "Save settings"}
              </button>
              {dirty && (
                <button
                  className="secondary-button"
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setDraftSas(azureSasUrl);
                    setDraftProxy(proxyBaseUrl);
                    setNotice("");
                  }}
                >
                  Discard changes
                </button>
              )}
              <a
                href="https://github.com/nelsonjchen/gtr-proxy#readme"
                target="_blank"
                rel="noreferrer"
              >
                Proxy setup ↗
              </a>
            </div>
            <p className="save-notice" role="status">
              {notice}
            </p>
          </form>
        </details>
      </section>
      <section className="transfers" aria-labelledby="archives-heading">
        <div className="section-heading">
          <h2 id="archives-heading">Archives</h2>
          <a
            className="takeout-link"
            href={takeout}
            target="_blank"
            rel="noreferrer"
          >
            Open Takeout ↗
          </a>
        </div>
        <p className="transfer-summary" aria-live="polite">
          {loaded
            ? storageError
              ? "History unavailable"
              : `${
                  activeNames === undefined
                    ? "Active status unconfirmed"
                    : `${running.length} active`
                } · ${completed.length} complete${
                  total ? ` · ${formatBytes(total)} saved` : ""
                }`
            : "Loading transfer history…"}
        </p>
        {(enabled || !!running.length) && (
          <details className="monitor-note">
            <summary>Large transfers: keep DevTools open</summary>
            <p>
              Before clicking Download, open the browser’s Extensions page, find
              Takeout Rocket, and inspect its service worker. Keep that DevTools
              window open until all archives finish.
            </p>
          </details>
        )}
        {storageError && (
          <p className="error-text" role="alert">
            Saved settings or history could not be read. Reopen the extension to
            try again.
          </p>
        )}
        {!!all.length && (
          <div className="filters" role="group" aria-label="Filter archives">
            {[
              ["all", "All", all.length],
              ["attention", "Needs attention", attention.length],
              ["complete", "Complete", completed.length]
            ].map(([value, label, count]) => (
              <button
                key={value}
                className={filter === value ? "selected" : ""}
                aria-pressed={filter === value}
                aria-label={`${label} (${count})`}
                onClick={() => setFilter(String(value))}
              >
                {label}
                <span>{count}</span>
              </button>
            ))}
          </div>
        )}
        {loaded && !storageError && !visible.length && (
          <div className="empty-state">
            <h3>
              {all.length
                ? "No archives in this view"
                : destination.error
                ? "Connect your Azure container"
                : "Start with a small Takeout export"}
            </h3>
            <p>
              {all.length
                ? "Choose another filter to see your transfer history."
                : destination.error
                ? "Open Settings and paste the container’s Blob SAS URL. Then save your settings to enable transfers."
                : "Choose one small product, such as Contacts, and ZIP format in Takeout. When it’s ready, turn transfers on here and click Download. Large backups use the same steps."}
            </p>
          </div>
        )}
        <ArchiveHistory
          key={filter}
          downloads={visible}
          activeNames={activeNames}
          checked={workerChecked}
        />
        {!!all.length && (
          <p className="history-note">
            History on this device. “Complete” means Azure accepted the archive;
            “Unconfirmed” needs a check in Azure.
          </p>
        )}
      </section>
      <footer>
        <span>Gargantuan Takeout Rocket</span>
        <a
          href="https://github.com/nelsonjchen/gtr#backing-up"
          target="_blank"
          rel="noreferrer"
        >
          Backup guide ↗
        </a>
      </footer>
    </main>
  );
}
