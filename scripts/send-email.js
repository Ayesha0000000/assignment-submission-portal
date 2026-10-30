
'use strict';

/*
 * Email test reports after passing or failing tests.
 *
 * Required environment variables:
 * SMTP_HOST
 * SMTP_PORT
 * SMTP_USER
 * SMTP_PASS
 * EMAIL_TO
 * EMAIL_FROM (optional)
 */

const fs = require('node:fs');
const path = require('node:path');
const nodemailer = require('nodemailer');

const reportFile = path.join(
  __dirname,
  '..',
  'test-results',
  'test-report.json'
);

const env = process.env;
const dryRun = process.argv.includes('--dry-run');

function notice(message) {
  console.log(
    env.GITHUB_ACTIONS === 'true'
      ? '::warning title=Email report::' + message
      : 'NOTE: ' + message
  );
}

function esc(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function buildMessage(report) {
  const status = report.overallStatus.toUpperCase();
  const shortSha = String(report.commitSha).slice(0, 7);

  const subject =
    '[' + status + '] ' +
    report.repository + ' @ ' +
    report.branch + ' (' + shortSha + ') - ' +
    report.passedTests + '/' +
    report.totalTests + ' tests passed';

  const lines = [
    'Overall result : ' + status,
    'Repository     : ' + report.repository,
    'Branch         : ' + report.branch,
    'Commit SHA     : ' + report.commitSha,
    'Pipeline run   : ' + report.pipelineRunId,
    'Executed at    : ' + report.executedAt,
    'Tests          : ' + report.totalTests +
      ' total, ' + report.passedTests +
      ' passed, ' + report.failedTests + ' failed',
    '',
    'Individual results:'
  ];

  report.tests.forEach((test) => {
    lines.push(
      '[' + test.result.toUpperCase() + '] ' + test.name
    );

    if (test.failureMessage) {
      lines.push(test.failureMessage);
    }
  });

  lines.push('');
  lines.push('Full report attached as test-report.json.');

  const colour =
    report.overallStatus === 'passed' ? '#15803d' : '#c0262d';

  const rows = report.tests.map((test) => {
    const resultColour =
      test.result === 'passed' ? '#15803d' : '#c0262d';

    return `
      <tr>
        <td style="padding:8px;border:1px solid #ddd;color:${resultColour}">
          <b>${esc(test.result.toUpperCase())}</b>
        </td>
        <td style="padding:8px;border:1px solid #ddd">
          ${esc(test.name)}
          ${
            test.failureMessage
              ? '<pre>' + esc(test.failureMessage) + '</pre>'
              : ''
          }
        </td>
      </tr>
    `;
  }).join('');

  const html = `
    <div style="font-family:Arial,sans-serif">
      <h2 style="color:${colour}">
        Test run ${esc(status)}
      </h2>

      <p>
        Repository: ${esc(report.repository)}<br>
        Branch: ${esc(report.branch)}<br>
        Commit: ${esc(shortSha)}
      </p>

      <p>
        Total: ${report.totalTests}<br>
        Passed: ${report.passedTests}<br>
        Failed: ${report.failedTests}
      </p>

      <table style="border-collapse:collapse;width:100%">
        ${rows}
      </table>

      <p>Full JSON report is attached.</p>
    </div>
  `;

  return {
    subject,
    text: lines.join('\n'),
    html,
    attachments: [{
      filename: 'test-report.json',
      content: JSON.stringify(report, null, 2),
      contentType: 'application/json'
    }]
  };
}

async function main() {
  if (!fs.existsSync(reportFile)) {
    notice('Test report not found.');
    return 1;
  }

  const report = JSON.parse(
    fs.readFileSync(reportFile, 'utf8')
  );

  const message = buildMessage(report);

  if (dryRun) {
    const transport = nodemailer.createTransport({
      jsonTransport: true
    });

    const info = await transport.sendMail({
      from: 'dry-run@example.invalid',
      to: 'dry-run@example.invalid',
      ...message
    });

    console.log('DRY RUN - Nothing was sent.');
    console.log('Subject:', JSON.parse(info.message).subject);
    console.log('Attachment: test-report.json');

    return 0;
  }

  const required = [
    'SMTP_HOST',
    'SMTP_USER',
    'SMTP_PASS',
    'EMAIL_TO'
  ];

  const missing = required.filter((key) => !env[key]);

  if (missing.length) {
    notice('Missing settings: ' + missing.join(', '));
    return 0;
  }

  const port = Number(env.SMTP_PORT || 465);
  const secure = port === 465;

  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    family: 4,
    secure,
    requireTLS: !secure,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS
    },
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 60000
  });

  try {
    await transporter.verify();
    console.log('SMTP connection verified.');

    const info = await transporter.sendMail({
      from: env.EMAIL_FROM || env.SMTP_USER,
      to: env.EMAIL_TO,
      ...message
    });

    console.log(
      'Email accepted by SMTP server. Message ID:',
      info.messageId
    );

    console.log(
      'Accepted recipients:',
      info.accepted.length,
      'Rejected:',
      info.rejected.length
    );

    return 0;

  } catch (error) {
    notice('Email could not be sent: ' + error.message);
    return 1;
  }
}

main().then(
  (code) => process.exit(code),
  (error) => {
    notice('Unexpected error: ' + error.message);
    process.exit(1);
  }
);
