# Gargantuan Takeout Rocket Proxy

This is the Cloudflare Workers proxy component of [Gargantuan Takeout Rocket (GTR)][gtr], a toolkit to quickly backup Google Takeout archives to Azure Storage at extremely high speeds.

This proxy is required as:

- [Microsoft's Azure Storage is unable to download from download URLs used in Google Takeout directly due to an URL Escaping issue of Google's URLs][msqa].
- To transfer fast, we tell Azure to fetch from Google with 600MB chunks simutaneously at nearly 89 connections at a time for 50GB files from the extension. [Unfortunately, Chromium-based browsers have a limit of 6 connections per HTTP 1.1 host][chrome_connection_limit]. [Azure only supports HTTP 1.1][azblob_http11] and only 6 chunks can be command to be copied simutaneously via the browser. As a contrast, [Azure's azcopy][azcopy], the command line copier application, can command copies of far more than 6 chunks simutaneously as it is not limited by browser limitations on connections.

Cloudflare Workers can be used to address these issues:

- By base64-encoding the offending URLs when passed to Azure, decoding the exact Google URLs required in the workers, and proxying the traffic through Cloudflare Workers, Azure's mangling of Google's URLs for its "server-to-server" download capabilities is circumvented. Cloudflare charges nothing for ingress and egress as well and the bandwidth to do this proxying is pretty much free.
- Cloudflare Workers are accessed over HTTP/3 or HTTP/2 which multiplex requests over a single connection and aren't bound by the 6 connections limit in the browser. This can be used to convert Azure's HTTP 1.1 endpoint to HTTP/3 or HTTP/2 and the extension in the browser can command more chunks to be downloaded simutaneously through the proxy. Speeds of up to around 8.7GB/s can be achieved with this proxy from the browser versus 180MB/s with a direct connection to Azure's endpoint.

A public instance of this service is provided but you may want to run your own private instance of this proxy for privacy reasons. If so, here is the source.

# Usage

## Public Instance

A public instance is hosted at https://gtr-proxy.677472.xyz that anybody may use with GTR. The front page of https://gtr-proxy.677472.xyz just goes to the GitHub repository for the proxy. The 677472.xyz (`67=g`, `74=t`, and `72=r` from ASCII) domain was chosen because it was $0.75 every year for numeric only `.xyz` domains and I wanted the bandwidth metrics for my personal site separated from this service. Visiting the domain will redirect to this GitHub repository.

Logs are not stored on this service but I reserve the right to stream the logs temporarily to observe and curb abuse if necessary.

## Private Instance

You may be interested in running your own private instance so it does not go through my public proxy.

Use this easy-to-use button:

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/nelsonjchen/gtr-proxy)

Out of the box, you should be able to use your `workers.dev` domain.

Updates to this proxy may or may not be required in the future. If so, simply delete the old repository and old worker and redeploy.

The proxy should be usable within the free tier limits of Cloudflare Workers at a personal scale.

## Functionality Demos using the public service

### Azure URL Encoding Mangling Workaround

The usage to use the tool to download from the URL encoding test server is as follows:

1. Encode the URL you wish to download to base64. For our example, we'll encode "https://put-block-from-url-esc-issue-demo-server-3vngqvvpoq-uc.a.run.app/red%2Fblue.txt". The "`%2F`" in the URL would be silently transformed into a `/` by Azure if it wasn't base64 encoded due to the [bug][msqa]. The URL should be this in base64: `aHR0cHM6Ly9wdXQtYmxvY2stZnJvbS11cmwtZXNjLWlzc3VlLWRlbW8tc2VydmVyLTN2bmdxdnZwb3EtdWMuYS5ydW4uYXBwL3JlZCUyRmJsdWUudHh0`

   Append that to the proxy URL at https://gtr-proxy.677472.xyz/p/.

2. Do a `GET` of https://gtr-proxy.677472.xyz/p/aHR0cHM6Ly9wdXQtYmxvY2stZnJvbS11cmwtZXNjLWlzc3VlLWRlbW8tc2VydmVyLTN2bmdxdnZwb3EtdWMuYS5ydW4uYXBwL3JlZCUyRmJsdWUudHh0 through a web browser or an application.

