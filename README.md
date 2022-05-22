# 🚀 Gargantuan Takeout Rocket

*Liftoff from Google Takeout into Azure Storage, repeatedly, **very** fast, like 1GB/s+ or 10 minutes total per takeout fast*

<img width="553" alt="Screen Shot 2022-04-22 at 12 26 14 PM" src="https://user-images.githubusercontent.com/5363/164781196-01e1f0d7-6aa3-4b89-a161-8c983663297c.png">

* Setup Time: < 1hr
* Every x month(s): 10 minutes.

Gargantuan Takeout Rocket (GTR) is a toolkit of guides and software to help you take out your data from [Google Takeout][takeout] and put it somewhere *else* safe easily, periodically, and fast to make it easy to do the right thing of backing up your Google account and related services such as your YouTube account or Google Photos periodically.

GTR is not a fully automated solution as that is impossible with Google Takeout's anti-automation measures, but GTR is an assistive solution. GTR takes a less than an hour to setup and less than 10 minutes every 2 months (or whatever interval you want) to use. The cost to backup 1TB on Azure every month is $1 dollar a month as long as your store each backup archive for 6 months at a minimum. You don't need a fast internet connection on your client to use this tool as all data transfer from Google to the backup destination is handled remotely by many servers in data centers. There are no bandwidth charges for the backup process. All resources used are serverless and are almost practically infinitely scalable including to zero.

The only backup destination currently available in GTR is Microsoft Azure Blob Storage due to Azure's unique [API which allows commanding Azure Blob Storage to download from a remote URL][pbfu]. A Cloudflare Worker proxy is used to work around a [URL escaping bug][azbesc] and [a parallelism limitation][azb11] in the Azure Blob Storage API. Speeds of up to 1GB/s or more from Google Takeout to Azure Blob Storage's Archive Tier can be seen with this setup.

A [browser extension][ext] is provided to intercept downloads from Google Takeout and command Azure to download the file. Behind the scenes, the extension immediately stops and prevents the local download, discovers the temporary (valid 15 minutes) direct URL to download the Google Takeout Archive, analyzes the size of the source file remotely to generate a download plan consisting of file chunks of 1000MB, specially encodes the URL so Azure is able download from Google via the Cloudflare Worker proxy, executes the download plan by shotgunning all the download commands in parallel to Azure through the Cloudflare Worker proxy to transload the file from Google as quickly as possible, and commits all the 1000MB chunks into one seamless file on Azure. The download for each file completes in 30 to 60 seconds, well before the direct URL expires in 15 minutes and with no limits on how many parallel downloads of this archive or other archives in the same takeout can be happening at once.  

A public instance of the Cloudflare worker proxy is provided for convenience but users can setup and run their own [Cloudflare worker proxy][proxy] if desired and target their own proxy in the extension instead of the public one for privacy reasons. For most users who are looking to run their own Cloudflare workers proxy instead of using the public Cloudflare workers proxy, the free tier of Cloudflare workers should suffice.

The original author of GTR's Google account is about 1.25TB in size (80% Youtube Videos, 20% other, Google Photos ~200GB). Pre-GTR, the backup procedure would have taken at least 3 hours even with a [VPS Setup][vps_fxp] facilitating the transfer from Google Takeout as even large instances on the cloud with large disks, much memory, and many CPUs would eventually choke with too many files being downloaded in parallel. The highest speed seen was about 300MB/s. It was also exhaustively high-touch and toilsome, requiring many clicks, reauthorizations, and setup of the workspace. By delegating the task of downloading to Azure with assists from CloudFlare workers and the browser extension that makes up GTR, the original author is able to transfer the 1.25TB of 50GB Google Takeout files to Azure Storage in 10 minutes at anytime with little to no setup.

GTR is right for you if:

