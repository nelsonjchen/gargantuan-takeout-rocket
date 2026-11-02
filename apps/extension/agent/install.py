#!/usr/bin/env python3
"""Prepare or install GTR's reviewed local service. No dependencies downloaded."""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import sys
from urllib.parse import urlsplit


def plan(home, extension_id, policy_file, node):
    if not re.fullmatch(r"[a-p]{32}", extension_id):
        raise ValueError("Expected the existing Chromium extension ID")
    policy = json.loads(Path(policy_file).read_text())
    container = urlsplit(policy["container"])
    proxy = urlsplit(policy["proxy"])
    if (container.scheme != "https" or not container.hostname.endswith(".blob.core.windows.net")
            or not re.fullmatch(r"/[a-z0-9-]{3,63}", container.path)
            or container.query or container.fragment or container.username or container.password
            or proxy.scheme != "https" or proxy.path or proxy.query or proxy.fragment or proxy.username or proxy.password
            or not isinstance(policy.get("reservations"), list)
            or any(not isinstance(n, str) for n in policy["reservations"])):
        raise ValueError("Review a credential-free container/proxy policy first")
    directory = Path(home) / "Library/Application Support/GTR/agent"
    registration = Path(home) / "Library/Application Support/Microsoft Edge/NativeMessagingHosts/com.gtr.agent.json"
    origin = f"chrome-extension://{extension_id}/"
    return {"directory": str(directory), "registration": str(registration), "allowedOrigin": origin,
            "node": str(Path(node).resolve()), "policy": policy,
            "newNetworkPorts": [], "startsService": False, "grantsBrowserPermission": False}


def write_private(file, text, executable=False):
    file.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd = os.open(file, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o700 if executable else 0o600)
    with os.fdopen(fd, "w") as out:
        out.write(text)
        out.flush()
        os.fsync(out.fileno())


def apply(reviewed):
    source = Path(__file__).resolve().parent
    bundle = source / "build/gtr-agent.cjs"
    if not bundle.is_file():
        raise ValueError("Build the service before installation")
    directory = Path(reviewed["directory"])
    registration = Path(reviewed["registration"])
    # First install only: never replace a running installation or another host.
    if directory.exists() or registration.exists():
        raise ValueError("Existing service installation found; review it before replacing files")
    directory.mkdir(parents=True, mode=0o700)
    write_private(directory / "policy.json", json.dumps(reviewed["policy"], indent=2))
    write_private(directory / "native-config.json", json.dumps({"allowedOrigin": reviewed["allowedOrigin"], "stateDirectory": str(directory)}, indent=2))
    write_private(directory / "gtr-agent.cjs", bundle.read_text())
    write_private(directory / "native_host.py", (source / "native_host.py").read_text())
    write_private(directory / "lease.py", (source / "lease.py").read_text())
    wrapper = f"#!{sys.executable}\nimport runpy, sys\nsys.argv.extend(['--config', {str(directory / 'native-config.json')!r}])\nrunpy.run_path({str(directory / 'native_host.py')!r}, run_name='__main__')\n"
    write_private(directory / "native-entry", wrapper, executable=True)
    cli = f"#!{sys.executable}\nimport os, sys\nos.environ['GTR_PYTHON'] = sys.executable\nargs = sys.argv[1:]\nif args and args[0] == 'serve' and '--config' not in args:\n    args.extend(['--config', {str(directory / 'policy.json')!r}])\nos.execv({reviewed['node']!r}, [{reviewed['node']!r}, {str(directory / 'gtr-agent.cjs')!r}] + args + ['--state-dir', {str(directory)!r}])\n"
    write_private(directory / "gtr-agent", cli, executable=True)
    manifest = {"name": "com.gtr.agent", "description": "GTR new-download submission to its local transfer service",
                "path": str(directory / "native-entry"), "type": "stdio", "allowed_origins": [reviewed["allowedOrigin"]]}
    write_private(registration, json.dumps(manifest, indent=2))
    return {"installed": True, "startsService": False, "grantsBrowserPermission": False, "directory": str(directory)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--extension-id", required=True)
    parser.add_argument("--policy", required=True)
    parser.add_argument("--node", default=shutil.which("node"))
    parser.add_argument("--apply", action="store_true", help="Register new local access; requires explicit approval")
    args = parser.parse_args()
    if not args.node:
        parser.error("An existing Node.js 22+ executable is required")
    reviewed = plan(Path.home(), args.extension_id, args.policy, args.node)
    print(json.dumps(apply(reviewed) if args.apply else {"dryRun": True, **reviewed}, indent=2))


if __name__ == "__main__":
    main()