3. You should see "`This path exists!`" from your download.

You can append a `/<a file name here of your choice>` to the end of the URL after the base64 URL to name the file a specific way for download clients that aren't aware of `Content-Disposition`'s `filename` headers such as `azcopy`.

### HTTP/3 to HTTP 1.1 Proxy for Azure Blob Storage Endpoint

1. Get your original SAS URL from Azure and append a blob name to it in the path. For our example, we'll use this:
   https://urlcopytest.blob.core.windows.net/some-container/data.dat?sp=r&st=2022-04-02T18:23:20Z&se=2022-04-03T06:24:20Z&spr=https&sv=2020-08-04&sr=c&sig=KNz4a1xHnmfi7afzrnkBFtls52YIZ0xtzn1Y7udqXBw%3D
2. The account name is `urlcopytest`. Construct a new proxyfied URL as such:
   https://gtr-proxy.677472.xyz/p-azb/urlcopytest/some-container/data.dat?sp=r&st=2022-04-02T18:23:20Z&se=2022-04-03T06:24:20Z&spr=https&sv=2020-08-04&sr=c&sig=KNz4a1xHnmfi7afzrnkBFtls52YIZ0xtzn1Y7udqXBw%3D
3. Perform any `PUT` operations you wish through that URL as it will go through the proxy. You can observe that the endpoint of the proxy is HTTP/3 after the first initial connection in the Network tab.

## Google Takeout Example/Demo

A real Google Takeout URL would look like this:

https://00f74ba44b071b761059aef3fd79738daea1be7829-apidata.googleusercontent.com/download/storage/v1/b/dataliberation/o/20211113T212502Z%2F-4311693717716012545%2F498d83a5-1ab3-4a79-815f-e5cfda855e7a%2F1%2F869777c3-49ff-4d4e-a932-230a6b0b2a78?jk=AFshE3XT7l4gO3olRD23ASyAuaK-Lbi1Z4oc4eMBje8eLdA1mHPk-VeNNMCDno2sDlRKTKD2Nqau1HdkE9nX5f462yylgcSu5kmIknW0lU-1Xx3Mb8OnO5L-DMq3W8xslAI6vlKnqrKaTztfOKSQOfn-5XWf4OuiuDCTdstSSCcsNDMu8b4NX6cnuRhGRdVonqtH3lf9TV7fIBJMchxy3l-i3W_tiGHO7NP9B2Rnvo2uJP7-pgbfxH_ki0DLerQhKK4hRx6KeHWfXL2XT80lLVYwfS2dk5XVAplFIIV7Lp9H7x3HERQzR7_1JshhluQyoG6Vqv7gRYyav8S7PrwkKXStCho5fc85ErZ0dQqJXmvNqCtdWCB8-KzIA5-UgjlLcDzk_mVYMUfcr-_i-R-5tA_Rnb0MmavB94aIj9EfEh0g0B6yCRnAHAIuob6EYFTeCVTs7XXBlqlMKF-P0A5L2d47f0pSQrosQUNshoZKKieSl71vD3kiFDZ4OIg5K-yPlkniodFuyRr-hf5LeBIZhMFNozA2nfGOU3cW3i_sJZgNJNf68UK_l1beTDJ5ZKEZ5ot0jgaQ7w_KlLEonaGJM4Lw7oVby-GbqmlFYe2SI9wwxcXURdW88AW4zipqCMOz_N7cBYC0zm1t4TRSW2-_uvsQWLQRA_9g8avGn8RIKr8i-ISa7sfMaUQEkY4eOtsV7l3JHNeKjmJtxSOJPwg487Cv0htwGt_3Kd6IbyFOb1l0l9wKtkIxkQqliTvAK7VXZUGr1Cdsbbhq1qy3AF1aMVPA1vghV2TOOr5rOzVkRUmTLQzU5WfsYOoNcKjJ7mPvuOirFkKvSHzBQDvZ8_B2RgwT7zMZ7LsjAhG1zS3eDTijUMi9QEM_FYkugRpZ36eg9SZWrEbHCp36y0kL7QK8gZHVP6ePvOqujXG1BCryrxp5UQ9AhZS3szhe54MDf1877LTEmCH5_utBvQqF31dlinmEWiL4YTwiSEwwUToJ38H7gmI-CWErYJsJylmuOSfUoJFpELSRi4Qw4fF-figbaB3w_BNhXvEBdUsMeSNkBkU5u4nwAfG8IJ6TxkyZZKgK4uIhG1R7mr7QaRJ_bizIRVUl&isca=1+

