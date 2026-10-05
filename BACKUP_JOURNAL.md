# Nelson's Personal Backup Journal

Just wanted to provide a journal of my backup escapades with GTR since:

* It's good to show punctuality.
* It's good to show GTR is still working.
* There are rough edges with GTR/Google Takeout.
* Set a good example.

Top will be the latest.

## October 2026

* 22 ZIP archives, sans YouTube and YouTube Music. About 673 GB (626.54 GiB), all available parts transloaded to Azure without any archive transfer failures.
* **Codex drove this one.** Revived the project, polished the extension, watched Gmail for the export, and did the browser clicking through Computer Use. I wasn't the one clicking through Takeout.
* Still a bit jank. Browser control needed recovery, Google wanted repeated sign-ins, and the extension still needed its service worker's DevTools window open. The passkey was handy again. Got it done, but there's still work before this is a reliable unattended workflow.
* Started with a small Contacts-only Takeout, about 4.68 MB. Its Google and Azure copies matched by SHA-256, and the ZIP passed its CRC checks. For the full export, every archive's filename and exact byte size matched the committed Azure blob. Google didn't expose archive checksums, so that wasn't a full content checksum verification.
* Google failed to export Google Play Movies & TV. All 22 available parts and the export report are backed up, but that missing data is still missing.
* The popup is much more usable now: clearer settings, credential expiry, actual block progress, a separate finalizing step, and useful errors. Old pending entries no longer pretend they're still transferring.
* Existing retention is still Archive after 2 days, delete after 180 days. Older backups are already gone from this container. This full backup becomes eligible for deletion April 3, 2027; the Contacts test April 2. Azure's background processing decides the actual deletion time.
* Next up: stop needing DevTools, add a transfer queue, and make the Azure reconciliation part of the tool itself.

## March 2026

* 9.8TB takeout, 149 archives again
* Such a PITA, thinking of vibing some quality of life changes.
* Noticed that having a passkey to-relogin easily available was quite handy. Hmm.

## December 2025

* Major thanks to @fcfort for fixing the issue with Google Takeout not working and porting the toolkit to use Google cookies.
* Unfortunately, reliability and performance has kind of dropped like a rock. By not having direct access to signed Google Storage URLs, we're forced to go through their application server. We top out at 300MB/s now instead of 1GB/s. Even with a lot of parallelism, it tops out. 
* 9.8TB takeout, 149 archives
    * A lot of this is 360 5K/8K videos on YouTube. I'm probably going to exclude them next time. I have the raw file sources on my NAS already. I do want the non-360 stuff though. Not sure how to make this work in the future.
* Having some reliability issues with the extension. Definitely not as reliable as it used to be which wasn't great anyway. Settled for a less than 100% success rate. 
* Later made a 500GB Takeout, 13 archives, sans YouTube
    * Still very much in need using proper background APIs for Chrome extensions for downloads, stalled otherwise.
    * Had some reliability issues with extension. Gave up a bit for now.
    * Did it from my TrueNAS running Chrome in a container.
    * Latere sync'd back up to Azure and deleted 9TB takeout since I wasn't sure if I wanted to keep that in Azure. Yay for Fiber, but not happy about not using GTR.

## December 2024

* Scheduled Takeout failed once. WIP
* 2nd Takeout worked. 
* Unfortunately, Google has changed their Takeout URL scheme completely. https://github.com/nelsonjchen/gargantuan-takeout-rocket/issues/11
* I guess I'll let my 5TB takeout rot away for now. 

## October 2024

* Scheduled takeout worked fine. No complete failure or errors.
* Google stored data into `datalibration` bucket. So faster transfer for me back in the US.
* Broke the 4TB range at 4.2 TB. I have even more 360 videos and 4K videos now. Admittedly, these are not the "raw" files but the output files for YouTube compatibility.
* Added 530 as a code to resume upon.

## August 2024

* Scheduled takeout worked fine. No complete failure or errors
* Google stored data into `takeout-eu` bucket.
* Broke the 3TB range. Seemd to have hit ceiling with Azure Ingress limits at times. Just backed off. This stuff now takes me 30 minutes.

## June 2024

* Scheduled takeout worked fine. No complete failure or errors
* Google stored data into `takeout-eu` bucket. So slower transfer for me back to US again. Did 3 or 4 simutaneous transfers. Still seems to work!
* Broke the 2TB range. I got an 360 camera and its 360 videos are huge too. Here's to 3TB soon, haha!

## April 2024

* Scheduled takeout worked fine. No complete failure or errors
* Google stored data into `takeout-eu` bucket. So slower transfer for me back to US.
* Changed README to make inspecting the service worker mandatory.

## February 2024

<img width="625" alt="image" src="https://github.com/nelsonjchen/gargantuan-takeout-rocket/assets/5363/3f776bfd-f45c-4ea7-a0f1-58e4fb5f9c9f">

* Google Takeout kept completely failing
* Had to split up services.
* Made it to two takeouts.
* Still about ~1.6TB? Something around there must have been deleted in my own cleanup.
* Bucket for some of them are in "datalibration" bucket. Everything back to US?
* Otherwise, the transfer was pretty uneventful and it worked rather well.

## December 2023

* Still 1.7TB. 33 Archives
* Takeout bucket is also suffxied with EU and probably in EU this time. The slow speeds are a pain. Is it possible they are sending all data to the EU, even US-only persons data?
* Made a small QOL change to the extension to list highest number'd files at the top.
* No failures, but the slower speeds made me go slower and take about thrice as long. Still, GTR has been a **godsend**. I can't imagine trying to rip 1.7TB out of a hardcore authenticated web browser backend to safety any other way.

## October 2023

* Largest takeout so far at 1.7TB. 32 "archives" or files.
* Had to retry Google Takeout initialization process a few times. Unchecked a few services that constantly failed the overall takeout.
* Google chose to store my backup in a bucket named "takeout-eu"? Speeds noticibly dropped to about 800MB/s.
* Takeout bucket possibly hosted in EU region felt slower. Could definitely really only have about ~150GB/min up in the air rather than a soft limit.
* First time having a collision where it downloads and tries to commit over an already archived file. Happens because file happens to be large and has a non-unique filename due to being a large video file from YouTube. Coincidental collision. Not too worried but hopefully the next takeout won't conflict and it will be a one-off known issue. Could cause a brief period of no backup for said file.

## August 2023

Not sure why I am doing this again. Didn't realize I did this in July. Anyway, ran into some issues at 2AM where it seems the backups seemed to fail more to transfer than day. Added and edited some robustness to gtr-ext. It now seems to transload much, much more reliably :).

## July 2023

Had issues with Google Takeout not putting out or failing. Eventually once succeeded.

Started backing up. Forgot I was on old extension in the old MacBook. Updated it. Cmd-Clicked down 3 at a time. Some failures. Followed up on them.

Got interrupted with tech support request from father in the middle of backup procedure; Super happy this was serverless and I could just resume backing up right after. 😄

Was able to fully backup to Azure.
