"""
Local test-report receiver (Python standard library only, no packages to install).

It listens for a POST from the CI pipeline, checks the secret token, checks that
the JSON really is a test report, and saves it on your computer as test-report.json.

Environment variables
  RECEIVER_TOKEN  (required) shared secret, at least 16 characters.
  RECEIVER_HOST   optional, default 127.0.0.1 (only this computer can connect directly;
                  your tunnel program connects from this same computer).
  RECEIVER_PORT   optional, default 8787.
  REPORT_DIR      optional, default receiver-output (folder next to the project root).

Endpoints
  POST /report    send the report JSON with header  Authorization: Bearer <token>
  GET  /health    returns {"status": "ok"} (no secret needed, shows the receiver is up)

Files written
  <REPORT_DIR>/test-report.json            always the latest report received
  <REPORT_DIR>/history/<time>_run<id>_<status>.json   a copy of every report received
"""
import hmac
import json
import os
import re
import sys
import tempfile
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MAX_BODY_BYTES = 1_000_000
MIN_TOKEN_LENGTH = 16
RESULTS = {"passed", "failed", "skipped"}
STATUSES = {"passed", "failed", "error"}


def validate_report(report):
    """Return a list of problems. An empty list means the report is acceptable."""
    problems = []
    if not isinstance(report, dict):
        return ["The JSON must be an object."]

    for field in ("repository", "branch", "commitSha", "pipelineRunId", "executedAt"):
        value = report.get(field)
        if not isinstance(value, str) or not value.strip():
            problems.append(f"'{field}' must be a non-empty string.")
        elif len(value) > 500:
            problems.append(f"'{field}' is too long.")

    for field in ("totalTests", "passedTests", "failedTests"):
        value = report.get(field)
        if not isinstance(value, int) or isinstance(value, bool) or value < 0:
            problems.append(f"'{field}' must be a whole number, zero or more.")

    if report.get("overallStatus") not in STATUSES:
        problems.append("'overallStatus' must be one of: passed, failed, error.")

    tests = report.get("tests")
    if not isinstance(tests, list):
        problems.append("'tests' must be a list.")
        return problems
    if len(tests) > 1000:
        problems.append("'tests' has too many entries.")
        return problems

    for i, item in enumerate(tests):
        if not isinstance(item, dict):
            problems.append(f"tests[{i}] must be an object.")
            continue
        if not isinstance(item.get("name"), str) or not item["name"].strip():
            problems.append(f"tests[{i}].name must be a non-empty string.")
        if item.get("result") not in RESULTS:
            problems.append(f"tests[{i}].result must be one of: passed, failed, skipped.")
        message = item.get("failureMessage")
        if message is not None and not isinstance(message, str):
            problems.append(f"tests[{i}].failureMessage must be text or null.")
        if item.get("result") == "failed" and not message:
            problems.append(f"tests[{i}] failed but has no failureMessage.")

    if not problems:  # the counts must agree with the list
        passed = sum(1 for t in tests if t["result"] == "passed")
        failed = sum(1 for t in tests if t["result"] == "failed")
        if report["totalTests"] != len(tests):
            problems.append("'totalTests' does not match the number of tests listed.")
        if report["passedTests"] != passed:
            problems.append("'passedTests' does not match the tests listed.")
        if report["failedTests"] != failed:
            problems.append("'failedTests' does not match the tests listed.")
        if failed > 0 and report["overallStatus"] == "passed":
            problems.append("'overallStatus' says passed but a test failed.")
    return problems


def safe_part(text, limit=40):
    return re.sub(r"[^A-Za-z0-9_-]", "-", str(text))[:limit] or "x"


