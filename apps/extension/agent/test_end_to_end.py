"""Real native frames -> private Unix ingress -> durable service -> agent CLI.

Uses only fake credentials, a temporary directory, and a paused service.
Never registers a browser host or starts a live transfer.
"""
import io
import json
from pathlib import Path
import select
import shutil
import subprocess
import sys
import tempfile
import unittest

from native_host import read_frame, write_frame

ROOT = Path(__file__).resolve().parent
ORIGIN = "chrome-extension://" + "a" * 32 + "/"


class NativeServiceEndToEnd(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="gtr-agent-e2e-", dir="/tmp")
        self.directory = Path(self.temp.name)
        self.state = self.directory / "state"
        self.policy = self.directory / "policy.json"
        self.policy.write_text(json.dumps({"container": "https://backup.blob.core.windows.net/backups", "proxy": "https://proxy.test", "reservations": []}))
        self.config = self.directory / "native-config.json"
        self.config.write_text(json.dumps({"allowedOrigin": ORIGIN, "stateDirectory": str(self.state)}))
        self.process = None
        self.start()

    def start(self):
        self.process = subprocess.Popen([shutil.which("node"), str(ROOT / "build/gtr-agent.cjs"), "serve", "--config", str(self.policy), "--state-dir", str(self.state)], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if not select.select([self.process.stdout], [], [], 10)[0]:
            raise RuntimeError("Temporary service did not become ready")
        ready = json.loads(self.process.stdout.readline())
        self.assertTrue(ready["paused"])

    def stop(self):
        if self.process and self.process.poll() is None:
            self.process.terminate()
            self.process.wait(timeout=10)
        if self.process:
            self.process.stdout.close()
            self.process.stderr.close()

    def tearDown(self):
        self.stop()
        self.temp.cleanup()

    def status(self):
        command = subprocess.run([shutil.which("node"), str(ROOT / "build/gtr-agent.cjs"), "status", "--state-dir", str(self.state)], capture_output=True, timeout=10, check=True)
        return json.loads(command.stdout)["result"]

    def test_native_submission_and_independent_status_survive_service_restart(self):
        frame = io.BytesIO()
        write_frame(frame, {"id": "1" * 32, "method": "submit", "params": {
            "name": "旅行.zip", "source": "https://takeout.google.com/takeout/download/fixture",
            "container": "https://backup.blob.core.windows.net/backups?sig=fake-private-sas",
            "proxy": "https://proxy.test", "cookies": "fake-private-cookie"}})
        completed = subprocess.run([sys.executable, str(ROOT / "native_host.py"), ORIGIN, "--config", str(self.config)], input=frame.getvalue(), capture_output=True, timeout=10, check=True)
        ack = read_frame(io.BytesIO(completed.stdout))
        self.assertTrue(ack["ok"])
        self.assertEqual(ack["owner"], "gtr-transfer-service")
        status = self.status()
        self.assertEqual(status["jobs"][0]["name"], "旅行.zip")
        self.assertEqual(status["jobs"][0]["id"], ack["jobId"])
        self.assertEqual(status["jobs"][0]["state"], "queued")
        self.assertNotIn("fake-private", json.dumps(status))
        # A hard crash must not leave a stale PID lock preventing recovery.
        self.process.kill()
        self.process.wait(timeout=10)
        self.stop()
        self.start()
        self.assertEqual(self.status()["jobs"][0]["id"], ack["jobId"])


if __name__ == "__main__":
    unittest.main()
