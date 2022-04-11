import React, { useEffect, useState } from "react";
import { State } from "../state";

export default function App() {
  const [state, setState] = useState({
    enabled: false,
    proxyUrl: "",
    azureSasUrl: "",
    proxyBaseUrl: "",
    downloads: {}
  } as State);

  useEffect(() => {
    chrome.storage.local.get("state", function (result) {
      setState(result.state);
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.state?.newValue) {
          setState(changes.state.newValue);
        }
      });
    });
  }, []);

  useEffect(() => {
    chrome.storage.local.set({ state: state }, function () {
      console.log("State value currently is " + state);
    });
  });

  return (
    <div>
      <h1>Garguantuan Takeout Helper</h1>
      <form>
        <label htmlFor="enabled">Enabled</label>
        <br />
        <input
          id="enabled"
          type="checkbox"
          checked={state.enabled}
          onChange={(e) => setState({ ...state, enabled: e.target.checked })}
        />
        <br />
        <label>Azure SAS Container URL:</label>
        <br />
        <input
          type="text"
          name="name"
          defaultValue={state.azureSasUrl}
          onBlur={(e) =>
            setState({
              ...state,
              azureSasUrl: e.target.value
            })
          }
        />
        <br />
        <label>
          Proxy Base URL (optional, defaults to https://gtr-proxy.677472.xyz if
          not specified):
        </label>
        <br />
        <input
          type="text"
          name="name"
          defaultValue={state.proxyBaseUrl}
          onBlur={(e) =>
            setState({
              ...state,
              proxyBaseUrl: e.target.value
            })
          }
        />
      </form>
      <h2>Downloads</h2>
      <button
        onClick={() =>
          setState({
            ...state,
            downloads: {}
          })
        }
      >
        Clear
      </button>
      <ul>
        {Object.entries(state.downloads).map(([key, value]) => (
          <li key={value.name}>
            {value.name} - {value.status} - {value.reason}
          </li>
        ))}
      </ul>
    </div>
  );
}
