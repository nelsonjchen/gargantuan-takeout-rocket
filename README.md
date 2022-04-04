# 🚀 Gargantuan Takeout Rocket

WIP STATUS NOT READY YET AND SO IS THIS GUIDE

*Liftoff from Google into the Azure, very fast*

Gargantuan Takeout Rocket (GTR) is a toolkit of instructions and software to help you take out your data from Google Takeout and put it somewhere *else* safe. At the moment, the only destination is Microsoft Azure Blob Storage due to Azure's unique API which allows instructing Azure to download from a remote source.

In particular, GTR's target audience is:

* You have a lot of data on Google.
  * The original author of GTR's Google account is about 1.25TB in size (80% Youtube Videos, 20% other, Google Photos ~200GB).
* You generally intend to continue to use Google. This is not a one-time affair.
* You want to have access to your data in case something bad happens to your Google account such as a compromise or errant automated activity on Google's part.
* You want to back your account to somewhere that isn't Google.
* You are cheap and want to back it up somewhere cheap. Azure Blob Storage Archive class costs about $0.99 per TB. The built-in targets of Google Takeout aren't this cheap.
* You have a to-do app or calendar app that can make recurring tasks every 3 months.
* You are OK with backing their Google Data to somewhere archival-oriented and not interested in looking at their backups unless something really bad actually happens.
* You don't want to spin up cloud compute instances and send commands and whatnot.
* You want to quickly transfer out at 5GB/s, in parallel, out.

## Preparation

TODO

init takeout a day before

setup azure container with lifecycle rules

optional: setup gtr-proxy in own cloudflare account

get sas url

install extension

enable extension

paste sas url

download all takeout links

check files exist

disable extension

set calendar/todo app repeat

## TODO

* Cleanup Extension
* Investigate Azure Encryption Key Stuff. Have Azure encrypt at rest with a public key.
* Document Document Document Refine

## Social Posts of Interest

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
