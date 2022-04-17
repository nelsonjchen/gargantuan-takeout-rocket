import React, { useEffect, useState } from "react";
import { useChromeStorageLocal } from "use-chrome-storage";
import { Download } from "../state";

export default function App() {
  const [enabled, setEnabled] = useChromeStorageLocal("enabled", false);
  const [proxyBaseUrl, setProxyBaseUrl] = useChromeStorageLocal(
    "proxyBaseUrl",
    "https://gtr-proxy.677472.xyz"
  );
  const [azureSasUrl, setAzureSasUrl] = useChromeStorageLocal(
    "azureSasUrl",
    ""
  );
  const [downloads, setDownloads]: [
    { [key: string]: Download },
    (val: { [key: string]: Download }) => any,
    any,
    any
  ] = useChromeStorageLocal("downloads", new Map());

  return (
    <div>
      <h1>🚀 Garguantuan Takeout Helper</h1>
      <p>
        Gargantuan Takeout Rocket (GTR) is a toolkit of instructions/guides and
        software to help you transload your data from Google Takeout or similar
        services and put it into Azure safe easily, periodically, and fast.
      </p>
      <p>
        For a guide, please see{" "}
        <a href="https://github.com/nelsonjchen/gtr" target="_blank">
          https://github.com/nelsonjchen/gtr
        </a>
        .
      </p>
      <p>This is the extension part of the toolkit.</p>

      <form>
        <label htmlFor="enabled">Enable Download Interception:</label>
        <br />
        <input
          id="enabled"
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          style={{ zoom: 3.0 }}
        />
        <br />
        <label>Azure SAS Container URL (Blob SAS URL):</label>
        <br />
        <input
          type="text"
          name="name"
          value={azureSasUrl}
          onChange={(e) => setAzureSasUrl(e.target.value)}
          style={{ width: "90%", zoom: 1.2 }}
        />
        <br />
        <br />
        <label>
          GTR Proxy Base URL (default: https://gtr-proxy.677472.xyz):
          <a
            href="https://github.com/nelsonjchen/gtr-proxy#readme"
            target="_blank"
          >
            <br />
            Why is a GTR proxy needed? / I'm interested in using my own GTR
            Proxy.
          </a>
        </label>
        <br />
        <input
          type="text"
          name="name"
          value={proxyBaseUrl}
          onChange={(e) => setProxyBaseUrl(e.target.value)}
          style={{ width: "90%", zoom: 1.2 }}
        />
      </form>
      <h2>Downloads</h2>
      <button onClick={() => setDownloads({})}>Clear</button>
      <ul>
        {Object.entries(downloads).map(([key, value]) => (
          <li key={value.name}>
            {[value.name, value.status, value.reason]
              .filter((x) => x !== undefined)
              .join(" - ")}
          </li>
        ))}
      </ul>
    </div>
  );
}
