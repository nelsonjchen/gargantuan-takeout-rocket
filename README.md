# 🚀 Gargantuan Takeout Rocket

WIP STATUS NOT READY YET

*Liftoff from Google into the Azure, very fast*

Gargantuan Takeout Rocket (GTR) is a toolkit of instructions and software to help you take out your data from Google Takeout and put it somewhere *else* safe. At the moment, the only destination is Microsoft Azure Blob Storage.

In particular, GTR's target audience is:

* You have a lot of data on Google.
 * The original author of GTR's Google account is about 1.25TB in size (80% Youtube Videos, 20% other, Google Photos ~200GB).
* You want to have access to your data in case something bad happens to your Google account such as a compromise or errant automated activity on Google's part.
* You want to back your account to somewhere that isn't Google.
* The following built-in backup Google Takeout target options are out:
    * Google Drive
        * Google hosted destinations are unacceptable for backup targets.
    * Dropbox
        * For 1TB, this will cost about $12 per month to backup.

* You are cheap and want to back it up somewhere cheap. Azure Blob Storage Archive class costs about $0.99 per TB.
* You have a to-do app or calendar app that can make recurring tasks every 3 months.
* You are OK with backing their Google Data to somewhere archival-oriented and not interested in looking at their backups unless something really bad actually happens.

## TODO

* Cleanup Extension
* Investigate Azure Encryption Key Stuff. Have Azure encrypt at rest with a public key.
* Document Document Document Refine

## Social Posts of Interest

### "Google banned my account!"

### Complaints about

### Other people backing up to S3 and their setups.