The proxified URL would be:

https://gtr-proxy.677472.xyz/p/aHR0cHM6Ly8wMGY3NGJhNDRiMDcxYjc2MTA1OWFlZjNmZDc5NzM4ZGFlYTFiZTc4MjktYXBpZGF0YS5nb29nbGV1c2VyY29udGVudC5jb20vZG93bmxvYWQvc3RvcmFnZS92MS9iL2RhdGFsaWJlcmF0aW9uL28vMjAyMTExMTNUMjEyNTAyWiUyRi00MzExNjkzNzE3NzE2MDEyNTQ1JTJGNDk4ZDgzYTUtMWFiMy00YTc5LTgxNWYtZTVjZmRhODU1ZTdhJTJGMSUyRjg2OTc3N2MzLTQ5ZmYtNGQ0ZS1hOTMyLTIzMGE2YjBiMmE3OD9qaz1BRnNoRTNYVDdsNGdPM29sUkQyM0FTeUF1YUstTGJpMVo0b2M0ZU1CamU4ZUxkQTFtSFBrLVZlTk5NQ0RubzJzRGxSS1RLRDJOcWF1MUhka0U5blg1ZjQ2Mnl5bGdjU3U1a21Ja25XMGxVLTFYeDNNYjhPbk81TC1ETXEzVzh4c2xBSTZ2bEtucXJLYVR6dGZPS1NRT2ZuLTVYV2Y0T3VpdURDVGRzdFNTQ2NzTkRNdThiNE5YNmNudVJoR1JkVm9ucXRIM2xmOVRWN2ZJQkpNY2h4eTNsLWkzV190aUdITzdOUDlCMlJudm8ydUpQNy1wZ2JmeEhfa2kwRExlclFoS0s0aFJ4NktlSFdmWEwyWFQ4MGxMVll3ZlMyZGs1WFZBcGxGSUlWN0xwOUg3eDNIRVJRelI3XzFKc2hobHVReW9HNlZxdjdnUll5YXY4UzdQcndrS1hTdENobzVmYzg1RXJaMGRRcUpYbXZOcUN0ZFdDQjgtS3pJQTUtVWdqbExjRHprX21WWU1VZmNyLV9pLVItNXRBX1JuYjBNbWF2Qjk0YUlqOUVmRWgwZzBCNnlDUm5BSEFJdW9iNkVZRlRlQ1ZUczdYWEJscWxNS0YtUDBBNUwyZDQ3ZjBwU1Fyb3NRVU5zaG9aS0tpZVNsNzF2RDNraUZEWjRPSWc1Sy15UGxrbmlvZEZ1eVJyLWhmNUxlQklaaE1GTm96QTJuZkdPVTNjVzNpX3NKWmdOSk5mNjhVS19sMWJlVERKNVpLRVo1b3QwamdhUTd3X0tsTEVvbmFHSk00THc3b1ZieS1HYnFtbEZZZTJTSTl3d3hjWFVSZFc4OEFXNHppcHFDTU96X043Y0JZQzB6bTF0NFRSU1cyLV91dnNRV0xRUkFfOWc4YXZHbjhSSUtyOGktSVNhN3NmTWFVUUVrWTRlT3RzVjdsM0pITmVLam1KdHhTT0pQd2c0ODdDdjBodHdHdF8zS2Q2SWJ5Rk9iMWwwbDl3S3RrSXhrUXFsaVR2QUs3VlhaVUdyMUNkc2JiaHExcXkzQUYxYU1WUEExdmdoVjJUT09yNXJPelZrUlVtVExRelU1V2ZzWU9vTmNLako3bVB2dU9pckZrS3ZTSHpCUUR2WjhfQjJSZ3dUN3pNWjdMc2pBaEcxelMzZURUaWpVTWk5UUVNX0ZZa3VnUnBaMzZlZzlTWldyRWJIQ3AzNnkwa0w3UUs4Z1pIVlA2ZVB2T3F1alhHMUJDcnlyeHA1VVE5QWhaUzNzemhlNTRNRGYxODc3TFRFbUNINV91dEJ2UXFGMzFkbGlubUVXaUw0WVR3aVNFd3dVVG9KMzhIN2dtSS1DV0VyWUpzSnlsbXVPU2ZVb0pGcEVMU1JpNFF3NGZGLWZpZ2JhQjN3X0JOaFh2RUJkVXNNZVNOa0JrVTV1NG53QWZHOElKNlR4a3laWktnSzR1SWhHMVI3bXI3UWFSSl9iaXpJUlZVbCZpc2NhPTEr

