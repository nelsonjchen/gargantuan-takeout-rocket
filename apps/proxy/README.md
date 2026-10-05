# Gargantuan Takeout Rocket Proxy

This is the Cloudflare Workers proxy component of [Gargantuan Takeout Rocket (GTR)][gtr], a toolkit to quickly backup Google Takeout archives to Azure Storage at extremely high speeds and low cost.

This proxy is required as:

- **Google Takeout requires cookies for authentication.** Azure Blob Storage is unable to pass cookies when commanded to download from a URL. This proxy injects the necessary cookies into the request.
- **Speed.** To transfer fast, we tell Cloudflare Workers to fetch from Google with 1000MB chunks simultaneously at nearly 50 connections at a time for 50GB files from the extension and put the data onto Azure as chunks. [Unfortunately, talking to Azure's endpoints only support 6 connections and thus only 6 requests at a time from a web browser due to Azure Storage's endpoints only supporting HTTP/1.1](https://learn.microsoft.com/en-us/rest/api/storageservices/http-version-support).

Cloudflare Workers can be used to address these issues:

- By serving as a secure bridge that holds and injects authentication cookies.
- Cloudflare Workers are accessed over HTTP/3 or HTTP/2 which web browsers multiplex requests over a single connection and aren't bound by the 6 connections limit in the browser. This can be used to convert Azure's HTTP 1.1 endpoint to HTTP/3 or HTTP/2 and the GTR extension in the browser can command more chunks to be downloaded by Azure simultaneously through the proxy. Speeds of up to around 8.7GB/s can be achieved with this proxy from the browser versus 180MB/s with a direct connection to Azure's endpoint. For reliability reasons, this is limited to 300MB/s, but that's still fairly high speed and you can scale connections up.

# Usage

In general, you are expected to use the [Gargantuan Takeout Rocket (GTR)][gtr] extension with this.

## Public Instance

A public instance is hosted at https://gtr-proxy.677472.xyz that anybody may use with GTR. The front page of https://gtr-proxy.677472.xyz just goes to the GitHub repository for the proxy. The 677472.xyz (`67=g`, `74=t`, and `72=r` from ASCII) domain was chosen because it was $0.75 every year for numeric only `.xyz` domains and I wanted the bandwidth metrics for my personal site separated from this service. Visiting the domain will redirect to this GitHub repository.

You are welcome to use the public instance for any load. You should mind the [privacy policy](https://github.com/nelsonjchen/gargantuan-takeout-rocket/blob/main/PRIVACY_POLICY.md) though.

Logs are not stored on this service but I reserve the right to stream the logs temporarily to observe and curb abuse if necessary.

## Private Instance

You should be interested in running your own private instance so your primary Google Takeout data does not go through my public proxy.

You can try a Google Takeout with a small, non-sensitive, or already public data on a non-important Google account to produce a Google Takeout test archive to test the public instance of the proxy to get familiar with the GTR toolkit first before setting up a private instance of this proxy for your actual sensitive and non-public takeout data.

Use this easy-to-use button:

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/nelsonjchen/gtr-proxy)

Out of the box, you should be able to use your `workers.dev` domain.

Updates to this proxy may or may not be required in the future. If so, simply delete the old repository and old worker and redeploy.

The proxy should be usable within the free tier limits of Cloudflare Workers at a personal scale.

## Limits

For anti-abuse reasons, the public proxy is limited to specific domains and paths:

1.  **Google Takeout**:
    - `apidata.googleusercontent.com` (paths starting with `/download/storage/v1/b/dataliberation/o/` or `/download/storage/v1/b/takeout`)
    - `storage.googleapis.com` (paths starting with `/takeout-`)
    - `takeout.google.com` or `takeout-download.usercontent.google.com` (paths starting with `/takeout/download` or `/download`)
2.  **Test Servers**:
    - `*-3vngqvvpoq-uc.a.run.app`

Requests to other domains or paths will be rejected.

## Design and Implementation

This tool is implemented to run on Cloudflare Workers as:

- [Cloudflare does not charge for incoming or outgoing data. No egress or ingress charges.][egress_free]
- [Cloudflare does not charge for CPU/Memory used while the request has finished processing, the response headers are sent, and the worker is just shoveling bytes between two sockets.][fetch_free] Other providers may charge for allocated CPU usage while all that's being done is shoving bytes. Most connections in GTR tend to last about 50 seconds. You are "charged" 1 ms per connection but other providers may charge 50 seconds.
- [Cloudflare has the peering, compute, and scalability to handle the massive transfer from Google Takeout to Azure Storage. Many of its peering points are peered with Azure and Google with high capacity links.][cf_capacity]
- Cloudflare Workers are serverless.
- Cloudflare's free tier is generous.
- The worker can be deployed with a button.
- Cloudflare allows fetching and streaming of data from other URLs programmatically.
- [Cloudflare Worker endpoints are HTTP/3 compatible and workers can comfortably connect to HTTP 1.1 endpoints.][cfhttp3]
- Cloudflare Workers are globally deployed. If you transfer from Google in the EU to Azure in the EU, the worker proxy is also in the EU and your data stays in the EU for the whole time. Same for Australia, US, and so on. Other providers force users to choose regions and they better choose correctly or otherwise they get a large bandwidth bill or users are unknowingly transferring data across undesired borders.

I am not aware of any other provider with the same characteristics as Cloudflare.

### Authentication and Cookies

Google Takeout requires requests to be authenticated with cookies. This proxy supports passing these cookies.

The client (e.g., the GTR extension) must:
1.  Capture the required google.com cookies from the Google Takeout session.
2.  Compress the cookie string using zlib (deflate).
3.  Base64 encode the compressed data.
4.  Append the encoded string as the `a` query parameter to the proxied URL.

The proxy then:
1.  Decodes the base64 string.
2.  Decompresses the zlib data.
3.  Injects the cookies into the `Cookie` header of the upstream request to Google.

**Note:** This mechanism is handled automatically by the GTR extension.


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
