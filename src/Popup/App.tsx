import React, { useEffect, useState } from "react";

export default function App() {
  const [sas, setSAS] = useState("");

  useEffect(() => {
    chrome.storage.sync.get("sas", function (result) {
      setSAS(result.sas);
    });
  }, []);

  useEffect(() => {
    chrome.storage.sync.set({ sas }, function () {
      console.log("Value currently is " + sas);
    });
  });

  return (
    <div>
      <h1>GTR Helper</h1>
      <form>
        <label>
          Azure SAS Container URL:
          <input
            type="text"
            name="name"
            value={sas}
            onChange={(e) => setSAS(e.target.value)}
          />
        </label>
      </form>
      <p>{sas}</p>
    </div>
  );
}
