/**
 * This is a popup view
 * This script is bundled and imported by
 * popup.html
 */

import React from "react";
import * as ReactDOMClient from "react-dom/client";
import App from "./Popup/App";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Could not find root element");
}

const root = ReactDOMClient.createRoot(container);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
