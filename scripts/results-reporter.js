'use strict';
/*
 * A small custom reporter for `node --test`.
 * It collects the real result of every test and writes them as JSON.
 * scripts/run-tests.js points Node's test runner at this file.
 */
module.exports = async function* resultsReporter(source) {
  const tests = [];
  const startedAt = new Date().toISOString();

  for await (const event of source) {
    if (event.type !== 'test:pass' && event.type !== 'test:fail') continue;
    const data = event.data;
    if (data.details && data.details.type === 'suite') continue; // only real tests

    const entry = {
      name: data.name,
      result: event.type === 'test:pass' ? 'passed' : 'failed',
      durationMs: data.details && typeof data.details.duration_ms === 'number'
        ? Math.round(data.details.duration_ms * 100) / 100
        : null,
      failureMessage: null,
    };
    if (data.skip !== undefined && data.skip !== false) entry.result = 'skipped';
    if (event.type === 'test:fail') {
      const err = data.details && data.details.error;
      const cause = err && err.cause ? err.cause : err;
      entry.failureMessage = String((cause && cause.message) || (err && err.message) || 'Test failed')
        .replace(/\n{2,}/g, '\n').split('\n').slice(0, 12).join('\n');
    }
    tests.push(entry);
  }

  yield JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), tests }, null, 2) + '\n';
};
