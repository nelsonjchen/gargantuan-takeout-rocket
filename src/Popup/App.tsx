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
        software to help you take out your data from Google Takeout and put it
        somewhere else safe easily, periodically, and fast. For more info and
        instructions, please see{" "}
        <a href="https://github.com/nelsonjchen/gtr" target="_blank">
          https://github.com/nelsonjchen/gtr
        </a>
        .
      </p>

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
          style={{ width: "90%" }}
        />
        <br />
        <br />
        <label>
          GTR Proxy Base URL (optional, defaults to https://gtr-proxy.677472.xyz
          if not specified) (
          <a
            href="https://github.com/nelsonjchen/gtr-proxy#readme"
            target="_blank"
          >
            Why is a GTR proxy needed?
          </a>
          ):
        </label>
        <br />
        <input
          type="text"
          name="name"
          value={proxyBaseUrl}
          onChange={(e) => setProxyBaseUrl(e.target.value)}
          style={{ width: "90%" }}
        />
      </form>
      <h2>Downloads</h2>
      <button onClick={() => setDownloads({})}>Clear</button>
      <ul>
        {Object.entries(downloads).map(([key, value]) => (
          <li key={value.name}>
            {value.name} - {value.status} - {value.reason}
          </li>
        ))}
      </ul>
    </div>
  );
}
