/**
 * This is a content script
 * It is used to inject other scripts into
 * the opened windows
 *
 * Read more about content scripts:
 * https://developer.chrome.com/docs/extensions/mv2/content_scripts/
 */

function addScriptToWindow(scriptLocation: string) {
  try {
    const container = document.head || document.documentElement,
      script = document.createElement("script");

    script.setAttribute("async", "false");
    script.setAttribute("type", "text/javascript");
    script.setAttribute("src", scriptLocation);
    container.insertBefore(script, container.children[0]);
    container.removeChild(script);
  } catch (e) {
    console.error("Failed to inject script\n", e);
  }
}

console.log("content script");

// inject the "injected.ts" script
addScriptToWindow(chrome.extension.getURL("/build/injected.js"));

export {};
