# Gargantuan Takeout Rocket Extension

🏗️ This is still WIP and under test and heavy development. I'm not great at writing extensions. Definitely not ready for prime-time. Very POC! Not everything described is working yet or shareable.

Please read the readme at the main repo of [Gargantuan Takeout Rocket (GTR)][gtr] first.

## Usage

This is the Chromium-based browser extension component of [Gargantuan Takeout Rocket (GTR)][gtr], a Google Takeout helper for people wishing to purely backup their Google Takeout Data to somewhere _else_ durable and cheap.

The extension facilitates a server-to-server from Google Takeout to Microsoft Azure Blob Storage. Speeds of 8.7GB/s with unlimited parallelism atop of that too have been seen. Azure Blob Storage archive is really cheap to store this data in.

The extension works with [gtr-proxy][gtr-proxy], a CloudFlare workers service, to workaround a bug and a lack of a certain feature in Azure Storage that greatly slow or outright block downloading from Google Takeout. Please see the gtr-proxy repo for more details. The extension by default uses a public gtr-proxy service at https://gtr-proxy.mindflakes.com, but you can also deploy and use your own for privacy reasons.

The extension stops downloads from Google Takeout in your local browser and tells Azure to download from Google's signed URLs instead. It handles base64 encoding the URLs of Google Takeout files so Azure is able to download them via a [gtr-proxy][gtr-proxy] service and a [gtr-proxy][gtr-proxy] service is also used to command Azure over hundreds of requests to fetch the files in chunks simutanously. This can result in a significant speedup of backup Google Takeout files to about 7+GB/s to non-Google Storage.

[gtr]: https://github.com/nelsonjchen/gtr
[gtr-proxy]: https://github.com/nelsonjchen/gtr-proxy#readme
