'use strict';
/*
 * Switches a deliberate, controlled bug on or off for the lab demonstration.
 *
 *   node scripts/demo-defect.js on      -> breaks the "registration number is required" check
 *   node scripts/demo-defect.js off     -> puts the correct check back
 *   node scripts/demo-defect.js status  -> shows which version is in app.js
 *
 * Only the single line in app.js that ends with  // DEMO-DEFECT-LINE  is touched.
 * The bug: the code asks "is the value undefined?" instead of "is the value blank?".
 * An empty text box gives '' (not undefined), so a missing registration number slips through
 * and Test B fails.
 */
const fs = require('node:fs');
const path = require('node:path');

const file = path.join(__dirname, '..', 'app.js');
const MARK = '// DEMO-DEFECT-LINE';
const GOOD = 'if (isBlank(values.registrationNumber)) {';
const BAD = 'if (values.registrationNumber === undefined) {';

const mode = process.argv[2];
const source = fs.readFileSync(file, 'utf8');
const lines = source.split('\n');
const index = lines.findIndex((l) => l.includes(MARK));
if (index === -1) {
  console.error('Could not find the marker line (' + MARK + ') in app.js.');
  process.exit(2);
}

const current = lines[index].includes(BAD) ? 'defect' : lines[index].includes(GOOD) ? 'correct' : 'unknown';
if (current === 'unknown') {
  console.error('The marked line was changed by hand, so it cannot be switched automatically:\n' + lines[index]);
  process.exit(2);
}

if (mode === 'status' || !mode) {
  console.log('app.js currently contains the ' + current.toUpperCase() + ' registration check (line ' + (index + 1) + ').');
  process.exit(0);
}
if (mode !== 'on' && mode !== 'off') {
  console.error('Usage: node scripts/demo-defect.js on|off|status');
  process.exit(2);
}

const wanted = mode === 'on' ? 'defect' : 'correct';
if (current === wanted) {
  console.log('Nothing to do: app.js already contains the ' + wanted.toUpperCase() + ' check.');
  process.exit(0);
}
lines[index] = lines[index].replace(mode === 'on' ? GOOD : BAD, mode === 'on' ? BAD : GOOD);
fs.writeFileSync(file, lines.join('\n'));
console.log(mode === 'on'
  ? 'DEFECT switched ON in app.js (line ' + (index + 1) + '). Run "npm test" to see Test B fail.'
  : 'DEFECT switched OFF in app.js (line ' + (index + 1) + '). Run "npm test" to see everything pass.');
