"""One-shot source discovery for an approved export; the existing service copies bytes.

Reads credentials only from one service-owned unfinished job and keeps its copy
in memory. The manifest and progress journal contain no credentials. No timer,
network listener, browser/profile access, credential renewal, or destination change.
"""
import argparse
import datetime as dt
import fcntl
import json
import os
from pathlib import Path
import socket
import stat
import time
import urllib.error
import urllib.parse as url
import urllib.request
import uuid


class Stop(Exception):
    pass


def private_json(path):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise Stop("Unsafe local metadata permissions")
    return json.loads(path.read_text())


def save(path, value):
    temporary = path.with_name(path.name + ".new")
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "w") as stream:
        json.dump(value, stream, indent=2)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)


def validate_manifest(manifest):
    try:
        if str(uuid.UUID(manifest["exportId"])) != manifest["exportId"]:
            raise ValueError()
    except (KeyError, ValueError, TypeError):
        raise Stop("Invalid export identity") from None
    entries = manifest.get("entries", [])
    if not entries or len(entries) > 1000 or len({e.get("name") for e in entries}) != len(entries):
        raise Stop("Invalid source manifest")
    for i, entry in enumerate(entries):
        name = entry.get("name")
        if entry.get("part") != i + 1 or not isinstance(name, str) or not name or "/" in name or "\\" in name or name in (".", ".."):
            raise Stop("Invalid source manifest")
    return entries


def source_for(template, export_id, entry):
    parsed = url.urlsplit(template)
    query = url.parse_qs(parsed.query)
    if (parsed.scheme != "https" or parsed.hostname != "takeout-download.usercontent.google.com"
            or not parsed.path.startswith("/download/") or parsed.username or parsed.password
            or set(query) != {"j", "i", "user", "authuser"}
            or query["j"] != [export_id] or any(len(v) != 1 for v in query.values())):
        raise Stop("Source template does not match the approved export")
    query["i"] = [str(entry["part"] - 1)]
    return url.urlunsplit(parsed._replace(path="/download/" + url.quote(entry["name"], safe=""), query=url.urlencode(query, doseq=True)))


def proxy_source(source, authorization):
    return authorization["proxy"] + "/p/" + source.replace("%2F", "%252F").split("://", 1)[1] + "&a=" + url.quote(authorization["cookies"], safe="")


def head(address, source=False):
    try:
        with urllib.request.urlopen(urllib.request.Request(address, method="HEAD", headers={
            "User-Agent": "GTR-Export-Queue/0.6", "x-ms-version": "2021-08-06"
        }), timeout=40) as response:
            content_type = response.headers.get("content-type", "")
            if source and "text/html" in content_type.lower():
                raise Stop("Google sign-in is required")
            return {"bytes": int(response.headers.get("content-length") or 0), "jobId": response.headers.get("x-ms-meta-gtr_job")}
    except urllib.error.HTTPError as error:
        if not source and error.code == 404:
            return None
        raise Stop("Google sign-in is required" if source and error.code in (401, 403) else "Remote header check failed") from None
    except Stop:
        raise
    except Exception:
        raise Stop("Remote header check timed out or was interrupted") from None


def blob_url(container, name):
    parsed = url.urlsplit(container)
    return url.urlunsplit(parsed._replace(path=parsed.path.rstrip("/") + "/" + url.quote(name, safe="")))


def check_expiry(authorization):
    query = url.parse_qs(url.urlsplit(authorization["container"]).query)
    try:
        expires = dt.datetime.fromisoformat(query["se"][0].replace("Z", "+00:00"))
        if expires <= dt.datetime.now(dt.timezone.utc) + dt.timedelta(seconds=90):
            raise ValueError()
    except Exception:
        raise Stop("Existing Azure access is expired or too close to expiry") from None


class Client:
    def __init__(self, directory):
        self.directory = directory

    def request(self, method, params=None, request_id=None):
        request = {"id": request_id or uuid.uuid4().hex, "method": method}
        if params is not None:
            request["params"] = params
        name = "ingest.sock" if method == "submit" else "control.sock"
        try:
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as connection:
                connection.settimeout(90)
                connection.connect(str(self.directory / name))
                connection.sendall(json.dumps(request).encode() + b"\n")
                data = b""
                while b"\n" not in data:
                    chunk = connection.recv(65536)
                    if not chunk or len(data) > 1048576:
                        raise ValueError()
                    data += chunk
                response = json.loads(data.split(b"\n")[0])
        except Exception:
            raise Stop("Service response is unknown; reconcile the saved request before restarting") from None
        if not response.get("ok"):
            raise Stop("Service did not accept the request; inspect its own status")
        return response["result"]


