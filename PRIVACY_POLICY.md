# Privacy Policy

Garguantuan Takeout Rocket (GTR) is produced by Nelson Chen in California as free and open source software.

Privacy concerns are taken very seriously as this software suite handles Google Takeout or similar data of which the data is likely to be extremely personal, identifiable, and sensitive.

Please reach out to me if you have any concerns and I will do my best to address them.

GTR is made of two software components:

- [GTR Extension][gtr-ext]
- [GTR Proxy][gtr-proxy]

GTR Extension collects user-initiated browser download links when activated, encodes them, and contacts GTR Proxy to transload the data. GTR Extension also contacts GTR Proxy to command Azure Blob Storage to download the data from the download links it encodes. GTR Extension will also directly contact Azure Blob Storage as well as part of the orchestration of the transloading. No other data is collected or sent to external services.

URLs entered into GTR are expected to be time-limited. For example, an URL to a Google Takeout file is only valid for only 15 minutes. URLs for Azure Blob Storage entered into GTR also expected to be valid only for a limited amount of time of which the duration is up to the user during their creation. Users should construct Azure Blob Storage URLs that are only valid for the duration of the backup procedure and not longer and the GTR guide will provide guidance on how to construct such URLs.

A public instance of GTR Proxy is provided for evaluation and production use. However, I reserve the right to temporarily stream and temporaily retain the logs of the public GTR Proxy instance for a short period of time to curb any reported abuse or solve technical issues. Logs are not shared with any other parties.

If the privacy policy of the public instance of GTR Proxy is a concern for you, you can run your own instance of GTR Proxy on Cloudflare. Instances of GTR Proxy only report information to the owners who are running them on Cloudflare and data from those instances of GTR Proxy are not accessible to me. There is no "phone home" in GTR Proxy self-hosted installations. Instructions to deploy self-hosted installation copies of GTR Proxy can be found in the [GTR Proxy repository][gtr-proxy]. GTR Proxy can only run on Cloudflare Workers and GTR users who wish to run their own self-hosted installations of GTR Proxy should mind Cloudflare's own [Privacy Policy][cfps].

As all transcluded data is stored on Azure Blob Storage, users should refer to Microsoft's [Privacy Statement][msps] for their Privacy Policy and how Microsoft handles that data. Microsoft's policy is between you and Microsoft. At the moment, data landing in Azure is [unencrypted][unencrypted]. It is *much* easier to encrypt the data once it has landed in Azure with its rich compute functionality and then delete the unencrypted data; instructions for this are unfortunately still TODO. 

[unencrypted]: https://github.com/nelsonjchen/gargantuan-takeout-rocket/issues/3
[gtr-ext]: https://github.com/nelsonjchen/gtr-ext#readme
[gtr-proxy]: https://github.com/nelsonjchen/gtr-proxy#readme
[cfps]: https://www.cloudflare.com/privacy/
[msps]: https://privacy.microsoft.com/en-us/privacystatement#mainenterprisedeveloperproductsmodule
