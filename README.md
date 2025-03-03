# Gargantuan Takeout Rocket 2 Proxy

This is the Cloudflare Workers proxy component of [Gargantuan Takeout Rocket 2 (GTR2)][gtr], a toolkit to quickly backup Google Takeout archives to Azure Storage at extremely high speeds and low cost.

It is a rewrite of the original GTR Proxy as the original GTR Proxy wrapped and unwrapped URLs. In GTR Proxy 2, we unwrap the `Authorization` header as cookies to be passed onwards to Google.

This proxy is required as:

- Microsoft's Azure Storage, when downloading from remote sources, is unable to set the Cookie header to be able to download from Google's Takeout URLs. This is a problem as Google Takeout URLs require cookies to be set to download the data.
- To transfer fast, we tell Cloudflare Workers to fetch from Google with 1000MB chunks simultaneously at nearly 50 connections at a time for 50GB files from the extension and put the data onto Azure as chunks. [Unfortunately, talking to Azure's endpoints only support 6 connections and thus only 6 requests at a time from a web browser (even through a browser extension) due to Azure Storage's endpoints only supporting HTTP/1.1](https://learn.microsoft.com/en-us/rest/api/storageservices/http-version-support).

Cloudflare Workers can be used to address these issues:

- We can control the `Authorization` header via the (`x-ms-copy-source-authorization: <scheme> <signature>` header)[putblockfromurl]. Cloudflare Workersr can use this header to set cookies to talk to Google from the data in the `Authorization` header.
- Cloudflare Workers are accessed over HTTP/3 or HTTP/2 which web browsers multiplex requests over a single connection and aren't bound by the 6 connections limit in the browser. This can be used to convert Azure's HTTP 1.1 endpoint to HTTP/3 or HTTP/2 and the GTR extension in the browser can command more chunks to be downloaded by Azure simultaneously through the proxy. Speeds of up to around 8.7GB/s can be achieved with this proxy from the browser versus 180MB/s with a direct connection to Azure's endpoint. For reliability reasons, this is limited to 1.0GB/s, but that's still fairly high speed.

A public instance of this service is provided, but you may want to run your own private instance of this proxy for privacy reasons. If so, here is the source.

# Usage

In general, you are expected to use the [Gargantuan Takeout Rocket (GTR)][gtr] extension with this.

## Public Instance

A public instance is hosted at https://gtr-proxy.677472.xyz that anybody may use with GTR. The front page of https://gtr-proxy.677472.xyz just goes to the GitHub repository for the proxy. The 677472.xyz (`67=g`, `74=t`, and `72=r` from ASCII) domain was chosen because it was $0.75 every year for numeric only `.xyz` domains and I wanted the bandwidth metrics for my personal site separated from this service. Visiting the domain will redirect to this GitHub repository.

You are welcome to use the public instance for any load. You should mind the [privacy policy](https://github.com/nelsonjchen/gargantuan-takeout-rocket/blob/main/PRIVACY_POLICY.md) though.

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

https://takeout-download.usercontent.google.com/download/takeout-20241222T093656Z-002.zip?j=3647d71e-7af8-4aa7-9dc1-1f682197329a&i=1&user=798667665537&authuser=0

The cookie for google.com to download from there may look like this:

```
SOCS=37wce-vIcZBl7dO_5nFTjJMngTwis4VAjovonE2iPwlC4fzGIZHNhq2woiVo8qioivd1KfbO7deIXVv1;
SID=gSk36hDHFEgRdagLfTeDZ16Z-kNAktOcPkQ5BfhPO3YRy1mwnF28qdmItkwbum/Ey5fMlVU2FQVNn-ZgV5yZKYQdbaZNKoYrreVpuQGqwuB.zcZagmIi5HamJJ__40EH2gag3RoeO6HngypKQZ.w5NsV/YuUBu_V;
__Secure-1PSID=ktYPxfJZNRUHG76Nd8ur4ZFVZ/kW03X1Bq/XJx.fDMRsJYIQ0LyPLLdHR.BES0pNVsz2e/_bpg.yDkPeuo31S/TDEDC/u-zx4M3bmp8zWyim.3aYEofWOaTJ4sVvXZMMtp5_qovKkve/OoCd/axJ91O6kYwel-/1;
__Secure-3PSID=IRDrpcDPhZ0bvrZvMUHoGS9dYyo/GJDAohmN7s-BP.yFU.F574B04wfU0_eGNyLsbnOPe_zjGPyDgjlDH3y5/UzL7octAQVOoLYzdmOdI8FzqNpWMTEsMygA_.Y0R-XWMi9Vf3HpaPD7SMPbdo_lVl/CEVaKZ3Ct;
HSID=_HuLLhqnCMisz2JSLnaqg2l/;
SSID=e1WFh5rHSV2zLlUkP1bssTPd;
APISID=fgk08DbZZA-UZ4VHHak.Czu9.53Oi0S0kbcT4jDWemaNF0pvtFbY3sV3f/jRNSjm4L4ZYwcLcbSy1rhb;
SAPISID=3kgc0BdGF60S/ZZG41Ht_.iSiMcrLqksFK7UeMzyin0JaIKV3WeyH4j2mDap7iAvFwXIC4zCU0cqkL7x;
__Secure-1PAPISID=iVgYeursBnNeS0Y9h5fYGp7oAyzLKCGRDKekJREgaH.ed1144GIboxdJ03UMJJX4QhBHgIXYVw00BfJI;
__Secure-3PAPISID=i6L9Id6QPFeVZ5HWPVSy_h3gGUrQPS-0Iy_Ctq2h0eyOUBekgVb-I2AK0d._MHefjgFL0B3Ucb/9d/eN;
AEC=/iHS/oYenlhLo/a6h7m83EL8/hPx7phpChS7DNvr;
NID=Z2gjndWHS3xV719VvNRQRFBJYONwICXzyZuxCzxcL4Iqtlh9Uandl6miu73o6D9e1R1/dWBJ-1U44w0sMheUjcxzzBwAQpGmfK-VVHu5IA8dbHKspsmS2zE/Ho5/nj-XG6gZRz.SeUiXOdmn-6iEJ2D.yc6bJvPMMKZap7OfTaFoDBI2GFs4YBBAb/-RzMf_vv5Xee54Je2zM_zRr-FSbz6q.lujzilHrki_9/rP4w_aQHCDIwCa173XSgdA9HrHKWNF2ZNCn22R0sNNaU60snJMfOOt__vYltDegeEAgva-w/CkAmYt7_QRSxmAfGSMxeAY_F3et1HK63QxB.ZVPsYbMj-XSLijTJD0jZoKSe2k0VQCKsXmR.8/IS_/TTRvBuieHsQ6p2Hdc1Nw.k6Pz6Q_72BaiS9ytNBUY.pbMv3MVuDzMNJp7MxYzzop-fj.IhboDU33w-1rw2JtXc/KAfO3f2VpJzPOFGAr7Ny2QrxspDw62it23Qsw2-/lCUPWXMcrZJEv;
__Secure-1PSIDTS=aDCAK7xxrvFazkMBeMLtwAw6.NNZePownq6jcXAjSz75rZrKNQkJS0CIE5S6kRZSEf52vRnz_qCdmQnU;
__Secure-3PSIDTS=eIIXDjrVv-Ebf0cG_GnG9miP/adeik9YxXRuvAOM_C/iKfdoUiSWuVRshxF3jwrwPj9u2PgyJzxQT1I4;
SIDCC=BaaFrOcsAVaeOuGHeD/m5CQripHVuJ-rCpvqJVOprKQsMZwF75kGLxednAUie7zk_osEFp/ibFISO3lP;
__Secure-1PSIDCC=5LBUKDUZGgLpIzhVF19MjCUBAybsFl43v_0I.R216HOKEOd1ktv9Trm5JwhC-OSs69nxYGvrqoK53Cf_;
__Secure-3PSIDCC=2i1fwb-_c22HuZ6j_AbhE1mP-7KxqsKsTG.1mVmo-EkY/WIh3Dex/JbwLnZd-4y0c-Ns-HNAmfP7CfAk;
```

To be honest, I don't know what all of these cookies do. I just know that they are necessary to download from Google Takeout URLs and I'm not in the business of reverse engineering Google's cookies. That's OK, we'll just send them all!

1. Get your original SAS URL from Azure and append a blob name to it in the path. For our example, we'll use this for `data.dat` in the `some-container` container of the `urlcopytest` storage account:
   https://urlcopytest.blob.core.windows.net/some-container/data.dat?sp=r&st=2022-04-02T18:23:20Z&se=2022-04-03T06:24:20Z&spr=https&sv=2020-08-04&sr=c&sig=KNz4a1xHnmfi7afzrnkBFtls52YIZ0xtzn1Y7udqXBw%3D
2. The account name is `urlcopytest`. Construct a new proxyfied URL as such with the storage account name, the container name, the blob name and relevant SAS parameters as the first, second, third, and fourth path segments and parameters respectively:
   https://gtr-proxy.677472.xyz/p-azb/urlcopytest/some-container/data.dat?sp=r&st=2022-04-02T18:23:20Z&se=2022-04-03T06:24:20Z&spr=https&sv=2020-08-04&sr=c&sig=KNz4a1xHnmfi7afzrnkBFtls52YIZ0xtzn1Y7udqXBw%3D
3. Transform the Google Takeout URL to the gtr-proxy 2 URL. The above Takeout URL would be transformed to:
   https://gtr-proxy.677472.xyz/p/takeout-download.usercontent.google.com/download/takeout-20241222T093656Z-002.zip?j=3647d71e-7af8-4aa7-9dc1-1f682197329a&i=1&user=798667665537&authuser=0
4. Perform any `PUT` operations with a `x-ms-copy-source` header with the Proxified Google Takeout URL and `x-ms-copy-source-authorization` header with the cookie data with a special `Gtr2Cookie` scheme. It should be like `Authorization: Gtr2Cookie <Google Cookie Data, all joined with ; no space as-is>`
   * You can observe that the endpoint of the proxy is HTTP/3 after the first initial connection in the Network tab. This has a lot higher limits for simultaneous connections than HTTP/1.1.
   * Additionally, the final destination Google Takeout endpoint should see that the Cookie header is set to the Google Takeout cookie data even though Azure Storage does not support setting the Cookie header. This is accomplished by the proxy converting the `Authorization` header that Azure Storage does support setting to the `Cookie` header that Google Takeout requires.

The example URL has expired, but a test server is setup here:

https://gtr-2-dev-server-262382012399.us-central1.run.app/

## Limits

For anti-abuse reasons, the service is limited to test servers and Google Takeout download URLs for the aformentioned pathing issue and the Google Takeout URLs as unrestricted open proxies on the internet may be abused.

- One of the following must be true:
  - The source URL is a test URL from a test download location from https://gtr-2-dev-server-262382012399.us-central1.run.app/ which is set up for testing purposes.
  - The URL must be a valid Google Takeout download URL.

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
- Cloudflare Workers are globally deployed. If you transfer from Google in the EU to Azure in the EU, the worker proxy is also in the EU and your data stays in the EU for the whole time. Same for Australia, US, and so on. Other providers force users to choose and they better choose correctly or otherwise they get a large bandwidth bill or users are unknowingly transferring data across undesired borders.

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
[putblockfromurl]: https://learn.microsoft.com/en-us/rest/api/storageservices/put-block-from-url?tabs=microsoft-entra-id