def choose(entries, held, jobs, known):
    owned = {j["name"] for j in jobs}
    return sorted((e for e in entries if e["part"] not in held and e["name"] not in owned and e["name"] not in known), key=lambda e: (e.get("displayMiB", 1e12), e["part"]))


def size_matches_display(length, expected_mib):
    # Google displays GB with two decimal places: half a display step is
    # 0.005 GiB (5.12 MiB), even near the bottom of the GB range.
    rounding_mib = 5.12 if expected_mib >= 1024 else 1
    return length > 0 and abs(length / 1048576 - expected_mib) <= max(rounding_mib, expected_mib * .002)


def scope(source):
    parsed = url.urlsplit(source)
    query = url.parse_qs(parsed.query)
    return parsed.scheme, parsed.hostname, *(tuple(query.get(key, [])) for key in ("j", "user", "authuser"))


def refresh_owned_jobs(state, client, template, authorization, journal, journal_path):
    """Refresh only idle jobs already owned in this same account and export."""
    if client.request("status")["active"]:
        raise Stop("Let the service's current requests settle before refreshing access")
    for entry in state["jobs"].values():
        job = entry["job"]
        if job["state"] == "complete" or scope(job["source"]) != scope(template):
            continue
        if entry["authorization"] == authorization and job["state"] == "queued":
            continue
        metadata = head(proxy_source(job["source"], authorization), source=True)
        if not metadata or metadata["bytes"] <= 0 or (job.get("plan") and metadata["bytes"] != job["plan"]["length"]):
            raise Stop("Refreshed source does not match the existing job plan")
        request_id = uuid.uuid4().hex
        receipt = {"id": request_id, "name": job["name"], "state": "requested", "jobId": job["id"]}
        journal.setdefault("refreshRequests", {})[request_id] = receipt
        save(journal_path, journal)
        result = client.request("submit", {"name": job["name"], "source": job["source"], **authorization}, request_id)
        if result["jobId"] != job["id"]:
            raise Stop("Authorization refresh did not preserve the existing job")
        receipt["state"] = "accepted"
        save(journal_path, journal)