* You think you have a lot of data on Google Takeout and Google Takeout-compatible properties such as YouTube.
* You fear Google banning your account for "reasons" with an emphasis on the quote part.
* You generally intend to continue to use Google services and this is not a one-time export.
* You want to have access to your data in case something bad happens to your Google account such as an errant automated ban.
* You want to backup your account to somewhere that else isn't Google and are OK with Microsoft.
* You want to back it up somewhere cheap ($1/TB/mo).
* You have a to-do app or calendar app that can make recurring tasks, events, or alarms every 3 months or whatever interval you wish to perform backups at.
* You are OK with backing their Google Data to somewhere archival-oriented with a high access cost and not interested in looking at the backups unless something really bad actually happens. 
* You are OK with storing backup archives for a minimum of 6 months or are OK with an early deletion fee that is as if you've stored the data for 6 months.
* You don't want to setup up temporary cloud compute instances or machines and manually facilitate the transfer.
* You want to quickly transfer out at 1GB/s+, in parallel, outward.
* You have a slow internet connection.
* You don't have the space to temporaily store the data.
* You are OK with or want to spend less than 10 minutes every desired backup interval manually initiating the transloads with clicking.

## Initial Preparation

This guide is a continual work in progress. PRs are very much welcome!

If you need some help or questions or whatever, feel free to hit me up over [Twitter][twitter] or make an issue.

Let me know if the guide works for you as well!

### Setup Azure

This is something that you'll only have to do once.

