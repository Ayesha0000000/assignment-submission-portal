'use strict';
/*
 * Builds test-results/test-report.json from the REAL results of the last test run
 * (test-results/raw-results.json, written by scripts/run-tests.js).
 *
 * Repository, branch, commit and run id come from the standard GitHub Actions
 * environment variables. On your own computer they fall back to "local" values
 * (or to git, when git is available) so you can try everything before pushing.
 *
 * This script always exits 0 once it has written a report, even when tests failed,
 * because its job is to record the result - the test step is what fails the build.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'test-results');
const rawFile = path.join(outDir, 'raw-results.json');
const reportFile = path.join(outDir, 'test-report.json');

function git(args) {
  try {
    return execSync('git ' + args, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch (e) {
    return '';
  }
}

function build() {
  const env = process.env;
  const inCI = env.GITHUB_ACTIONS === 'true';

  let tests = [];
  let startedAt = null;
  let problem = null;
  try {
    const raw = JSON.parse(fs.readFileSync(rawFile, 'utf8'));
    tests = Array.isArray(raw.tests) ? raw.tests : [];
    startedAt = raw.startedAt || null;
  } catch (e) {
    problem = 'No readable test results were found (' + e.message + '). The test runner may have crashed before running any test.';
  }

  const passed = tests.filter((t) => t.result === 'passed').length;
  const failed = tests.filter((t) => t.result === 'failed').length;
  const skipped = tests.filter((t) => t.result === 'skipped').length;

  let overallStatus = 'passed';
  if (problem || tests.length === 0) overallStatus = 'error';
  else if (failed > 0) overallStatus = 'failed';

  const server = env.GITHUB_SERVER_URL || 'https://github.com';
  const repository = env.GITHUB_REPOSITORY || git('config --get remote.origin.url') || 'local-repository';
  const runId = env.GITHUB_RUN_ID || 'local-' + Date.now();

  const report = {
    schemaVersion: 1,
    repository: repository,
    branch: env.GITHUB_REF_NAME || git('rev-parse --abbrev-ref HEAD') || 'local',
    commitSha: env.GITHUB_SHA || git('rev-parse HEAD') || 'local-uncommitted',
    pipelineRunId: String(runId),
    pipelineRunNumber: env.GITHUB_RUN_NUMBER || null,
    pipelineRunAttempt: env.GITHUB_RUN_ATTEMPT || null,
    pipelineRunUrl: inCI && env.GITHUB_REPOSITORY ? server + '/' + env.GITHUB_REPOSITORY + '/actions/runs/' + runId : null,
    triggeredBy: env.GITHUB_EVENT_NAME || 'manual-local-run',
    actor: env.GITHUB_ACTOR || null,
    environment: inCI ? 'github-actions' : 'local',
    nodeVersion: process.version,
    testsStartedAt: startedAt,
    executedAt: new Date().toISOString(),
    tests: tests.map((t) => ({
      name: t.name,
      result: t.result,
      durationMs: t.durationMs,
      failureMessage: t.failureMessage || null,
    })),
    totalTests: tests.length,
    passedTests: passed,
    failedTests: failed,
    skippedTests: skipped,
    overallStatus: overallStatus,
  };
  if (problem) report.note = problem;
  return report;
}

const report = build();
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');

console.log('Report written to ' + path.relative(root, reportFile));
console.log('  overall status : ' + report.overallStatus.toUpperCase());
console.log('  tests          : ' + report.totalTests + ' total, ' + report.passedTests + ' passed, ' + report.failedTests + ' failed');

// Show a short summary on the GitHub Actions run page.
if (process.env.GITHUB_STEP_SUMMARY) {
  const rows = report.tests.map((t) => '| ' + (t.result === 'passed' ? 'PASS' : t.result === 'failed' ? 'FAIL' : 'SKIP') +
    ' | ' + t.name.replace(/\|/g, '\\|') + ' |').join('\n');
  const md = '## Test report - ' + report.overallStatus.toUpperCase() + '\n\n' +
    report.passedTests + ' passed, ' + report.failedTests + ' failed, ' + report.totalTests + ' total\n\n' +
    '| Result | Test |\n|---|---|\n' + rows + '\n';
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
}
