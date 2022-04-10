import React, { useEffect, useState } from "react";
import { State } from "../state";

export default function App() {
  const [state, setState] = useState({
    enabled: false,
    proxyUrl: "",
    azureSasUrl: ""
  } as State);

  useEffect(() => {
    chrome.storage.sync.get("state", function (result) {
      setState(result.state);
    });
  }, []);

  useEffect(() => {
    chrome.storage.sync.set({ state: state }, function () {
      console.log("State value currently is " + state);
    });
  });

  chrome.storage.onChanged.addListener(function (changes, namespace) {
    for (let [key, { newValue }] of Object.entries(changes)) {
      if (key === "state") {
        setState(newValue);
      }
    }
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
            onChange={(e) =>
              setState({
                ...state,
                azureSasUrl: e.target.value
              })
            }
          />
        </label>
      </form>
    </div>
  );
}
