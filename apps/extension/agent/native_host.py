#!/usr/bin/env python3
"""One-way new-download ingress. Never reads extension history or controls it."""
import argparse
import datetime
import json
import os
from pathlib import Path
from urllib.parse import urlsplit
import socket
import stat
import struct
import sys

MAX_REQUEST = 16_384


def audit(directory, event, **details):
    # Only derived flags/counts and fixed error codes, never request contents.
    permitted = {"matches", "method", "ok", "error", "payloadBytes", "cookieBytes", "sourceHostAllowed", "sourcePathAllowed", "destinationMatches", "proxyMatches"}
    safe = {key: value for key, value in details.items() if key in permitted and isinstance(value, (str, bool, int))}
    try:
        parent = Path(directory)
        info = parent.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
            return
        fd = os.open(parent / "native-ingress.jsonl", os.O_WRONLY | os.O_CREAT | os.O_APPEND | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, "w") as output:
            info = os.fstat(output.fileno())
            if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077 or info.st_size > 1_048_576:
                return
            output.write(json.dumps({"time": datetime.datetime.now(datetime.timezone.utc).isoformat(), "event": event, **safe}) + "\n")
    except Exception:
        pass


def read_exact(stream, count):
    chunks = bytearray()
    while len(chunks) < count:
        part = stream.read(count - len(chunks))
        if not part:
            raise ValueError("Truncated native frame")
        chunks.extend(part)
    return bytes(chunks)


def read_frame(stream):
    length = struct.unpack("=I", read_exact(stream, 4))[0]
    if not 0 < length <= MAX_REQUEST:
        raise ValueError("Invalid native frame size")
    return json.loads(read_exact(stream, length).decode("utf-8"))


def write_frame(stream, value):
    payload = json.dumps(value, ensure_ascii=False).encode("utf-8")
    if len(payload) > MAX_REQUEST:
        raise ValueError("Oversized native response")
    stream.write(struct.pack("=I", len(payload)) + payload)
    stream.flush()


def ingest(directory, request):
    if not isinstance(request, dict) or request.get("method") not in ("submit", "capacity"):
        return {"ok": False, "error": "only_new_job_submission_or_capacity_allowed"}
    if request["method"] == "capacity":
        request = {"id": os.urandom(16).hex(), "method": "capacity"}
    else:
        params = request.get("params", {})
        source = urlsplit(params.get("source", ""))
        destination = urlsplit(params.get("container", ""))
        try:
            policy = json.loads((Path(directory) / "policy.json").read_text())
        except Exception:
            policy = {}
        audit(directory, "submission_received", method="submit", payloadBytes=len(json.dumps(request).encode()),
              cookieBytes=len(params.get("cookies", "")),
              sourceHostAllowed=source.hostname in ("apidata.googleusercontent.com", "storage.googleapis.com", "takeout.google.com", "takeout-download.usercontent.google.com"),
              sourcePathAllowed=source.path.startswith(("/download", "/takeout/download", "/takeout-")),
              destinationMatches=f"{destination.scheme}://{destination.netloc}{destination.path}" == policy.get("container"),
              proxyMatches=params.get("proxy") == policy.get("proxy"))
    info = Path(directory).lstat()
    endpoint = Path(directory) / "ingest.sock"
    sock_info = endpoint.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise ValueError("Unsafe service directory")
    if not stat.S_ISSOCK(sock_info.st_mode) or sock_info.st_uid != os.getuid() or sock_info.st_mode & 0o077:
        raise ValueError("Unsafe service socket")
    payload = json.dumps(request).encode("utf-8") + b"\n"
    if len(payload) > MAX_REQUEST:
        raise ValueError("Oversized request")
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
        client.settimeout(30)
        client.connect(str(endpoint))
        client.sendall(payload)
        response = bytearray()
        while b"\n" not in response:
            chunk = client.recv(4096)
            if not chunk or len(response) + len(chunk) > MAX_REQUEST:
                raise ValueError("Incomplete or oversized response")
            response.extend(chunk)
    result = json.loads(response.split(b"\n", 1)[0])
    safe_error = result.get("error")
    known_errors = {"submission_outside_policy", "legacy_reservation_unresolved", "source_identity_conflict", "outcome_unknown", "request_id_conflict", "operation_interrupted", "wrong_endpoint", "invalid_request"}
    audit(directory, "service_response", method=request["method"], ok=bool(result.get("ok")), error=safe_error if safe_error in known_errors else "none_or_unspecified")
    # Return only a durable acknowledgement, never service state/authorization.
    if result.get("ok"):
        receipt = result.get("result", {})
        if request["method"] == "capacity":
            return {"ok": True, "result": {key: receipt.get(key) for key in ("availableSlots", "paused", "needsAttention")}}
        return {"ok": True, "jobId": receipt.get("jobId"), "owner": "gtr-transfer-service"}
    return {"ok": False, "error": "submission_not_acknowledged"}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("origin")
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    config = json.loads(Path(args.config).read_text())
    audit(config["stateDirectory"], "origin_check", matches=args.origin == config["allowedOrigin"])
    if args.origin != config["allowedOrigin"]:
        return 64
    try:
        result = ingest(config["stateDirectory"], read_frame(sys.stdin.buffer))
    except Exception:
        audit(config["stateDirectory"], "ingress_interrupted")
        result = {"ok": False, "error": "ingress_unavailable_or_outcome_unknown"}
    write_frame(sys.stdout.buffer, result)
    return 0


if __name__ == "__main__":
    sys.exit(main())
