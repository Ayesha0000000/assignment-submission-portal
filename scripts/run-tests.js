'use strict';
/*
 * Runs the automated tests and keeps two real records of the run:
 *   test-results/raw-results.json  - every test with its result
 *   test-results/test-output.log   - the full console output
 * Exit code is 0 only when every test passed (so CI fails when a test fails).
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'test-results');
fs.mkdirSync(outDir, { recursive: true });

const rawFile = path.join(outDir, 'raw-results.json');
const logFile = path.join(outDir, 'test-output.log');
for (const f of [rawFile, logFile, path.join(outDir, 'test-report.json')]) {
  fs.rmSync(f, { force: true }); // never reuse results from an older run
}

const args = [
  '--test',
  '--test-reporter=spec',
  '--test-reporter-destination=stdout',
  '--test-reporter=./scripts/results-reporter.js',
  '--test-reporter-destination=test-results/raw-results.json',
  'tests/*.test.js',
];

const log = fs.createWriteStream(logFile);
const child = spawn(process.execPath, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.on('data', (d) => { process.stdout.write(d); log.write(d); });
child.stderr.on('data', (d) => { process.stderr.write(d); log.write(d); });
child.on('close', (code) => {
  log.end(() => process.exit(code === null ? 1 : code));
});
