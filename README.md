# Gargantuan Takeout Rocket Proxy

This is the Cloudflare Workers proxy component of [Gargantuan Takeout Rocket (GTR)][gtr], a toolkit to quickly backup Google Takeout archives to Azure Storage at extremely high speeds.

This proxy is required as:

- [Microsoft's Azure Storage is unable to download from download URLs used in Google Takeout directly due to an URL Escaping issue in Google's URLs that Azure "helpfully" breaks.][msqa].
- To transfer fast, we tell Cloudflare Workers to fetch from Google with 1000MB chunks simutaneously at nearly 50 connections at a time for 50GB files from the extension and put the data onto Azure as chunks. [Unfortunately, Azure's endpoints only support 6 connections at a time due to only having up to HTTP/1.1 support](https://learn.microsoft.com/en-us/rest/api/storageservices/http-version-support).

Cloudflare Workers can be used to address these issues:

- By offloading downloading of the offending URLs to Cloudflare, encoding the Takeout URL's escaped characters specially to be decoded via the real URLs in Cloudflare, Azure's mangling of Google's URLs for its "server-to-server" download capabilities is circumvented. Cloudflare charges nothing for ingress and egress as well, there is little to no worker CPU usage, and the bandwidth to do this proxying is pretty much free.
- Cloudflare Workers are accessed over HTTP/3 or HTTP/2 which multiplex requests over a single connection and aren't bound by the 6 connections limit in the browser. This can be used to convert Azure's HTTP 1.1 endpoint to HTTP/3 or HTTP/2 and the extension in the browser can command more chunks to be downloaded simultaneously through the proxy. Speeds of up to around 8.7GB/s can be achieved with this proxy from the browser versus 180MB/s with a direct connection to Azure's endpoint. For reliability reasons, this is limited to 1.0GB/s, but that's still fairly high speed.

A public instance of this service is provided, but you may want to run your own private instance of this proxy for privacy reasons. If so, here is the source.

# Usage

In general, you are expected to use the [Gargantuan Takeout Rocket (GTR)][gtr] extension with this.

## Public Instance

A public instance is hosted at https://gtr-proxy.677472.xyz that anybody may use with GTR. The front page of https://gtr-proxy.677472.xyz just goes to the GitHub repository for the proxy. The 677472.xyz (`67=g`, `74=t`, and `72=r` from ASCII) domain was chosen because it was $0.75 every year for numeric only `.xyz` domains and I wanted the bandwidth metrics for my personal site separated from this service. Visiting the domain will redirect to this GitHub repository.

Logs are not stored on this service but I reserve the right to stream the logs temporarily to observe and curb abuse if necessary.

## Private Instance

You may be interested in running your own private instance so your data does not go through my public proxy.

Please try a Google Takeout with a small, non-sensitive, or already public data on your Google account to produce a non-sensitive Google Takeout test archive to test the public instance of the proxy to get familiar with the GTR toolkit first before setting up a private instance of this proxy for your actual sensitive and non-public takeout data.

Use this easy-to-use button:

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/nelsonjchen/gtr-proxy)

Out of the box, you should be able to use your `workers.dev` domain.

Updates to this proxy may or may not be required in the future. If so, simply delete the old repository and old worker and redeploy.

The proxy should be usable within the free tier limits of Cloudflare Workers at a personal scale.

## Functionality Demos using the public service

### HTTP/3 to HTTP 1.1 Proxy and Transload Takeout Data for Azure Blob Storage Endpoint

A real Google Takeout URL would look like this:

