'use strict';
/*
 * Sends test-results/test-report.json to the local receiver (receiver/server.py).
 *
 * Environment variables:
 *   RECEIVER_URL    full address of the receiver, e.g. https://your-name.ngrok-free.app/report
 *                   (or http://localhost:8787/report when the CI runner is on your own PC)
 *   RECEIVER_TOKEN  the shared secret; must match RECEIVER_TOKEN on the receiver
 *
 * Exit code 0 = delivered (or deliberately skipped because nothing is configured).
 * Exit code 1 = delivery was attempted and failed.
 * The workflow runs this step with continue-on-error, so a delivery problem never
 * hides or replaces the real test result.
 */
const fs = require('node:fs');
const path = require('node:path');

const reportFile = path.join(__dirname, '..', 'test-results', 'test-report.json');
const url = process.env.RECEIVER_URL;
const token = process.env.RECEIVER_TOKEN;

function warn(message) {
  console.log(process.env.GITHUB_ACTIONS === 'true' ? '::warning title=Report delivery::' + message : 'WARNING: ' + message);
}

async function main() {
  if (!url || !token) {
    warn('RECEIVER_URL and/or RECEIVER_TOKEN are not set, so the report was NOT sent to the receiver.');
    return 0;
  }
  if (!/^https?:\/\//i.test(url)) {
    warn('RECEIVER_URL must start with http:// or https:// (got a value of the wrong shape).');
    return 1;
  }
  if (!fs.existsSync(reportFile)) {
    warn('test-results/test-report.json does not exist. Run "npm run report" first.');
    return 1;
  }
  const body = fs.readFileSync(reportFile, 'utf8');

  const attempts = 4;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
          'ngrok-skip-browser-warning': '1',
        },
        body: body,
        signal: AbortSignal.timeout(15000),
      });
      const text = await res.text();
      if (res.ok) {
        console.log('Report delivered to the receiver (HTTP ' + res.status + '): ' + text.trim());
        return 0;
      }
      console.log('Attempt ' + i + '/' + attempts + ': receiver answered HTTP ' + res.status + ' - ' + text.trim().slice(0, 300));
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        warn('The receiver rejected the report (HTTP ' + res.status + '). Check the token and the report format; retrying will not help.');
        return 1;
      }
    } catch (err) {
      console.log('Attempt ' + i + '/' + attempts + ': could not reach the receiver - ' + (err.cause && err.cause.code ? err.cause.code : err.message));
    }
    if (i < attempts) await new Promise((r) => setTimeout(r, i * 3000));
  }
  warn('The report could not be delivered after ' + attempts + ' attempts. Is the receiver and the tunnel running on your computer?');
  return 1;
}

main().then((code) => process.exit(code));
