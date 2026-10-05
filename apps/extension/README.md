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

Please see the [main repository][gtr] for usage instructions

## Architecture

This is the Chromium-based browser extension component of [Gargantuan Takeout Rocket (GTR)][gtr], a Google Takeout helper for people wishing to purely backup their Google Takeout Data to somewhere _else_ durable and cheap. The toolkit and this extension is an assistive tool and not an automated tool as Google Takeout has a lot of anti-automation measures. You must still click through Google Takeout UIs to transload your data.

The extension facilitates a server-to-server from Google Takeout to Microsoft Azure Blob Storage. Speeds of 7.0GB/s+ with unlimited parallelism atop of that too have been seen. Azure Blob Storage Archive tier is really cheap to store this data in with pricing very similar to AWS Deep Archive.

The extension works with [gtr-proxy][gtr-proxy], a CloudFlare workers service, to workaround a bug and a lack of a certain feature in Azure Storage that greatly slows downloading from Google Takeout from Azure Storage. Please see the gtr-proxy repo for more details. The extension by default uses a public gtr-proxy service at https://gtr-proxy.677472.xyz, but you can also deploy and use your own service at your own address or Cloudflare account for privacy reasons. For details on setup of a private instance, please see [the gtr-proxy repository][gtr-proxy] as well.

The extension stops downloads from Google Takeout in your local browser, captures the finalized download links, extracts google cookies, and tells Azure to download from Google's URLs with the cookies instead via the proxy. It handles encoding the URLs of Google Takeout files so Azure is able to download them at all via a [gtr-proxy][gtr-proxy] service and that [gtr-proxy][gtr-proxy] service is also used to command Azure over hundreds of requests simutaneously to fetch the files in chunks simultaneously in parallel to quickly transload archives to Azure.

## Logo

The logo used in the extension is the Rocket logo of Twemoji.

[gtr]: https://github.com/nelsonjchen/gtr
[gtr-proxy]: https://github.com/nelsonjchen/gtr-proxy#readme
