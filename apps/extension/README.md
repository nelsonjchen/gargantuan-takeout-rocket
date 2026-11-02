# Gargantuan Takeout Rocket Extension

[Gargantuan Takeout Rocket (GTR)][gtr] is a toolkit to backup Google Takeout Data to Azure, quick.

Please read the readme at the main repository of [Gargantuan Takeout Rocket (GTR)][gtr] first to get a sense of the whole toolkit and what it is for. This extension is one component of the toolkit.

## Installation

Reference: https://www.youtube.com/watch?v=vW8W19W_X0I

1. Download a "unpacked" release in `.zip` format from the [Releases](https://github.com/nelsonjchen/gtr-ext/releases) section in GitHub
2. Extract the archive to a folder on your computer.
3. Enable Developer Mode in Chrome's Extensions page.
   1. You can visit this page by entering `chrome://extensions` in the address bar.
4. Click the "Load unpacked extension..." button and select the folder you just extracted
5. Enable the extension if it isn't enabled.
6. Find the Rocket icon in the extension menu and click it for the UI.

## Usage

Please see the [main repository][gtr] for setup, [browser queue and recovery](AUTOMATION.md)
for resumable browser transfers, and [local agent service](agent/README.md) for
optional native handoff and command-line control.

## Architecture

This is the Chromium-based browser extension component of [Gargantuan Takeout Rocket (GTR)][gtr]. The default queue persists transfer plans in extension storage and uses browser alarms to recover interrupted jobs. Optional native messaging hands new downloads to an independent local service. Existing browser jobs stay separate from service-owned jobs.

Archive bodies flow remotely from Google through a trusted proxy to Azure Blob Storage. Concurrency is bounded, retries reuse saved blocks, and completion requires a verified Azure commit. Historical peak speeds do not describe every export; authentication expiry and copy timeouts can dominate elapsed time.

The extension works with [gtr-proxy][gtr-proxy], a Cloudflare Workers service. Use a proxy you trust: it receives Google download authentication and credential-bearing Azure requests. See the proxy documentation for deployment details.

The queue owns a captured download before copying, saves block IDs and ranges, and reconciles Azure before retrying missing ranges. In native mode the service acknowledges ownership; an uncertain handoff does not fall back to a second browser transfer. The popup labels service-owned jobs separately and does not mirror their live completion status.

The current agent-operated workflow is tuned to the author's macOS, Edge,
1Password and private proxy setup. GTR does not contain a general passkey/TOTP
login implementation. Other users may need their own reauthentication solution;
manual sign-in remains the fallback. Neither mode renews Azure credentials or
authorizes future exports automatically.

## Logo

The logo used in the extension is the Rocket logo of Twemoji.

[gtr]: https://github.com/nelsonjchen/gtr
[gtr-proxy]: https://github.com/nelsonjchen/gtr-proxy#readme
