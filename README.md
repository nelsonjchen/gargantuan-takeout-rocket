# 🚀 Gargantuan Takeout Rocket

*Liftoff from Google Takeout into Azure, repeatedly, **very** fast*

🏗️: This project is still under construction. 

Gargantuan Takeout Rocket (GTR) is a toolkit of guides and software to help you take out your data from [Google Takeout][takeout] and put it somewhere *else* safe easily, periodically, and fast to make it easy to do the right thing of backing up your Google account periodically.

GTR is not a fully automated solution as that is impossible with Google Takeout's anti-automation measures, but it is an assistive solution. GTR takes a less than an hour to setup and less than 10 minutes every 3 months (or whatever interval you want) to use. The cost to backup 1TB on Azure every month is $1 dollar a month as long as your store the each archive for 6 months at a minimum. You don't need a fast internet connection on your client to use this tool as all data transfer from Google to the backup destination is handled remotely by servers in data centers. There are no bandwidth charges for the backup process.

The only backup destination currently available in GTR is Microsoft Azure Blob Storage due to Azure's unique [API which allows commanding Azure Blob Storage to download from a remote URL][pbfu]. A Cloudflare Worker proxy is used to work around a [URL escaping bug][azbesc] and [a parallelism limitation][azb11] in the Azure Blob Storage API. Speeds of up to 6GB/s or more from Google Takeout to Azure Blob Storage's Archive Tier can be seen with this setup.

A [browser extension][ext] is provided to intercept downloads from Google Takeout and command Azure to download the file. Behind the scenes, the extension immediately stops and prevents the local download, discovers the direct URL to download the Google Takeout Archive, analyzes the size of the source file remotely to generate a download plan consisting of file chunks of 600MB, specially encodes the URL so Azure is able download from Google via the Cloudflare Worker proxy, and executes the download plan by shotgunning all the download commands in parallel to Azure through the Cloudflare Worker proxy to transload the file from Google as quickly as possible. 

A public instance of the Cloudflare worker proxy is provided but users can run their own [Cloudflare worker proxy][proxy] if desired and target their own proxy in the extension instead of the public one for privacy reasons. For most users who are looking to run their own Cloudflare workers proxy instead of using the public Cloudflare workers proxy, the free tier of Cloudflare workers should suffice.

The original author of GTR's Google account is about 1.25TB in size (80% Youtube Videos, 20% other, Google Photos ~200GB). Pre-GTR, the backup procedure would have taken at least 3 hours even with a [VPS Setup][vps_fxp] facilitating the transfer from Google Takeout as even large instances on the cloud with large disks, much memory, and many CPUs would eventually choke with too many files being downloaded in parallel. The highest speed seen was about 300MB/s. It was also exhaustively high-touch and toilsome, requiring many clicks, reauthorizations, and setup of the workspace. By delegating the task of downloading to Azure with assists from CloudFlare workers and the browser extension that makes up GTR, the original author is able to transfer the 1.25TB of 50GB Google Takeout files to Azure Storage in 3 minutes at anytime with little to no setup.

GTR is right for you if:

* You think you have a lot of data on Google Takeout and Google Takeout-compatible properties such as YouTube.
* You generally intend to continue to use Google services and this is not a one-time export.
* You want to have access to your data in case something bad happens to your Google account such as an errant automated ban.
* You want to backup your account to somewhere that else isn't Google and are OK with Microsoft.
* You want to back it up somewhere cheap ($1/TB/mo).
* You have a to-do app or calendar app that can make recurring tasks, events, or alarms every 3 months or whatever interval you wish to perform backups at.
* You are OK with backing their Google Data to somewhere archival-oriented with a high access cost and not interested in looking at the backups unless something really bad actually happens. 
* You are OK with storing backup archives for a minimum of 6 months or are OK with an early deletion fee that is as if you've stored the data for 6 months.
* You don't want to setup up temporary cloud compute instances or machines and manually facilitate the transfer.
* You want to quickly transfer out at 6GB/s+, in parallel, outward.
* You have a slow internet connection.
* You don't have the space to temporaily store the data.
* You are ok or want to spend less than 3 minutes every backup interval manually initiating the transloads.