def save_report(report, report_dir):
    """Write test-report.json (replacing the old one safely) and a history copy."""
    os.makedirs(os.path.join(report_dir, "history"), exist_ok=True)
    text = json.dumps(report, indent=2, ensure_ascii=False) + "\n"

    fd, tmp_path = tempfile.mkstemp(dir=report_dir, prefix=".incoming-", suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        handle.write(text)
    final_path = os.path.join(report_dir, "test-report.json")
    os.replace(tmp_path, final_path)  # never leaves a half-written file

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    name = f"{stamp}_run{safe_part(report['pipelineRunId'])}_{report['overallStatus']}.json"
    with open(os.path.join(report_dir, "history", name), "w", encoding="utf-8") as handle:
        handle.write(text)
    return final_path


def make_handler(token, report_dir):
    token_bytes = token.encode("utf-8")

    class Handler(BaseHTTPRequestHandler):
        server_version = "ReportReceiver/1.0"

        def log_message(self, fmt, *args):  # keep the console readable; never print headers
            sys.stdout.write("[%s] %s\n" % (datetime.now().strftime("%H:%M:%S"), fmt % args))

        def _send(self, status, payload, extra_headers=None):
            body = json.dumps(payload).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            for key, value in (extra_headers or {}).items():
                self.send_header(key, value)
            self.end_headers()
            self.wfile.write(body)

        def _authorised(self):
            header = self.headers.get("Authorization", "")
            if not header.startswith("Bearer "):
                return False
            supplied = header[len("Bearer "):].strip().encode("utf-8")
            return hmac.compare_digest(supplied, token_bytes)  # constant-time comparison

        def do_GET(self):
            if self.path == "/health":
                return self._send(200, {"status": "ok"})
            self._send(404, {"error": "Not found"})

        def do_POST(self):
            if self.path != "/report":
                return self._send(404, {"error": "Not found"})
            if not self._authorised():
                return self._send(401, {"error": "Missing or wrong token"}, {"WWW-Authenticate": "Bearer"})
            if "application/json" not in self.headers.get("Content-Type", ""):
                return self._send(415, {"error": "Content-Type must be application/json"})
            try:
                length = int(self.headers.get("Content-Length", ""))
            except ValueError:
                return self._send(411, {"error": "Content-Length header is required"})
            if length <= 0:
                return self._send(400, {"error": "Empty body"})
            if length > MAX_BODY_BYTES:
                return self._send(413, {"error": "Report is too large"})

            raw = self.rfile.read(length)
            try:
                report = json.loads(raw.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                return self._send(400, {"error": "Body is not valid JSON"})

            problems = validate_report(report)
            if problems:
                return self._send(400, {"error": "Invalid report", "problems": problems[:10]})

            path = save_report(report, report_dir)
            print(
                "  saved %s | %s | run %s | %s | %s tests, %s failed"
                % (os.path.abspath(path), report["branch"], report["pipelineRunId"],
                   report["overallStatus"].upper(), report["totalTests"], report["failedTests"])
            )
            self._send(200, {"status": "saved", "file": "test-report.json", "overallStatus": report["overallStatus"]})

    return Handler


def make_server(host, port, token, report_dir):
    return ThreadingHTTPServer((host, port), make_handler(token, report_dir))


def main():
    token = os.environ.get("RECEIVER_TOKEN", "")
    if len(token) < MIN_TOKEN_LENGTH:
        print("RECEIVER_TOKEN is missing or shorter than %d characters." % MIN_TOKEN_LENGTH)
        print('PowerShell:  $env:RECEIVER_TOKEN = "put-a-long-random-secret-here"')
        sys.exit(1)
    host = os.environ.get("RECEIVER_HOST", "127.0.0.1")
    port = int(os.environ.get("RECEIVER_PORT", "8787"))
    default_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "receiver-output")
    report_dir = os.path.abspath(os.environ.get("REPORT_DIR", default_dir))
    os.makedirs(report_dir, exist_ok=True)

    server = make_server(host, port, token, report_dir)
    print("Receiver listening on http://%s:%d/report" % (host, port))
    print("Saving reports to %s" % os.path.join(report_dir, "test-report.json"))
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
