import importlib.util
import json
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("export_queue", Path(__file__).parents[1] / "export_queue.py")
queue = importlib.util.module_from_spec(spec)
spec.loader.exec_module(queue)
EXPORT = "00000000-0000-4000-8000-000000000001"
TEMPLATE = "https://takeout-download.usercontent.google.com/download/a.zip?j=" + EXPORT + "&i=0&user=123&authuser=0"


class ExportQueueTests(unittest.TestCase):
    def test_google_gb_rounding_allows_half_display_step(self):
        self.assertTrue(queue.size_matches_display(1950206158, 1.82 * 1024))
        self.assertFalse(queue.size_matches_display(1940000000, 1.82 * 1024))
        self.assertFalse(queue.size_matches_display(0, 1.82 * 1024))

    def test_discovery_uses_the_service_six_archive_limit(self):
        with tempfile.TemporaryDirectory() as folder:
            args = self.fixture(folder)
            manifest = queue.private_json(args.manifest)
            manifest["entries"].append({"part": 4, "name": "d.zip", "displayMiB": 1})
            queue.save(args.manifest, manifest)
            submitted = []
            jobs = [{"id": name, "name": name, "state": "queued"} for name in ["a.zip", "b.zip", "c.zip"]]
            def request(method, params=None, request_id=None):
                if method == "submit":
                    submitted.append(params["name"])
                    return {"jobId": "fourth"}
                if method == "status":
                    if submitted:
                        raise queue.Stop("test stop")
                    return {"active": [], "jobs": jobs, "archiveLimit": 6, "paused": False, "storageHealthy": True, "reservations": [], "observedAt": "fixture"}
                return {}
            with patch.object(queue, "Client", return_value=types.SimpleNamespace(request=request)), patch.object(queue, "head", side_effect=lambda address, source=False: {"bytes": 20} if source else None), patch.object(queue.time, "sleep", side_effect=queue.Stop("test stop")), patch("builtins.print"):
                with self.assertRaisesRegex(queue.Stop, "test stop"):
                    queue.run(args)
            self.assertEqual(submitted, ["d.zip"])

    def test_manifest_rejects_duplicate_names_traversal_and_reordered_parts(self):
        for entries in [[{"part": 1, "name": "a"}, {"part": 2, "name": "a"}],
                        [{"part": 1, "name": "../a"}], [{"part": 2, "name": "a"}]]:
            with self.assertRaises(queue.Stop):
                queue.validate_manifest({"exportId": EXPORT, "entries": entries})

    def test_source_uses_verified_export_index_and_escaped_filename(self):
        source = queue.source_for(TEMPLATE, EXPORT, {"part": 4, "name": "a #?&.zip"})
        parsed = queue.url.urlsplit(source)
        self.assertEqual(parsed.path, "/download/a%20%23%3F%26.zip")
        self.assertEqual(queue.url.parse_qs(parsed.query)["i"], ["3"])
        for template in [TEMPLATE.replace("123", "123&sig=object-specific"), TEMPLATE.replace(EXPORT, "other"), TEMPLATE.replace("takeout-download.usercontent.google.com", "evil.test")]:
            with self.assertRaises(queue.Stop):
                queue.source_for(template, EXPORT, {"part": 1, "name": "a.zip"})

    def test_selection_preserves_unknown_holds_and_service_owned_jobs(self):
        entries = [{"part": i, "name": str(i), "displayMiB": 10-i} for i in range(1, 6)]
        chosen = queue.choose(entries, {1}, [{"name": "2", "state": "waiting"}, {"name": "3", "state": "complete"}], {"4": 100})
        self.assertEqual([e["part"] for e in chosen], [5])

    def fixture(self, folder):
        root = Path(folder)
        root.chmod(0o700)
        entries = [{"part": i, "name": name, "displayMiB": 1} for i, name in enumerate(["a.zip", "b.zip", "c.zip"], 1)]
        authorization = {"container": "https://backup.blob.core.windows.net/backups?se=2099-01-01T00%3A00%3A00Z&sig=fixture", "proxy": "https://proxy.test", "cookies": "private-cookie-fixture"}
        state = {"policy": {"container": "https://backup.blob.core.windows.net/backups", "proxy": "https://proxy.test"}, "jobs": {"a.zip": {"job": {"name": "a.zip", "source": TEMPLATE, "state": "queued"}, "authorization": authorization}}}
        manifest = {"exportId": EXPORT, "entries": entries, "holdParts": [], "knownCommitted": {}}
        for name, value in [("state.json", state), ("manifest.json", manifest)]:
            queue.save(root / name, value)
        return types.SimpleNamespace(manifest=root/"manifest.json", service_dir=root, auth_job="a.zip", journal=root/"journal.json", resume=True)

    def test_first_direct_commit_is_verified_before_bulk_submission(self):
        with tempfile.TemporaryDirectory() as folder:
            args = self.fixture(folder)
            jobs = [{"name": "a.zip", "id": "a", "state": "queued"}]
            blobs = {}
            submitted = []
            paused = [True]

            class FakeClient:
                def request(self, method, params=None, request_id=None):
                    if method == "resume":
                        paused[0] = False
                        return {}
                    if method == "pause":
                        paused[0] = True
                        return {}
                    if method == "status":
                        if not paused[0]:
                            for job in jobs:
                                job["state"] = "complete"
                                blobs[job["name"]] = {"bytes": 20, "jobId": job["id"]}
                        return {"jobs": jobs, "active": [], "paused": paused[0], "storageHealthy": True, "reservations": [], "observedAt": "fixture"}
                    if method == "submit":
                        if submitted:
                            ledger = queue.private_json(args.journal)
                            self_test.assertEqual(ledger["requests"]["b.zip"]["state"], "verified")
                        submitted.append(params["name"])
                        job = {"name": params["name"], "id": params["name"], "state": "queued"}
                        jobs.append(job)
                        return {"jobId": job["id"]}

            self_test = self
            def head(address, source=False):
                return {"bytes": 20} if source else blobs.get(queue.url.urlsplit(address).path.rsplit("/", 1)[-1])
            with patch.object(queue, "Client", return_value=FakeClient()), patch.object(queue, "head", side_effect=head), patch("builtins.print"):
                queue.run(args)
            self.assertEqual(submitted, ["b.zip", "c.zip"])
            self.assertEqual(queue.private_json(args.journal)["phase"], "complete")
            self.assertNotIn("private-cookie-fixture", args.journal.read_text())

    def test_unknown_request_is_not_replayed_on_restart(self):
        with tempfile.TemporaryDirectory() as folder:
            args = self.fixture(folder)
            queue.save(args.journal, {"exportId": EXPORT, "requests": {"b.zip": {"state": "requested", "id": "a"}}})
            with self.assertRaisesRegex(queue.Stop, "reconciliation"):
                queue.run(args)

    def test_refresh_only_reuses_access_for_idle_jobs_in_the_same_account_export(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            root.chmod(0o700)
            fresh = {"container": "https://backup.blob.core.windows.net/backups?sig=fixture", "proxy": "https://proxy.test", "cookies": "new-private-cookie"}
            stale = {**fresh, "cookies": "old-private-cookie"}
            same = TEMPLATE.replace("a.zip", "b.zip").replace("&i=0", "&i=1")
            state = {"jobs": {
                "b.zip": {"job": {"id": "original", "name": "b.zip", "source": same, "state": "waiting", "plan": {"length": 20}}, "authorization": stale},
                "other.zip": {"job": {"name": "other.zip", "source": TEMPLATE.replace("user=123", "user=456"), "state": "waiting"}, "authorization": stale}
            }}
            mutations = []
            class FakeClient:
                def request(self, method, params=None, request_id=None):
                    if method == "status": return {"active": []}
                    mutations.append(params)
                    return {"jobId": "original"}
            journal = {}
            with patch.object(queue, "head", return_value={"bytes": 20}):
                queue.refresh_owned_jobs(state, FakeClient(), TEMPLATE, fresh, journal, root/"journal.json")
            self.assertEqual(len(mutations), 1)
            self.assertEqual(mutations[0]["name"], "b.zip")
            self.assertEqual(mutations[0]["source"], same)
            self.assertEqual(mutations[0]["cookies"], "new-private-cookie")
            self.assertNotIn("private-cookie", (root/"journal.json").read_text())
            self.assertEqual(next(iter(journal["refreshRequests"].values()))["state"], "accepted")

    def test_google_html_is_an_authentication_stop(self):
        response = types.SimpleNamespace(headers={"content-type": "text/html", "content-length": "100"})
        class Response:
            def __enter__(self): return response
            def __exit__(self, *args): pass
        with patch.object(queue.urllib.request, "urlopen", return_value=Response()):
            with self.assertRaisesRegex(queue.Stop, "Google sign-in"):
                queue.head("https://proxy.test/fixture", source=True)

    def test_expired_access_pauses_even_before_capacity_frees(self):
        with tempfile.TemporaryDirectory() as folder:
            args = self.fixture(folder)
            calls = []
            def request(method, *unused):
                calls.append(method)
                return {"active": []} if method == "status" else {}
            client = types.SimpleNamespace(request=request)
            with patch.object(queue, "Client", return_value=client), patch.object(queue, "head", side_effect=[{"bytes": 20}, queue.Stop("Google sign-in is required")]), patch.object(queue.time, "monotonic", side_effect=[0, 61]):
                with self.assertRaisesRegex(queue.Stop, "Google sign-in"):
                    queue.run(args)
            self.assertIn("pause", calls)
            self.assertNotIn("submit", calls)
            self.assertEqual(queue.private_json(args.journal)["reason"], "Google sign-in is required")


if __name__ == "__main__":
    unittest.main()