As this example original Takeout URL has long expired so you would see `Locked Domain Expired: Not valid after 2021-11-13T13:44:21.231-08:00` when visiting Google's URL above. But now you can see it through the GTR proxy in full fidelity too!

## Limits

For anti-abuse reasons, the service is limited to test servers and Google Takeout download URLs for the aformentioned pathing issue and the Google Takeout URLs as unrestricted open proxies on the internet may be abused.

- One of the following must be true:
  - The URL is a test URL from `*-3vngqvvpoq-uc.a.run.app` which can respond with paths that can cause issues for Azure direct downloads. The source for this can be found at: https://github.com/nelsonjchen/put-block-from-url-esc-issue-demo-server/blob/master/main.go
  - Select Linux ISO Test Mirrors. They are useful for testing large-ish file downloads with some heft.
    - `mirrors.advancedhosters.com`
      - They seem to have resources to spare. Known to work. Can max out 500Mbps connections at least.
    - `*releases.ubuntu.com*`
      - Known to really work. But they aren't as fast and are only in the UK. Only included here as a historical interest for an early version of this proxy.
  - The URL must be a valid Google Takeout download URL. Regions may have different data policies. Please create an issue if your region is unsupported.

## Design and Implementation

This tool is implemented to run on Cloudflare Workers as:

- [Cloudflare does not charge for incoming or outgoing data. No egress or ingress charges.][egress_free]
- [Cloudflare does not charge for memory used while the request has finished processing, the response headers are sent, and the worker is just shoveling bytes between two sockets.][fetch_free]
- [Cloudflare has the peering, compute, and scalability to handle the massive transfer from Google Takeout to Azure Storage. Many of its peering points are peered with Azure and Google with high capacity links.][cf_capacity]
- Cloudflare Workers are serverless.
- [Cloudflare Worker endpoints are HTTP/3 compatible and can comfortably connect to HTTP 1.1 endpoints.][cfhttp3]

I am not aware of any other provider with the same characteristics as Cloudflare.

[cf_capacity]: https://www.peeringdb.com/asn/13335
[fetch_free]: https://blog.cloudflare.com/workers-optimization-reduces-your-bill/
[egress_free]: https://blog.cloudflare.com/workers-now-even-more-unbound/
[cloudflare_workers]: https://cloudflare.com/workers
[gtr]: https://github.com/nelsonjchen/gtr
[msqa]: https://docs.microsoft.com/en-us/answers/questions/641723/i-can39t-get-azure-storage-to-support-putting-data.html
[azblob_http11]: https://docs.microsoft.com/en-us/rest/api/storageservices/http-version-support
[chrome_connection_limit]: https://chromium.googlesource.com/chromium/src/net/+/master/socket/client_socket_pool_manager.cc#51
[azcopy]: https://docs.microsoft.com/en-us/azure/storage/common/storage-use-azcopy-v10
[cfhttp3]: https://developers.cloudflare.com/http3/
