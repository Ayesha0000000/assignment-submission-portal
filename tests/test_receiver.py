
"""Self-tests for receiver/server.py. Run with: npm run test:receiver"""
import json
import os
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
import http.client

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "receiver"))
import server  # noqa: E402

TOKEN = "unit-test-token-0123456789"


def sample_report(failed=False):
    tests = [
        {
            "name": "Test A",
            "result": "passed",
            "durationMs": 1.0,
            "failureMessage": None,
        },
        {
            "name": "Test B",
            "result": "failed" if failed else "passed",
            "durationMs": 1.0,
            "failureMessage": (
                "Expected the submission to be rejected" if failed else None
            ),
        },
    ]
    return {
        "repository": "user/repo",
        "branch": "main",
        "commitSha": "abc123",
        "pipelineRunId": "42",
        "executedAt": "2026-10-29T10:00:00Z",
        "tests": tests,
        "totalTests": 2,
        "passedTests": 1 if failed else 2,
        "failedTests": 1 if failed else 0,
        "overallStatus": "failed" if failed else "passed",
    }


class ReceiverTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dir = tempfile.TemporaryDirectory()
        cls.httpd = server.make_server(
            "127.0.0.1", 0, TOKEN, cls.dir.name
        )
        cls.url = "http://127.0.0.1:%d" % cls.httpd.server_address[1]
        cls.thread = threading.Thread(
            target=cls.httpd.serve_forever,
            daemon=True,
        )
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join(timeout=5)
        cls.dir.cleanup()

    def post(
        self,
        body,
        token=TOKEN,
        content_type="application/json",
        path="/report",
    ):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        headers = {"Content-Type": content_type}

        if token is not None:
            headers["Authorization"] = "Bearer " + token

        req = urllib.request.Request(
            self.url + path,
            data=data,
            headers=headers,
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=5) as res:
                return res.status, json.loads(res.read())
        except urllib.error.HTTPError as err:
            response_body = err.read()
            try:
                parsed_body = json.loads(response_body)
            except (json.JSONDecodeError, UnicodeDecodeError):
                parsed_body = {}
            return err.code, parsed_body

    def saved(self):
        with open(
            os.path.join(self.dir.name, "test-report.json"),
            encoding="utf-8",
        ) as f:
            return json.load(f)

    def test_health(self):
        with urllib.request.urlopen(self.url + "/health", timeout=5) as res:
            self.assertEqual(json.loads(res.read()), {"status": "ok"})

    def test_missing_token_is_rejected(self):
        status, _ = self.post(sample_report(), token=None)
        self.assertEqual(status, 401)

    def test_wrong_token_is_rejected(self):
        status, _ = self.post(
            sample_report(),
            token="wrong-token-wrong-token",
        )
        self.assertEqual(status, 401)

    def test_passing_report_is_saved(self):
        status, body = self.post(sample_report())
        self.assertEqual(status, 200)
        self.assertEqual(body["overallStatus"], "passed")
        self.assertEqual(self.saved()["overallStatus"], "passed")

    def test_failing_report_is_saved_and_replaces_previous(self):
        self.post(sample_report())
        status, _ = self.post(sample_report(failed=True))
        self.assertEqual(status, 200)

        saved = self.saved()
        self.assertEqual(saved["overallStatus"], "failed")
        self.assertEqual(saved["failedTests"], 1)
        self.assertIn("rejected", saved["tests"][1]["failureMessage"])

    def test_history_copy_is_kept(self):
        self.post(sample_report())
        history_dir = os.path.join(self.dir.name, "history")
        self.assertTrue(os.listdir(history_dir))

    def test_bad_json_is_rejected(self):
        status, _ = self.post(b"{not json")
        self.assertEqual(status, 400)

    def test_report_with_missing_fields_is_rejected(self):
        bad = sample_report()
        del bad["commitSha"]

        status, body = self.post(bad)
        self.assertEqual(status, 400)
        self.assertTrue(body["problems"])

    def test_inconsistent_counts_are_rejected(self):
        bad = sample_report()
        bad["passedTests"] = 99

        status, _ = self.post(bad)
        self.assertEqual(status, 400)

    def test_wrong_content_type_is_rejected(self):
        status, _ = self.post(
            sample_report(),
            content_type="text/plain",
        )
        self.assertEqual(status, 415)

    def test_oversized_body_is_rejected(self):
        conn = http.client.HTTPConnection(
            "127.0.0.1",
            self.httpd.server_address[1],
            timeout=5,
        )

        try:
            conn.putrequest("POST", "/report")
            conn.putheader("Content-Type", "application/json")
            conn.putheader("Authorization", "Bearer " + TOKEN)
            conn.putheader(
                "Content-Length",
                str(server.MAX_BODY_BYTES + 1),
            )
            conn.endheaders()

            response = conn.getresponse()
            self.assertEqual(response.status, 413)
            response.read()
        finally:
            conn.close()

    def test_unknown_path_is_404(self):
        status, _ = self.post(sample_report(), path="/other")
        self.assertEqual(status, 404)


if __name__ == "__main__":
    unittest.main()
