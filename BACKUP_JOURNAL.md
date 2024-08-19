# Nelson's Personal Backup Journal

Just wanted to provide a journal of my backup escapades with GTR since:

* It's good to show punctuality.
* It's good to show GTR is still working.
* There are rough edges with GTR/Google Takeout.
* Set a good example.

Top will be the latest.

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