https://00f74ba44b071b761059aef3fd79738daea1be7829-apidata.googleusercontent.com/download/storage/v1/b/dataliberation/o/20211113T212502Z%2F-4311693717716012545%2F498d83a5-1ab3-4a79-815f-e5cfda855e7a%2F1%2F869777c3-49ff-4d4e-a932-230a6b0b2a78?jk=AFshE3XT7l4gO3olRD23ASyAuaK-Lbi1Z4oc4eMBje8eLdA1mHPk-VeNNMCDno2sDlRKTKD2Nqau1HdkE9nX5f462yylgcSu5kmIknW0lU-1Xx3Mb8OnO5L-DMq3W8xslAI6vlKnqrKaTztfOKSQOfn-5XWf4OuiuDCTdstSSCcsNDMu8b4NX6cnuRhGRdVonqtH3lf9TV7fIBJMchxy3l-i3W_tiGHO7NP9B2Rnvo2uJP7-pgbfxH_ki0DLerQhKK4hRx6KeHWfXL2XT80lLVYwfS2dk5XVAplFIIV7Lp9H7x3HERQzR7_1JshhluQyoG6Vqv7gRYyav8S7PrwkKXStCho5fc85ErZ0dQqJXmvNqCtdWCB8-KzIA5-UgjlLcDzk_mVYMUfcr-_i-R-5tA_Rnb0MmavB94aIj9EfEh0g0B6yCRnAHAIuob6EYFTeCVTs7XXBlqlMKF-P0A5L2d47f0pSQrosQUNshoZKKieSl71vD3kiFDZ4OIg5K-yPlkniodFuyRr-hf5LeBIZhMFNozA2nfGOU3cW3i_sJZgNJNf68UK_l1beTDJ5ZKEZ5ot0jgaQ7w_KlLEonaGJM4Lw7oVby-GbqmlFYe2SI9wwxcXURdW88AW4zipqCMOz_N7cBYC0zm1t4TRSW2-_uvsQWLQRA_9g8avGn8RIKr8i-ISa7sfMaUQEkY4eOtsV7l3JHNeKjmJtxSOJPwg487Cv0htwGt_3Kd6IbyFOb1l0l9wKtkIxkQqliTvAK7VXZUGr1Cdsbbhq1qy3AF1aMVPA1vghV2TOOr5rOzVkRUmTLQzU5WfsYOoNcKjJ7mPvuOirFkKvSHzBQDvZ8_B2RgwT7zMZ7LsjAhG1zS3eDTijUMi9QEM_FYkugRpZ36eg9SZWrEbHCp36y0kL7QK8gZHVP6ePvOqujXG1BCryrxp5UQ9AhZS3szhe54MDf1877LTEmCH5_utBvQqF31dlinmEWiL4YTwiSEwwUToJ38H7gmI-CWErYJsJylmuOSfUoJFpELSRi4Qw4fF-figbaB3w_BNhXvEBdUsMeSNkBkU5u4nwAfG8IJ6TxkyZZKgK4uIhG1R7mr7QaRJ_bizIRVUl&isca=1+

1. Get your original SAS URL from Azure and append a blob name to it in the path. For our example, we'll use this:
   https://urlcopytest.blob.core.windows.net/some-container/data.dat?sp=r&st=2022-04-02T18:23:20Z&se=2022-04-03T06:24:20Z&spr=https&sv=2020-08-04&sr=c&sig=KNz4a1xHnmfi7afzrnkBFtls52YIZ0xtzn1Y7udqXBw%3D
2. The account name is `urlcopytest`. Construct a new proxyfied URL as such:
   https://gtr-proxy.677472.xyz/p-azb/urlcopytest/some-container/data.dat?sp=r&st=2022-04-02T18:23:20Z&se=2022-04-03T06:24:20Z&spr=https&sv=2020-08-04&sr=c&sig=KNz4a1xHnmfi7afzrnkBFtls52YIZ0xtzn1Y7udqXBw%3D