1. You need a Microsoft Azure Account. Make one and put some payment information in.
2. Setup a Storage Account. Here's a decent video on how to do so: https://www.youtube.com/watch?v=jeFb_scHuZQ
   * Region: Look at cheapest for Archive, then preferred location at https://azure.microsoft.com/en-us/pricing/details/storage/blobs/. The par is $0.00099 per GB.
   * Replication: LRS ([Store backups in only one physical location in a location](https://docs.microsoft.com/en-us/azure/storage/common/storage-redundancy#locally-redundant-storage))
3. Create a blob container as seen in https://www.youtube.com/watch?v=jeFb_scHuZQ
   * Record the name of your blob container.
4. Setup Lifecycle Rules as seen in https://www.youtube.com/watch?v=-3k0hhngt7o
   * Archive Tier after 1 day
   * Delete after 180 days
     * Early deletion of archives incures a fee equal to as if you've stored the archive for the rest of the 180 day minimum.

You can adjust the numbers and redundancies as needed or desired.

### Setup or configure own Cloudflare Workers GTR Proxy (Optional)

See [GTR proxy readme][proxy] for details on setting one up yourself. You may want to setup your own proxy for privacy reasons. The Cloudflare Worker is serverless and there are no fees or usage accrued while it is idle. There are also no charges for incoming and outgoing bandwidth and for most people, their usage of their own proxy should fall under Cloudflare's free tier.

If you decided to use the public GTR proxy, please see the [privacy policy on it](./PRIVACY_POLICY.md). 

### Install Extension

Install the [extension][ext_install] in a Chromium-derived browser such as Google Chrome, Edge, Opera, Brave, and etc. At the moment, the extension is not published in the web store and it might never be. Look at the purpose of this repository and guess why from this diagram below:

![Ban?](https://user-images.githubusercontent.com/5363/163745558-da7f0626-f895-46ea-9b7d-14e527a1c24b.png)

I have no intention of risking my Google account to publish the extension. I assure you it's not malware but I can't say a Google robot might think differently. I'm not eager to be testing the worst case scenario; I'm just interested in preparing for it.

The extension has a rocket icon. 🚀. If you don't see it, click on the puzzle icon and click the rocket icon.

<img width="116" alt="Screen Shot 2022-04-17 at 7 53 09 PM" src="https://user-images.githubusercontent.com/5363/163747035-b79b8781-28b3-4a54-b711-80ef88be15ef.png">

The extension UI can be seen by clicking on the rocket icon. This may or may not be the current UI but it should be something like this

<img width="520" alt="image" src="https://user-images.githubusercontent.com/5363/163747077-3cf27e72-78f5-40da-8712-1bb2459617a3.png">

If you've setup your own Cloudflare Workers proxy, set the `GTR Proxy Base URL` to yours. The default URL in the field is the public instance.

### Setup Calendar or To-do app

On your planner application of choice, remind yourself every 2 months (or whatever interval you want) to perform a backup using this. I have Todoist setup to remind me every 2 months. 

## First Time and Every 2 Months (or whatever interval you want)

### Backing Up

1. Initiate a [Google Takeout](https://takeout.google.com). It may take hours or day(s) to complete.
   * You may want to try this tool with something small and insubstantial on the first run to give it a try. Smaller takeout jobs take less time to be made available for download.
   * "Production" Takeout jobs are best done with 50GB archives to reduce the number of clicking required. You should use ZIP as the solid archives of TAR aren't useful on already compressed data.
2. Once complete, visit the Azure Blob container you made in the preparation and "Create a SAS Signature" with all the permissions (Read, Add, Write, Create, and Delete).
   * ![portal azure com_](https://user-images.githubusercontent.com/5363/163125758-7383aafa-ded8-4592-a753-5e8bb717c1df.png)
3. `Generate SAS Token and URL` and copy the `Blob SAS URL`.  
   * ![portal azure com_ (1)](https://user-images.githubusercontent.com/5363/163125969-1e151b8c-43e7-49e9-87e9-d3d788220d90.png)
   * Hint: there's a copy to clipboard button on the right edge of the field.
4. Paste the Blob SAS URL into the extension popup at the correct field.
   * <img width="511" alt="image" src="https://user-images.githubusercontent.com/5363/163747552-22b51c99-553f-4aec-970c-a69cce4b940e.png">
5. Enable the extension to intercept downloads with the checkmark popup.
   * <img width="506" alt="image" src="https://user-images.githubusercontent.com/5363/163747584-850dd276-47e9-4dff-b5cf-20b61b948c58.png">
6. Visit Google Takeout and click download on each archive. Watch for failures. Slow down if there are failures.
7. Notifications will come and go as each archive is transloaded into Azure Blob Storage.
8. Once complete, check Azure to make sure everything has been retrieved and is available in the container.
   * Beware of downloading the archives to your local machine as Azure charges about $4.50 per 50GB download. Just check that they are there. If you wish to check the contents, you should spin up a virtual machine in Azure and download the data to that instance for inspection. That is beyond the scope of this guide.
10. Disable the extension in the popup as it isnt needed.
   * <img width="509" alt="image" src="https://user-images.githubusercontent.com/5363/163747622-4abef856-ac3b-4304-a6c2-2fccad9a41f9.png">

---

## Social Posts of Interest

### "Google banned my account!"

* https://news.ycombinator.com/item?id=24965432
* https://news.ycombinator.com/item?id=15989146
* https://news.ycombinator.com/item?id=28621412

and there's many more. oh there's just so many. too many.

### Complaints about Takeout being hard to use

just search twitter for "google takeout". you'll find users complaining about sizes and archive amounts quite a lot.

### Other people backing up to cloud storage and their setups and possible futures.

A future version of GTR may include S3 and S3-compatible APIs as a destination. There may be a possiblity to teach Cloudflare Workers to facilitate this in a highly parallel manner like was done for Azure. Unfortunately, S3 does not have a similar "download from a remote server" API. However, we might be able to teach Cloudflare Workers to use itself to transload.

I'm also **extremely** curious about storing the "hot" data in [Cloudflare R2][r2]. Without ingress or egress fees, one could transload and stage Takeout archives there temporaily and download it for a local backup and have it be compatible/resumeable with their download manager of choice.

In the meantime:

* https://gunargessner.com/takeout

* https://sjwheel.net/cloud/computing/2019/08/01/aws_backup.html

* https://benjamincongdon.me/blog/2021/05/03/Backing-up-my-Google-Takeout-data/

* https://tyler.io/my-familys-photo-and-video-library-backup-strategy-in-2020/

The general idea of these is to use a single EC2/VPS instance to handle the coordination and traffic. Congdon's solution clocked in at about 65MB/s. 

I used Azure's "Standard_L8s_v2" for my instance and that topped out at about 300MB/s when writing to the temporary local NVMe storage before uploading from that to Azure Storage. The CPU was pegged pretty hard during my transfer so this kind of makes me think how much CPU time I'm using to do many GB/s of transfer. Probably a lot. And I'm not really paying for the CPU to do TLS as the cloud vendors are paying. Great!

## Other targets to try

Haven't tried, not sure. Might be something to try. YMMV, stuff may break. 

In general, the high parallelism and concurrency that GTR relies on is a product of Google Takeout ultimately serving takeout archives with signed URLs to Google Cloud Storage, their S3-like object storage offering. Google Cloud Storage is *very* robust, *very* available, and *very* scalable. If you try the interceptor with something else, the intercepted URL needs to have no limit on parallelism and concurrency and not use cookies to validate access.

Services to try:

* ~thefacebook.com~
  * Haven't tried. Doubt GTR's current audience cares. But they have a Takeout too. Fun fact, their "takeout" natively supports Backblaze B2 as a target! Very much "they warned me Satan would be attractive" indeed!
  * Not sure if object storage based or has limits on concurrency and parallelism.
  * Uses cookies. Would need a Cloudflare proxy to allow cookies to be transported over the URL.
* Atlassian Cloud JIRA/Confluence's Backup for Cloud
  * [Atlassian had a massive outage around April 2022 when they permanently deleted customer systems **and their backups**.](https://newsletter.pragmaticengineer.com/p/scoop-atlassian?s=r)
  * If you paid attention to how Atlassian hosted their cloud offerings, you got the impression it was still very pet-like for every customer with customer support being able to login to each tenant's box even if it was camouflaged.
  * At a previous job, I had a reminder every month to backup our Atlassian Cloud JIRA and Confluence instance. The recent news about the major Atlassian outages vindicates my diligence. The procedure was not unlike Google Takeout with having to start a "Backup for Cloud" and then downloading an archive of all the data. It wasn't 1.25TB like my Google Takeout, but it was hoving around ~30GB for JIRA and ~30GB for Confluence. Of course, your organization's backup size may vary but in general the files are somewhat large. It would then be a task in itself to re-upload these files to durable storage. 
  * Not sure if object storage based. Probably wasn't earlier when it was "Atlassian OnDemand", but probably is now. It might have been hosted on S3.
  * Pretty sure it does not use cookies to validate access.
  * Could be signed AWS S3 URLs.
  * Haven't tried. 

Let me know if you try something and it works. Don't bother trying it on traditional server hosted Linux ISO mirrors though. They tend to limit concurrency and aren't object storage based.

## The Name

I got inspired watching SpaceX launch rockets with a pile of Merlin engines. Starship is definitely a BFR! The fact it launched with "off the shelf" rockets combined in parallel to launch such huge amounts was definitely inspirational somewhat to the architecture. Hence, GTR.


[vps_fxp]: https://sjwheel.net/cloud/computing/2019/08/01/aws_backup.html
[pbfu]: https://docs.microsoft.com/en-us/rest/api/storageservices/put-block-from-url
[azb11]: https://docs.microsoft.com/en-us/rest/api/storageservices/http-version-support
[azbesc]: https://docs.microsoft.com/en-us/answers/questions/641723/i-can39t-get-azure-storage-to-support-putting-data.html
[congdon]: https://benjamincongdon.me/blog/2021/05/03/Backing-up-my-Google-Takeout-data/]
[ext]: https://github.com/nelsonjchen/gtr-ext
[ext_install]: https://github.com/nelsonjchen/gtr-ext#installation
[proxy]: https://github.com/nelsonjchen/gtr-proxy
[takeout]: https://takeout.google.com
[twitter]: https://twitter.com/crazysim
[r2]: https://blog.cloudflare.com/introducing-r2-object-storage/
