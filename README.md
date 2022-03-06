# Gargantuan Takeout Rocket Proxy

🏗️ This is still WIP and under test.

This is the proxy component of [GTR][gtr]. This proxy is required as [Microsoft's Azure Storage is unable to download from download URLs used in Google Takeout directly due to a URL Escaping issue][msqa].

By base64-encoding the offending URLs and proxying the traffic through Cloudflare, Azure's limitation on acceptable URLs for its "server-to-server" download capabilities is circumvented in a high performance and low cost manner.

# Usage

## Public Instance

A public instance is hosted at https://gtr-proxy.mindflakes.com that anybody may use. The front page of https://gtr-proxy.mindflakes.com just goes to the GitHub repository.

For the concerned, Cloudflare's logs are not persistently stored, are only shown during viewing in the dashboard as a stream, and the base64 in the URL is filtered out. That said, you can always clone this repository down and host an instance in your own Cloudflare account if this is a concern. Obviously, change the proxy's domain in the URL as needed. If you are in this camp of concern, perhaps you may want to try the public proxy with a Google Takeout of a Google Service that isn't very sensitive as a trial to test viablity before setting up your own.

As for my public instance, to repeat, Cloudflare filters out and redacts Base64 in the URLs for the log stream. Theorectically, it's possible to upload a version with pushing the source a version that reports the URL to a third party service without the redaction. You have my assurance I do not care about you and I am too lazy to do this. The service is there for convenience.

## Demo using the test server

The usage to use the tool to download from the test server is as follows:

1. Encode the URL you wish to download to base64. For our example, we'll encode "https://put-block-from-url-esc-issue-demo-server-3vngqvvpoq-uc.a.run.app/red%2Fblue.txt". The "`%2F`" in the URL would be silently transformed into a `/` by Azure if it wasn't base64 encoded. The URL should be this in base64: `aHR0cHM6Ly9wdXQtYmxvY2stZnJvbS11cmwtZXNjLWlzc3VlLWRlbW8tc2VydmVyLTN2bmdxdnZwb3EtdWMuYS5ydW4uYXBwL3JlZCUyRmJsdWUudHh0`

2. Do a `GET` of https://gtr-proxy.mindflakes.com/p/aHR0cHM6Ly9wdXQtYmxvY2stZnJvbS11cmwtZXNjLWlzc3VlLWRlbW8tc2VydmVyLTN2bmdxdnZwb3EtdWMuYS5ydW4uYXBwL3JlZCUyRmJsdWUudHh0 through a web browser or an application.

3. You should see "`This path exists!`" from your download.

## Google Takeout Example/Demo

A real Google Takeout URL would look like this:

https://00f74ba44b071b761059aef3fd79738daea1be7829-apidata.googleusercontent.com/download/storage/v1/b/dataliberation/o/20211113T212502Z%2F-4311693717716012545%2F498d83a5-1ab3-4a79-815f-e5cfda855e7a%2F1%2F869777c3-49ff-4d4e-a932-230a6b0b2a78?jk=AFshE3XT7l4gO3olRD23ASyAuaK-Lbi1Z4oc4eMBje8eLdA1mHPk-VeNNMCDno2sDlRKTKD2Nqau1HdkE9nX5f462yylgcSu5kmIknW0lU-1Xx3Mb8OnO5L-DMq3W8xslAI6vlKnqrKaTztfOKSQOfn-5XWf4OuiuDCTdstSSCcsNDMu8b4NX6cnuRhGRdVonqtH3lf9TV7fIBJMchxy3l-i3W_tiGHO7NP9B2Rnvo2uJP7-pgbfxH_ki0DLerQhKK4hRx6KeHWfXL2XT80lLVYwfS2dk5XVAplFIIV7Lp9H7x3HERQzR7_1JshhluQyoG6Vqv7gRYyav8S7PrwkKXStCho5fc85ErZ0dQqJXmvNqCtdWCB8-KzIA5-UgjlLcDzk_mVYMUfcr-_i-R-5tA_Rnb0MmavB94aIj9EfEh0g0B6yCRnAHAIuob6EYFTeCVTs7XXBlqlMKF-P0A5L2d47f0pSQrosQUNshoZKKieSl71vD3kiFDZ4OIg5K-yPlkniodFuyRr-hf5LeBIZhMFNozA2nfGOU3cW3i_sJZgNJNf68UK_l1beTDJ5ZKEZ5ot0jgaQ7w_KlLEonaGJM4Lw7oVby-GbqmlFYe2SI9wwxcXURdW88AW4zipqCMOz_N7cBYC0zm1t4TRSW2-_uvsQWLQRA_9g8avGn8RIKr8i-ISa7sfMaUQEkY4eOtsV7l3JHNeKjmJtxSOJPwg487Cv0htwGt_3Kd6IbyFOb1l0l9wKtkIxkQqliTvAK7VXZUGr1Cdsbbhq1qy3AF1aMVPA1vghV2TOOr5rOzVkRUmTLQzU5WfsYOoNcKjJ7mPvuOirFkKvSHzBQDvZ8_B2RgwT7zMZ7LsjAhG1zS3eDTijUMi9QEM_FYkugRpZ36eg9SZWrEbHCp36y0kL7QK8gZHVP6ePvOqujXG1BCryrxp5UQ9AhZS3szhe54MDf1877LTEmCH5_utBvQqF31dlinmEWiL4YTwiSEwwUToJ38H7gmI-CWErYJsJylmuOSfUoJFpELSRi4Qw4fF-figbaB3w_BNhXvEBdUsMeSNkBkU5u4nwAfG8IJ6TxkyZZKgK4uIhG1R7mr7QaRJ_bizIRVUl&isca=1+

The proxified URL would be:

https://gtr-proxy.mindflakes.com/p/aHR0cHM6Ly8wMGY3NGJhNDRiMDcxYjc2MTA1OWFlZjNmZDc5NzM4ZGFlYTFiZTc4MjktYXBpZGF0YS5nb29nbGV1c2VyY29udGVudC5jb20vZG93bmxvYWQvc3RvcmFnZS92MS9iL2RhdGFsaWJlcmF0aW9uL28vMjAyMTExMTNUMjEyNTAyWiUyRi00MzExNjkzNzE3NzE2MDEyNTQ1JTJGNDk4ZDgzYTUtMWFiMy00YTc5LTgxNWYtZTVjZmRhODU1ZTdhJTJGMSUyRjg2OTc3N2MzLTQ5ZmYtNGQ0ZS1hOTMyLTIzMGE2YjBiMmE3OD9qaz1BRnNoRTNYVDdsNGdPM29sUkQyM0FTeUF1YUstTGJpMVo0b2M0ZU1CamU4ZUxkQTFtSFBrLVZlTk5NQ0RubzJzRGxSS1RLRDJOcWF1MUhka0U5blg1ZjQ2Mnl5bGdjU3U1a21Ja25XMGxVLTFYeDNNYjhPbk81TC1ETXEzVzh4c2xBSTZ2bEtucXJLYVR6dGZPS1NRT2ZuLTVYV2Y0T3VpdURDVGRzdFNTQ2NzTkRNdThiNE5YNmNudVJoR1JkVm9ucXRIM2xmOVRWN2ZJQkpNY2h4eTNsLWkzV190aUdITzdOUDlCMlJudm8ydUpQNy1wZ2JmeEhfa2kwRExlclFoS0s0aFJ4NktlSFdmWEwyWFQ4MGxMVll3ZlMyZGs1WFZBcGxGSUlWN0xwOUg3eDNIRVJRelI3XzFKc2hobHVReW9HNlZxdjdnUll5YXY4UzdQcndrS1hTdENobzVmYzg1RXJaMGRRcUpYbXZOcUN0ZFdDQjgtS3pJQTUtVWdqbExjRHprX21WWU1VZmNyLV9pLVItNXRBX1JuYjBNbWF2Qjk0YUlqOUVmRWgwZzBCNnlDUm5BSEFJdW9iNkVZRlRlQ1ZUczdYWEJscWxNS0YtUDBBNUwyZDQ3ZjBwU1Fyb3NRVU5zaG9aS0tpZVNsNzF2RDNraUZEWjRPSWc1Sy15UGxrbmlvZEZ1eVJyLWhmNUxlQklaaE1GTm96QTJuZkdPVTNjVzNpX3NKWmdOSk5mNjhVS19sMWJlVERKNVpLRVo1b3QwamdhUTd3X0tsTEVvbmFHSk00THc3b1ZieS1HYnFtbEZZZTJTSTl3d3hjWFVSZFc4OEFXNHppcHFDTU96X043Y0JZQzB6bTF0NFRSU1cyLV91dnNRV0xRUkFfOWc4YXZHbjhSSUtyOGktSVNhN3NmTWFVUUVrWTRlT3RzVjdsM0pITmVLam1KdHhTT0pQd2c0ODdDdjBodHdHdF8zS2Q2SWJ5Rk9iMWwwbDl3S3RrSXhrUXFsaVR2QUs3VlhaVUdyMUNkc2JiaHExcXkzQUYxYU1WUEExdmdoVjJUT09yNXJPelZrUlVtVExRelU1V2ZzWU9vTmNLako3bVB2dU9pckZrS3ZTSHpCUUR2WjhfQjJSZ3dUN3pNWjdMc2pBaEcxelMzZURUaWpVTWk5UUVNX0ZZa3VnUnBaMzZlZzlTWldyRWJIQ3AzNnkwa0w3UUs4Z1pIVlA2ZVB2T3F1alhHMUJDcnlyeHA1VVE5QWhaUzNzemhlNTRNRGYxODc3TFRFbUNINV91dEJ2UXFGMzFkbGlubUVXaUw0WVR3aVNFd3dVVG9KMzhIN2dtSS1DV0VyWUpzSnlsbXVPU2ZVb0pGcEVMU1JpNFF3NGZGLWZpZ2JhQjN3X0JOaFh2RUJkVXNNZVNOa0JrVTV1NG53QWZHOElKNlR4a3laWktnSzR1SWhHMVI3bXI3UWFSSl9iaXpJUlZVbCZpc2NhPTEr

As this example original Takeout URL has long expired so you would see `Locked Domain Expired: Not valid after 2021-11-13T13:44:21.231-08:00` when visiting Google's URL above. But now you can see it through the GTR proxy in full fidelity too!

## Limits

For anti-abuse reasons, the service is limited to a test server and Google Takeout download URLs for the aformentioned pathing issue and the Google Takeout URLs as unrestricted open proxies on the internet may be abused.

- One of the following must be true:
  - The URL is a test URL from `*-3vngqvvpoq-uc.a.run.app` which can respond with paths that can cause issues for Azure direct downloads. The source for this can be found at: https://github.com/nelsonjchen/put-block-from-url-esc-issue-demo-server/blob/master/main.go
  - The URL must be a valid Google Takeout download URL.

## Design and Implementation

This tool is implemented to run on Cloudflare Workers as:

- [Cloudflare does not charge for incoming or outgoing data. No egress or ingress charges.][egress_free]
- [Cloudflare does not charge for memory used while the request has finished processing, the response headers are sent, and the worker is just shoveling bytes.][fetch_free]
- [Cloudflare has the peering, compute, and scalability to handle the massive transfer from Google Takeout to Azure Storage. Many of its peering points are peered with Azure and Google with high capacity links.][cf_capacity]

The tool parses and decodes a base64 URL from the URL in the request, requests from the remote server with the same headers, and serves a stream as the response with the same headers. Base64 is used as it has maximum compatibility and universality.

I am not aware of any other provider with the same characteristics as Cloudflare.

[cf_capacity]: https://www.peeringdb.com/asn/13335
[fetch_free]: https://blog.cloudflare.com/workers-optimization-reduces-your-bill/
[egress_free]: https://blog.cloudflare.com/workers-now-even-more-unbound/
[cloudflare_workers]: https://cloudflare.com/workers
[gtr]: https://github.com/nelsonjchen/gtr
[msqa]: https://docs.microsoft.com/en-us/answers/questions/641723/i-can39t-get-azure-storage-to-support-putting-data.html
