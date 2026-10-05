# Gargantuan Takeout Rocket 2 Dev Server

Gargantuan Takeout Rocket is a project to make transloading Google Takeout data to a cloud storage provider easier.

This is a development and test server for the Gargantuan Takeout Rocket 2 project. It is a simply Golang server used to test and develop the new transloading methodology.

Google recently changed their Takeout URLs from final URLs being 15-minute expiring URLs on Google Cloud Storage to "https://takeout-download.usercontent.google.com/download/" URLs that seem to take cookies and other session information to authenticate the download. This completely breaks GTR 1 which relied on only encoding and decoding the URLs with Cloudflare Workers to work with Azure Blob Storage limitations.

GTR 2 will adjust to this new approach. URLs no longer need to be encoded and decoded. However, we'll need to have the Chrome extension to get the cookies and session information, encode it as "Authorization" headers, send it to Cloudflare Workers which will send it Azure Blob Storage which will then pass it back to Cloudflare Workers to "unwrap" the cookies and session information from the "Authorization" headers and send it to Google's Takeout download URL to authenticate for the download.

Here's a sequence diagram of the new approach:

```mermaid
sequenceDiagram
    participant ChromeExtension as GTR 2 Chrome Extension
    participant CloudflareWorkers as GTR 2 Cloudflare Workers
    participant AzureBlobStorage as Azure Blob Storage
    participant GoogleTakeout as Google Takeout

    GoogleTakeout->>ChromeExtension: Download is intercepted and final URL is given
    ChromeExtension->>ChromeExtension: Get cookies for google.com
    ChromeExtension->>CloudflareWorkers: Send final URL and google.com cookies as "Authorization" headers
    CloudflareWorkers->>AzureBlobStorage: Forward download request
    AzureBlobStorage->>CloudflareWorkers: Download from Cloudflare Workers with "Authorization" headers
    CloudflareWorkers->>GoogleTakeout: Unwrap "Authorization" headers to cookies and send to Google Takeout
    GoogleTakeout->>CloudflareWorkers: Send download
    CloudflareWorkers->>AzureBlobStorage: Send download
    AzureBlobStorage->>CloudflareWorkers: Complete/Close HTTP Request
    CloudflareWorkers->>ChromeExtension: Complete/Close HTTP Request
```

Transloads also split the data from Google Takeout so that it can be uploaded to Azure Blob Storage in chunks for speed and reliability.


## Usage

The dev server will offer a few endpoints to develop and test functionality. It is not actually part of GTR 2 itself.

### Endpoints

- `GET /setup.html` - Returns a simple web page that allows setting and unsetting cookies for testing.
- `GET /download/test.txt` - Returns a simple text file for testing. The text file is a repeat of alphanumeric characters from `a` to `z` and `0` to `9` repeated 1000 times.
  - The endpoint will require a cookie named `testcookie` with value `valid` to download the file. If this cookie is not set or has an invalid value, it will return a 302 redirect to `/setup.html`, similar to Google Takeout.
  - Supports Range requests for partial content downloads.
- `GET /download-no-cookie/test.txt` - Returns the same test file as `/download/test.txt` but without requiring any cookies.
  - This endpoint allows direct downloads without authentication.
  - Also supports Range requests for partial content downloads.
- `GET /download-gtr2cookie-auth/test.txt` - Returns the same test file but requires an `Authorization` header with the scheme `Gtr2Cookie` and data `testcookie=valid`.
  - This simulates the GTR 2 mechanism where cookies are passed via Authorization headers.
  - Returns `401 Unauthorized` if the header is missing or invalid.
  - Also supports Range requests for partial content downloads.


Those three endpoints will log a lot of information to the console to help with debugging and testing.

### Deployment

Threw this out with `gcloud run deploy --source .`.

https://gtr-2-dev-server-262382012399.us-central1.run.app/