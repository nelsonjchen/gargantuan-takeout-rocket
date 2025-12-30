# Privacy Policy

Garguantuan Takeout Rocket (GTR) is produced by Nelson Chen in California as free and open source software as well as a guide.

Privacy concerns are taken very seriously as this software suite handles Google cookies, Google Takeout or similar data of which the data is likely to be extremely personal, identifiable, and sensitive.

Please reach out to me if you have any concerns and I will do my best to address them.

GTR is made of two software components:

- [GTR Extension][gtr-ext]
- [GTR Proxy][gtr-proxy]

GTR Extension collects user-initiated browser download links, Google cookies, and when activated, encodes them, and contacts GTR Proxy to transload the data. GTR Extension also contacts GTR Proxy to command Azure Blob Storage to download the data from the download links with the cookies encoded. GTR Extension will also directly contact Azure Blob Storage as well as part of the orchestration of the transloading. No other data is collected or sent to external services.

URLs entered into GTR will include Google cookies. They are extremely sensitive. If leaked, they could be used to access your Google account. You are likely able to revoke them by signing out the devices at https://myaccount.google.com/device-activity. 

A public instance of GTR Proxy is provided for evaluation use. I reserve the right to temporarily stream and temporaily retain the logs of the public GTR Proxy instance for a short period of time to curb any reported abuse or solve technical issues. Logs are not shared with any other parties.

You are strongly encouraged to run your own GTR Proxy instance on Cloudflare. Instances of GTR Proxy only report information to the owners who are running them on Cloudflare and data from those instances of GTR Proxy are not accessible to me. There is no "phone home" in GTR Proxy self-hosted installations. Instructions to deploy self-hosted installation copies of GTR Proxy can be found in the [GTR Proxy repository][gtr-proxy]. GTR Proxy can only run on Cloudflare Workers and GTR users who wish to run their own self-hosted installations of GTR Proxy should mind Cloudflare's own [Privacy Policy][cfps].

As all transcluded data is stored on Azure Blob Storage, users should refer to Microsoft's [Privacy Statement][msps] for their Privacy Policy and how Microsoft handles that data. Microsoft's policy is between you and Microsoft. At the moment, data landing in Azure is [unencrypted][unencrypted]. That said, it is *much* easier and quite fast to encrypt the data once it has landed in Azure with its rich compute functionality and then delete the unencrypted data; instructions for this are unfortunately still TODO and we welcome PRs to add this documentation. 

[unencrypted]: https://github.com/nelsonjchen/gargantuan-takeout-rocket/issues/3
[gtr-ext]: https://github.com/nelsonjchen/gtr-ext#readme
[gtr-proxy]: https://github.com/nelsonjchen/gtr-proxy#readme
[cfps]: https://www.cloudflare.com/privacy/
[msps]: https://privacy.microsoft.com/en-us/privacystatement#mainenterprisedeveloperproductsmodule
