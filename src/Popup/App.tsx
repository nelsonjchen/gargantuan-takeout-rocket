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
          checked={state.enabled}
          onChange={(e) => setState({ ...state, enabled: e.target.checked })}
          style={{ zoom: 3.0 }}
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
          style={{ width: "100%" }}
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
          defaultValue={state.proxyBaseUrl}
          onBlur={(e) =>
            setState({
              ...state,
              proxyBaseUrl: e.target.value
            })
          }
          style={{ width: "100%" }}
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