def run(args):
    manifest = private_json(args.manifest)
    entries = validate_manifest(manifest)
    directory_info = args.service_dir.lstat()
    if not stat.S_ISDIR(directory_info.st_mode) or directory_info.st_uid != os.getuid() or directory_info.st_mode & 0o077:
        raise Stop("Unsafe service directory permissions")
    state = private_json(args.service_dir / "state.json")
    entry = state["jobs"].get(args.auth_job)
    if not entry or entry["job"]["state"] == "complete" or not entry["authorization"].get("cookies"):
        raise Stop("An unfinished service-owned job with current Google access is required")
    template = entry["job"]["source"]
    authorization = dict(entry["authorization"])
    if url.urlunsplit(url.urlsplit(authorization["container"])._replace(query="")) != state["policy"]["container"] or authorization["proxy"] != state["policy"]["proxy"]:
        raise Stop("Service authorization does not match its existing policy")
    source_for(template, manifest["exportId"], entries[0])
    check_expiry(authorization)
    client = Client(args.service_dir)
    journal = private_json(args.journal) if args.journal.exists() else {"exportId": manifest["exportId"], "requests": {}}
    receipts = list(journal["requests"].values()) + list(journal.get("refreshRequests", {}).values())
    if journal["exportId"] != manifest["exportId"] or any(r["state"] == "requested" for r in receipts):
        raise Stop("An earlier request needs reconciliation before restarting")
    known = manifest.get("knownCommitted", {})
    for name, size in known.items():
        blob = head(blob_url(authorization["container"], name))
        if not blob or blob["bytes"] != size:
            raise Stop("An existing verified backup no longer matches Azure")
    held = set(manifest.get("holdParts", []))
    first = next((r for r in journal["requests"].values() if r.get("first")), None)
    resumed = False
    try:
        proof = head(proxy_source(template, authorization), source=True)
        if not proof or proof["bytes"] <= 0 or (entry["job"].get("plan") and proof["bytes"] != entry["job"]["plan"]["length"]):
            raise Stop("Current source authorization could not be verified")
        refresh_owned_jobs(state, client, template, authorization, journal, args.journal)
        last_source_check = time.monotonic()
        while True:
            check_expiry(authorization)
            # Capacity can remain full throughout a long retry backoff. Check
            # access there too, so expired Google access pauses promptly.
            if time.monotonic() - last_source_check >= 60:
                proof = head(proxy_source(template, authorization), source=True)
                if not proof or proof["bytes"] <= 0:
                    raise Stop("Current source authorization could not be verified")
                last_source_check = time.monotonic()
            status = client.request("status")
            jobs = status["jobs"]
            if not status["storageHealthy"] or status["reservations"] or any(j["state"] == "blocked" for j in jobs):
                raise Stop("The existing service needs attention")
            if status["paused"]:
                if not args.resume or resumed:
                    raise Stop("The service is paused")
                client.request("resume")
                resumed = True
            else:
                resumed = True
            unfinished = [j for j in jobs if j["state"] != "complete"]
            manifest_names = {item["name"] for item in entries}
            completed_names = set(known) | {j["name"] for j in jobs if j["state"] == "complete"}
            journal.update(observedAt=status["observedAt"], completed=len(completed_names & manifest_names), unfinished=len(unfinished), heldParts=sorted(held), phase="running")
            journal.pop("reason", None)
            save(args.journal, journal)
            if first and first["state"] != "verified":
                found = next((j for j in jobs if j["id"] == first["jobId"]), None)
                if found and found["state"] == "complete":
                    blob = head(blob_url(authorization["container"], first["name"]))
                    if not blob or blob["bytes"] != first["bytes"] or blob["jobId"] != first["jobId"]:
                        raise Stop("First direct commit could not be independently verified")
                    first["state"] = "verified"
                    save(args.journal, journal)
                    print(json.dumps({"event": "first_direct_commit_verified", "part": first["part"], "bytes": first["bytes"]}), flush=True)
                else:
                    time.sleep(3)
                    continue
            candidates = choose(entries, held, jobs, known)
            if not candidates:
                if unfinished:
                    time.sleep(3)
                    continue
                journal["phase"] = "held_parts" if held else "complete"
                save(args.journal, journal)
                return
            archive_limit = status.get("archiveLimit", 3)
            if type(archive_limit) is not int or not 1 <= archive_limit <= 6:
                raise Stop("The service reported an invalid archive limit")
            if len(unfinished) >= archive_limit:
                time.sleep(3)
                continue
            part = candidates[0]
            name = part["name"]
            if head(blob_url(authorization["container"], name)) is not None:
                raise Stop("An unrecognized destination blob exists; nothing was overwritten")
            source = source_for(template, manifest["exportId"], part)
            metadata = head(proxy_source(source, authorization), source=True)
            expected_mib = part.get("displayMiB", 0)
            if not metadata or not size_matches_display(metadata["bytes"], expected_mib):
                raise Stop("Source archive size does not match the visible export manifest")
            request_id = uuid.uuid4().hex
            receipt = {"id": request_id, "part": part["part"], "name": name, "bytes": metadata["bytes"], "state": "requested", "first": first is None}
            journal["requests"][name] = receipt
            save(args.journal, journal)
            result = client.request("submit", {"name": name, "source": source, **authorization}, request_id)
            receipt.update(state="accepted", jobId=result["jobId"])
            if first is None:
                first = receipt
            save(args.journal, journal)
            print(json.dumps({"event": "queued", "part": part["part"], "name": name, "bytes": metadata["bytes"]}), flush=True)
            if not resumed and status["paused"] and args.resume:
                client.request("resume")
                resumed = True
    except Stop as error:
        journal.update(phase="needs_attention", reason=str(error))
        save(args.journal, journal)
        # Let current batches settle; preserve all service-owned plans and blocks.
        try:
            client.request("pause")
        except Stop:
            pass
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--auth-job", required=True)
    parser.add_argument("--journal", type=Path, required=True)
    parser.add_argument("--service-dir", type=Path, default=Path.home() / "Library/Application Support/GTR/agent")
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()
    lock_path = args.journal.with_suffix(".lock")
    fd = os.open(lock_path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise SystemExit("One producer already owns this export")
    try:
        run(args)
    except (Stop, KeyError, ValueError):
        # Status journal contains fixed diagnostics; don't print URL-bearing errors.
        print(json.dumps({"event": "stopped", "reason": "Check the private export queue journal and service status"}), flush=True)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