3. Construct a proxified Google Takeout URL.
   1. Replace all "%2F" with "%252F".
      * https://00f74ba44b071b761059aef3fd79738daea1be7829-apidata.googleusercontent.com/download/storage/v1/b/dataliberation/o/20211113T212502Z%252F-4311693717716012545%252F498d83a5-1ab3-4a79-815f-e5cfda855e7a%252F1%252F869777c3-49ff-4d4e-a932-230a6b0b2a78?jk=AFshE3XT7l4gO3olRD23ASyAuaK-Lbi1Z4oc4eMBje8eLdA1mHPk-VeNNMCDno2sDlRKTKD2Nqau1HdkE9nX5f462yylgcSu5kmIknW0lU-1Xx3Mb8OnO5L-DMq3W8xslAI6vlKnqrKaTztfOKSQOfn-5XWf4OuiuDCTdstSSCcsNDMu8b4NX6cnuRhGRdVonqtH3lf9TV7fIBJMchxy3l-i3W_tiGHO7NP9B2Rnvo2uJP7-pgbfxH_ki0DLerQhKK4hRx6KeHWfXL2XT80lLVYwfS2dk5XVAplFIIV7Lp9H7x3HERQzR7_1JshhluQyoG6Vqv7gRYyav8S7PrwkKXStCho5fc85ErZ0dQqJXmvNqCtdWCB8-KzIA5-UgjlLcDzk_mVYMUfcr-_i-R-5tA_Rnb0MmavB94aIj9EfEh0g0B6yCRnAHAIuob6EYFTeCVTs7XXBlqlMKF-P0A5L2d47f0pSQrosQUNshoZKKieSl71vD3kiFDZ4OIg5K-yPlkniodFuyRr-hf5LeBIZhMFNozA2nfGOU3cW3i_sJZgNJNf68UK_l1beTDJ5ZKEZ5ot0jgaQ7w_KlLEonaGJM4Lw7oVby-GbqmlFYe2SI9wwxcXURdW88AW4zipqCMOz_N7cBYC0zm1t4TRSW2-_uvsQWLQRA_9g8avGn8RIKr8i-ISa7sfMaUQEkY4eOtsV7l3JHNeKjmJtxSOJPwg487Cv0htwGt_3Kd6IbyFOb1l0l9wKtkIxkQqliTvAK7VXZUGr1Cdsbbhq1qy3AF1aMVPA1vghV2TOOr5rOzVkRUmTLQzU5WfsYOoNcKjJ7mPvuOirFkKvSHzBQDvZ8_B2RgwT7zMZ7LsjAhG1zS3eDTijUMi9QEM_FYkugRpZ36eg9SZWrEbHCp36y0kL7QK8gZHVP6ePvOqujXG1BCryrxp5UQ9AhZS3szhe54MDf1877LTEmCH5_utBvQqF31dlinmEWiL4YTwiSEwwUToJ38H7gmI-CWErYJsJylmuOSfUoJFpELSRi4Qw4fF-figbaB3w_BNhXvEBdUsMeSNkBkU5u4nwAfG8IJ6TxkyZZKgK4uIhG1R7mr7QaRJ_bizIRVUl&isca=1+
   2. Remove the scheme and prepend the proxy URL of `https://gtr-proxy.677472.xyz/p/`.
      * https://gtr-proxy.677472.xyz/p/00f74ba44b071b761059aef3fd79738daea1be7829-apidata.googleusercontent.com/download/storage/v1/b/dataliberation/o/20211113T212502Z%252F-4311693717716012545%252F498d83a5-1ab3-4a79-815f-e5cfda855e7a%252F1%252F869777c3-49ff-4d4e-a932-230a6b0b2a78?jk=AFshE3XT7l4gO3olRD23ASyAuaK-Lbi1Z4oc4eMBje8eLdA1mHPk-VeNNMCDno2sDlRKTKD2Nqau1HdkE9nX5f462yylgcSu5kmIknW0lU-1Xx3Mb8OnO5L-DMq3W8xslAI6vlKnqrKaTztfOKSQOfn-5XWf4OuiuDCTdstSSCcsNDMu8b4NX6cnuRhGRdVonqtH3lf9TV7fIBJMchxy3l-i3W_tiGHO7NP9B2Rnvo2uJP7-pgbfxH_ki0DLerQhKK4hRx6KeHWfXL2XT80lLVYwfS2dk5XVAplFIIV7Lp9H7x3HERQzR7_1JshhluQyoG6Vqv7gRYyav8S7PrwkKXStCho5fc85ErZ0dQqJXmvNqCtdWCB8-KzIA5-UgjlLcDzk_mVYMUfcr-_i-R-5tA_Rnb0MmavB94aIj9EfEh0g0B6yCRnAHAIuob6EYFTeCVTs7XXBlqlMKF-P0A5L2d47f0pSQrosQUNshoZKKieSl71vD3kiFDZ4OIg5K-yPlkniodFuyRr-hf5LeBIZhMFNozA2nfGOU3cW3i_sJZgNJNf68UK_l1beTDJ5ZKEZ5ot0jgaQ7w_KlLEonaGJM4Lw7oVby-GbqmlFYe2SI9wwxcXURdW88AW4zipqCMOz_N7cBYC0zm1t4TRSW2-_uvsQWLQRA_9g8avGn8RIKr8i-ISa7sfMaUQEkY4eOtsV7l3JHNeKjmJtxSOJPwg487Cv0htwGt_3Kd6IbyFOb1l0l9wKtkIxkQqliTvAK7VXZUGr1Cdsbbhq1qy3AF1aMVPA1vghV2TOOr5rOzVkRUmTLQzU5WfsYOoNcKjJ7mPvuOirFkKvSHzBQDvZ8_B2RgwT7zMZ7LsjAhG1zS3eDTijUMi9QEM_FYkugRpZ36eg9SZWrEbHCp36y0kL7QK8gZHVP6ePvOqujXG1BCryrxp5UQ9AhZS3szhe54MDf1877LTEmCH5_utBvQqF31dlinmEWiL4YTwiSEwwUToJ38H7gmI-CWErYJsJylmuOSfUoJFpELSRi4Qw4fF-figbaB3w_BNhXvEBdUsMeSNkBkU5u4nwAfG8IJ6TxkyZZKgK4uIhG1R7mr7QaRJ_bizIRVUl&isca=1+
