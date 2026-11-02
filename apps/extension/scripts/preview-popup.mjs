// Local UI fixtures only. The packaged extension never includes this script.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../public/", import.meta.url));
const fixture = fileURLToPath(
  new URL("../test/fixtures/popup-chrome.js", import.meta.url)
);
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png"
};
const port = Number(process.env.GTR_PREVIEW_PORT || 8766);
createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const file =
      pathname === "/preview-chrome.js"
        ? fixture
        : resolve(root, `.${pathname === "/" ? "/popup.html" : pathname}`);
    if (file !== fixture && !file.startsWith(root)) {
      response.writeHead(404).end();
      return;
    }
    let body = await readFile(file);
    if (file === resolve(root, "popup.html")) {
      body = Buffer.from(
        body
          .toString()
          .replace("<head>", '<head><script src="/preview-chrome.js"></script>')
          .replace(/(\/build\/popup\.(?:js|css))"/g, `$1?v=${Date.now()}"`)
      );
    }
    response
      .writeHead(200, {
        "Content-Type": types[extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store"
      })
      .end(body);
  } catch {
    response.writeHead(404).end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(
    `Popup preview: http://127.0.0.1:${port}/popup.html?state=active`
  );
  console.log(
    "States: history, active, mini, finalizing, expired, empty, configured, error, disconnected, loading, save-error"
  );
});
