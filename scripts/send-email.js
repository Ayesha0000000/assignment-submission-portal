'use strict';
/*
 * Optional bonus: emails the test report after every run (passing or failing).
 *
 * Settings come ONLY from environment variables (in GitHub: repository secrets):
 *   SMTP_HOST   e.g. smtp.gmail.com
 *   SMTP_PORT   465 (SSL) or 587 (STARTTLS). Default 465.
 *   SMTP_USER   the mailbox login
 *   SMTP_PASS   an app password (never your normal account password)
 *   EMAIL_TO    where to send the report (comma-separated list allowed)
 *   EMAIL_FROM  optional sender; defaults to SMTP_USER
 *
 * Usage:
 *   node scripts/send-email.js            send for real
 *   node scripts/send-email.js --dry-run  build the email and print it, send nothing
 *
 * Exit code 1 means sending failed. The workflow runs this step with continue-on-error,
 * so an email problem can never hide a failed test.
 */
const fs = require('node:fs');
const path = require('node:path');

const reportFile = path.join(__dirname, '..', 'test-results', 'test-report.json');
const dryRun = process.argv.includes('--dry-run');
const env = process.env;

function notice(message) {
  console.log(env.GITHUB_ACTIONS === 'true' ? '::warning title=Email report::' + message : 'NOTE: ' + message);
}

function esc(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function buildMessage(report) {
  const status = report.overallStatus.toUpperCase();
  const shortSha = String(report.commitSha).slice(0, 7);
  const subject = '[' + status + '] ' + report.repository + ' @ ' + report.branch + ' (' + shortSha + ') - ' +
    report.passedTests + '/' + report.totalTests + ' tests passed';

  const lines = [
    'Overall result : ' + status,
    'Repository     : ' + report.repository,
    'Branch         : ' + report.branch,
    'Commit SHA     : ' + report.commitSha,
    'Pipeline run   : ' + report.pipelineRunId + (report.pipelineRunUrl ? '  ' + report.pipelineRunUrl : ''),
    'Executed at    : ' + report.executedAt,
    'Tests          : ' + report.totalTests + ' total, ' + report.passedTests + ' passed, ' + report.failedTests + ' failed',
    '',
    'Individual results:',
  ];
  report.tests.forEach((t) => {
    lines.push('  [' + t.result.toUpperCase() + '] ' + t.name);
    if (t.failureMessage) lines.push('      ' + t.failureMessage.split('\n').join('\n      '));
  });
  lines.push('', 'The full report is attached as test-report.json.');

  const colour = report.overallStatus === 'passed' ? '#15803d' : '#c0262d';
  const rows = report.tests.map((t) =>
    '<tr><td style="padding:6px 10px;border:1px solid #ddd;color:' + (t.result === 'passed' ? '#15803d' : '#c0262d') + '"><b>' +
    esc(t.result.toUpperCase()) + '</b></td><td style="padding:6px 10px;border:1px solid #ddd">' + esc(t.name) +
    (t.failureMessage ? '<pre style="margin:6px 0 0;white-space:pre-wrap;color:#7a1a1f">' + esc(t.failureMessage) + '</pre>' : '') +
    '</td></tr>').join('');
  const html =
    '<div style="font-family:Segoe UI,Arial,sans-serif;max-width:640px">' +
    '<h2 style="color:' + colour + ';margin-bottom:4px">Test run ' + esc(status) + '</h2>' +
    '<p style="margin-top:0">' + esc(report.repository) + ' &middot; branch <b>' + esc(report.branch) + '</b> &middot; commit <code>' + esc(shortSha) + '</code></p>' +
    '<table style="border-collapse:collapse;margin-bottom:12px">' +
    '<tr><td style="padding:4px 10px 4px 0">Full commit SHA</td><td><code>' + esc(report.commitSha) + '</code></td></tr>' +
    '<tr><td style="padding:4px 10px 4px 0">Pipeline run ID</td><td>' + esc(report.pipelineRunId) + '</td></tr>' +
    '<tr><td style="padding:4px 10px 4px 0">Executed at</td><td>' + esc(report.executedAt) + '</td></tr>' +
    '<tr><td style="padding:4px 10px 4px 0">Counts</td><td>' + report.totalTests + ' total, ' + report.passedTests + ' passed, ' + report.failedTests + ' failed</td></tr>' +
    '</table><table style="border-collapse:collapse;width:100%">' + rows + '</table>' +
    '<p style="color:#666;font-size:13px">The full JSON report is attached.</p></div>';

  return {
    subject: subject,
    text: lines.join('\n'),
    html: html,
    attachments: [{ filename: 'test-report.json', content: JSON.stringify(report, null, 2), contentType: 'application/json' }],
  };
}

async function main() {
  if (!fs.existsSync(reportFile)) {
    notice('test-results/test-report.json was not found, so no email was built.');
    return 1;
  }
  const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  const message = buildMessage(report);
  const nodemailer = require('nodemailer');

  if (dryRun) {
    const transport = nodemailer.createTransport({ jsonTransport: true });
    const info = await transport.sendMail(Object.assign({ from: 'dry-run@example.invalid', to: 'dry-run@example.invalid' }, message));
    const parsed = JSON.parse(info.message);
    console.log('DRY RUN - nothing was sent.');
    console.log('Subject    : ' + parsed.subject);
    console.log('Attachments: ' + parsed.attachments.map((a) => a.filename).join(', '));
    console.log('---- text body ----\n' + parsed.text);
    return 0;
  }

  const missing = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_TO'].filter((k) => !env[k]);
  if (missing.length) {
    notice('Email reporting is switched off because these settings are missing: ' + missing.join(', ') + '.');
    return 0;
  }

  const port = Number(env.SMTP_PORT || 465);
  const secure = port === 465;
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: port,
    secure: secure,        // 465 = encrypted from the start
    requireTLS: !secure,   // 587 = must upgrade to encryption (STARTTLS), never send in plain text
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    connectionTimeout: 20000,
    greetingTimeout: 20000,
  });

  try {
    const info = await transporter.sendMail(Object.assign({ from: env.EMAIL_FROM || env.SMTP_USER, to: env.EMAIL_TO }, message));
    console.log('Email accepted by the SMTP server. Message id: ' + info.messageId);
    console.log('Accepted recipients: ' + (info.accepted || []).length + ', rejected: ' + (info.rejected || []).length);
    return 0;
  } catch (err) {
    notice('Email could not be sent: ' + err.message);
    return 1;
  }
}

main().then((code) => process.exit(code), (err) => { notice('Unexpected error: ' + err.message); process.exit(1); });
