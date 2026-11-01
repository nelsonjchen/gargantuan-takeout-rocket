import io
import json
from pathlib import Path
import struct
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import native_host
import install


class NativeFrames(unittest.TestCase):
    def test_audit_accepts_only_redacted_flags_and_counts(self):
        with tempfile.TemporaryDirectory() as directory:
            native_host.audit(directory, "test", cookieBytes=6, cookies="SECRET", source="https://secret.test")
            text = (Path(directory) / "native-ingress.jsonl").read_text()
            self.assertIn('"cookieBytes": 6', text)
            self.assertNotIn("SECRET", text)
            self.assertNotIn("secret.test", text)
    def test_unicode_roundtrip_and_partial_reads(self):
        frame = io.BytesIO()
        native_host.write_frame(frame, {"name": "旅行.zip"})
        data = frame.getvalue()

        class Partial(io.BytesIO):
            def read(self, count=-1):
                return super().read(min(count, 2))

        self.assertEqual(native_host.read_frame(Partial(data)), {"name": "旅行.zip"})

    def test_truncated_or_oversized_frames_rejected(self):
        for payload in (b"\x01", struct.pack("=I", 0), struct.pack("=I", 100_000), struct.pack("=I", 5) + b"{}"):
            with self.assertRaises(ValueError):
                native_host.read_frame(io.BytesIO(payload))

    def test_host_cannot_mirror_extension_status_or_send_controls(self):
        for method in ("status", "resume", "pause", "eval", "read-cookies"):
            self.assertFalse(native_host.ingest("unused", {"method": method})["ok"])

    def test_reject_wrong_origin_before_reading_or_forwarding_any_message(self):
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / "config.json"
            config.write_text(json.dumps({"allowedOrigin": "chrome-extension://" + "a" * 32 + "/", "stateDirectory": directory}))
            with patch.object(sys, "argv", ["native", "chrome-extension://" + "b" * 32 + "/", "--config", str(config)]), patch.object(native_host, "ingest") as forwarding:
                self.assertEqual(native_host.main(), 64)
                forwarding.assert_not_called()

    def test_install_plan_has_no_secrets_wildcards_or_auto_start(self):
        with tempfile.TemporaryDirectory() as directory:
            policy = Path(directory) / "policy.json"
            policy.write_text(json.dumps({"container": "https://backup.blob.core.windows.net/backups", "proxy": "https://proxy.test", "reservations": ["old.zip"]}))
            reviewed = install.plan(directory, "a" * 32, policy, sys.executable)
            self.assertEqual(reviewed["allowedOrigin"], "chrome-extension://" + "a" * 32 + "/")
            self.assertFalse(reviewed["startsService"])
            self.assertFalse(reviewed["grantsBrowserPermission"])
            self.assertEqual(reviewed["newNetworkPorts"], [])
            self.assertFalse(Path(reviewed["directory"]).exists())
            policy.write_text(json.dumps({"container": "https://backup.blob.core.windows.net/backups?sig=secret", "proxy": "https://proxy.test", "reservations": []}))
            with self.assertRaises(ValueError):
                install.plan(directory, "a" * 32, policy, sys.executable)


if __name__ == "__main__":
    unittest.main()