3. Perform any `PUT` operations with a `x-ms-copy-source` header with the proxified Google Takeout URL as the value as you wish through that URL as it will survive traversing Azure and hit the proxy where the URL will be converted back to the original takeout URL.
   * You can observe that the endpoint of the proxy is HTTP/3 after the first initial connection in the Network tab. This has a lot higher limits for simultaneous connections than HTTP/1.1.

The example URL has expired, but you can use the above steps to construct your own.

You can try an alternative URL that is not expired:

https://gtr-test.677472.xyz/200MB.zip

## Limits

For anti-abuse reasons, the service is limited to test servers and Google Takeout download URLs for the aformentioned pathing issue and the Google Takeout URLs as unrestricted open proxies on the internet may be abused.

- One of the following must be true:
  - The source URL is a test URL from `*-3vngqvvpoq-uc.a.run.app` which can respond with paths that can cause issues for Azure direct downloads. The source for this can be found at: https://github.com/nelsonjchen/put-block-from-url-esc-issue-demo-server/blob/master/main.go
  - The source URL is a test URL from a test download location from `gtr-test.677472.xyz`.
  - The URL must be a valid Google Takeout download URL. Regions may have different data policies. Please create an issue if your region is unsupported.

## Design and Implementation

This tool is implemented to run on Cloudflare Workers as:

- [Cloudflare does not charge for incoming or outgoing data. No egress or ingress charges.][egress_free]
- [Cloudflare does not charge for CPU/Memory used while the request has finished processing, the response headers are sent, and the worker is just shoveling bytes between two sockets.][fetch_free]
- [Cloudflare has the peering, compute, and scalability to handle the massive transfer from Google Takeout to Azure Storage. Many of its peering points are peered with Azure and Google with high capacity links.][cf_capacity]
- Cloudflare Workers are serverless.
- Cloudflare's free tier is generous.
- Cloudflare allows fetching and streaming of data from other URLs programmatically.
- [Cloudflare Worker endpoints are HTTP/3 compatible and can comfortably connect to HTTP 1.1 endpoints.][cfhttp3]
- Cloudflare Workers are globally deployed. If you transfer from Google in the EU to Azure in the EU, the worker proxy is also in the EU and your data stays in the EU for the whole time. Same for Australia, US, and so on.

I am not aware of any other provider with the same characteristics as Cloudflare.


```mermaid
graph LR
  A[Google Takeout]--4. Download Data from Google .-> B[Cloudflare Worker]
  
  B --2. Command to Download from CF Worker.-> C[Azure Storage]
  B --3. Download from CF Worker.-> C[Azure Storage]
  Browser -- 1. Control CF Worker / Azure Storage Signed SAS.-> B
```


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