## Initial Preparation

👷 Guide under construction.

This guide is a continual work in progress. PRs are very much welcome!

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
    * 

You can adjust 

### Setup or configure own Cloudflare Workers Proxy (Optional)

See [proxy setup readme][proxy] for details. You may want to setup your own proxy for privacy reasons. The Cloudflare Worker is serverless and there are no fees or usage accrued while it is idle. 

### Install Extension

Install [extension][ext]. At the moment, it is not published in the web store and it might never be. Look at the purpose of this repository and guess why from this diagram below:

![Ban?](https://user-images.githubusercontent.com/5363/163745558-da7f0626-f895-46ea-9b7d-14e527a1c24b.png)

I have no intention of risking my Google account to publish the extension.

The extension has a rocket icon. 🚀

The extension UI can be seen by clicking on the rocket icon.

If you've setup your own Cloudflare Workers proxy, set the `GTR Proxy Base URL` to yours.

### Setup Calendar or To-do app

On your planner, remind yourself every 3 months (or whatever interval you want) to do this.

## Every 3 Months (or whatever interval you want)

### Backing Up

1. Initiate a [Google Takeout](https://takeout.google.com). It may take hours or day(s) to complete.
2. Once complete, visit the Azure Blob container you made in preparation and "Create a SAS Signature" with all the permissions.
  * ![portal azure com_](https://user-images.githubusercontent.com/5363/163125758-7383aafa-ded8-4592-a753-5e8bb717c1df.png)
3. `Generate SAS Token and URL` and copy the `Blob SAS URL`. Hint: there's a copy to clipboard button on the right of the field. 
  * ![portal azure com_ (1)](https://user-images.githubusercontent.com/5363/163125969-1e151b8c-43e7-49e9-87e9-d3d788220d90.png)
4. Paste the Blob SAS URL into the extension popup at the correct field.
5. Enable the extension to intercept downloads with the checkmark popup.
6. Visit Google Takeout and click download on each archive. 
7. Notifications will come and go as each archive is transloaded into Azure Blob Storage.
8. Once complete, check Azure to make sure everything has been retrieved.
9. Disable the extension in the popup as it isnt needed.


---

# Social Posts of Interest

### "Google banned my account!"

* https://news.ycombinator.com/item?id=24965432

### Complaints about Takeout being hard to use

just search twitter
### Other people backing up to cloud storage and their setups.

A future version of GTR may include S3 and S3-compatible APIs as a destination. There may be a possiblity to teach Cloudflare Workers to facilitate this in a highly parallel manner.

In the meantime:

* https://gunargessner.com/takeout

* https://sjwheel.net/cloud/computing/2019/08/01/aws_backup.html

* https://benjamincongdon.me/blog/2021/05/03/Backing-up-my-Google-Takeout-data/

The general idea of these is to use a single EC2/VPS instance to handle the coordination and traffic. Congdon's solution clocked in at about 65MB/s.


[vps_fxp]: https://sjwheel.net/cloud/computing/2019/08/01/aws_backup.html
[pbfu]: https://docs.microsoft.com/en-us/rest/api/storageservices/put-block-from-url
[azb11]: https://docs.microsoft.com/en-us/rest/api/storageservices/http-version-support
[azbesc]: https://docs.microsoft.com/en-us/answers/questions/641723/i-can39t-get-azure-storage-to-support-putting-data.html
[congdon]: https://benjamincongdon.me/blog/2021/05/03/Backing-up-my-Google-Takeout-data/]
[ext]: https://github.com/nelsonjchen/gtr-ext
[proxy]: https://github.com/nelsonjchen/gtr-proxy
[takeout]: https://takeout.google.com
