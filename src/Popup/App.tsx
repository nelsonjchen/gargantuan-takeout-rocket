import React, { useEffect, useState } from "react";
import { State } from "../state";

export default function App() {
  const [state, setState] = useState({
    enabled: false,
    proxyUrl: "",
    azureSasUrl: "",
    downloads: {}
  } as State);

  useEffect(() => {
    chrome.storage.local.get("state", function (result) {
      setState(result.state);
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
        <label htmlFor="">Enabled</label>
        <input
          type="checkbox"
          checked={state.enabled}
          onChange={(e) => setState({ ...state, enabled: e.target.checked })}
        />
        <label>
          Azure SAS Container URL:
          <input
            type="text"
            name="name"
            value={state.azureSasUrl}
            onBlur={(e) =>
              setState({
                ...state,
                azureSasUrl: e.target.value
              })
            }
          />
        </label>
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
          <li>{value.name}</li>
        ))}
      </ul>
    </div>
  );
}
