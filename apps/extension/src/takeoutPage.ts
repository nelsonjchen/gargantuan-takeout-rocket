// Runs only on Takeout's archive page, in the extension's isolated world.
// It never exposes transfer history, credentials or generic controls to the page.
import { parsePartLabel } from "./takeoutLinks";
function mount() {
  if (document.getElementById("gtr-export-controls")) return;
  const host = document.createElement("div");
  host.id = "gtr-export-controls";
  const root = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent =
    ":host{display:block;margin:16px;padding:16px;border:1px solid #aaa;border-radius:8px;background:white;color:#202124;font:14px system-ui}button{margin:8px 8px 0 0;padding:8px 12px}p{margin:8px 0}";
  const title = document.createElement("strong");
  title.textContent = "Takeout Rocket → your configured Azure backup";
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  status.textContent =
    "Queue this export once; GTR requests the next part when a slot is free. Google sign-in may still require you.";
  const start = document.createElement("button");
  start.textContent = "Back up this export automatically";
  const pause = document.createElement("button");
  pause.textContent = "Pause new parts";
  const message = (request: object) =>
    chrome.runtime.sendMessage(request, (response) => {
      if (chrome.runtime.lastError)
        status.textContent =
          "Reload this Takeout page after updating the extension.";
      else if (response?.notice) status.textContent = response.notice;
    });
  start.addEventListener("click", () => {
    const links = Array.from(
      document.querySelectorAll<HTMLAnchorElement>("a[aria-label]")
    );
    const parts = links
      .map((link) => {
        const match = parsePartLabel(link.getAttribute("aria-label") || "");
        return match ? { ...match, url: link.href } : undefined;
      })
      .filter((p): p is { part: number; total: number; url: string } => !!p)
      .sort((a, b) => a.part - b.part);
    if (!parts.length || parts.some((p) => p.total !== parts.length)) {
      status.textContent =
        "Could not find every part on this page. Expand the export's download list first.";
      return;
    }
    message({ type: "gtr-export-start", parts });
  });
  pause.addEventListener("click", () => message({ type: "gtr-export-pause" }));
  root.append(style, title, status, start, pause);
  document.body.prepend(host);
  const timer = window.setInterval(
    () => message({ type: "gtr-export-tick" }),
    10_000
  );
  window.addEventListener("pagehide", () => window.clearInterval(timer), {
    once: true
  });
}
mount();
