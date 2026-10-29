'use strict';
/*
 * Automated tests for the Assignment Submission Portal.
 * They call the real validation and saving code in app.js (no mocks of the logic).
 * Run with:  npm test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const Portal = require('../app.js');

function validInput(overrides) {
  return Object.assign(
    {
      studentName: 'Ayesha',
      registrationNumber: 'FA23-BSE-032',
      assignmentTitle: 'DevOps Lab Midterm',
      submissionUrl: 'https://github.com/example-user/example-repo',
    },
    overrides
  );
}

/** A tiny stand-in for localStorage that lets us look at what was written. */
function fakeStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    rawSize: () => data.size,
  };
}

// ---- The three required test cases ----------------------------------------

test('Test A: complete details and a valid URL are saved and appear in the list', () => {
  const storage = fakeStorage();
  const store = Portal.createSubmissionStore(storage);

  const result = store.add(validInput());

  assert.equal(result.ok, true, 'a valid submission should be accepted');
  assert.deepEqual(result.errors, {});
  const list = store.list();
  assert.equal(list.length, 1, 'the submission should appear in the list');
  assert.equal(list[0].studentName, 'Ayesha');
  assert.equal(list[0].registrationNumber, 'FA23-BSE-032');
  assert.equal(list[0].assignmentTitle, 'DevOps Lab Midterm');
  assert.equal(list[0].submissionUrl, 'https://github.com/example-user/example-repo');
  assert.equal(store.stats().total, 1);
});

test('Test B: a missing registration number is rejected with a validation message', () => {
  const storage = fakeStorage();
  const store = Portal.createSubmissionStore(storage);

  const result = store.add(validInput({ registrationNumber: '' }));

  assert.equal(result.ok, false, 'the submission should be rejected');
  assert.equal(
    result.errors.registrationNumber,
    'Registration number is required.',
    'the user should see a clear validation message'
  );
  assert.equal(store.list().length, 0, 'nothing should be saved');
});

test('Test C: an invalid submission URL is rejected and is not saved', () => {
  const storage = fakeStorage();
  const store = Portal.createSubmissionStore(storage);

  const result = store.add(validInput({ submissionUrl: 'not-a-valid-url' }));

  assert.equal(result.ok, false, 'the submission should be rejected');
  assert.ok(result.errors.submissionUrl, 'the URL field should carry an error message');
  assert.equal(store.list().length, 0, 'nothing should be saved');
  assert.equal(storage.rawSize(), 0, 'storage should be untouched');
});

// ---- Extra tests ------------------------------------------------------------

test('Extra: a registration number with only spaces counts as missing', () => {
  const store = Portal.createSubmissionStore(fakeStorage());
  const result = store.add(validInput({ registrationNumber: '    ' }));
  assert.equal(result.ok, false);
  assert.equal(result.errors.registrationNumber, 'Registration number is required.');
});

test('Extra: missing name and missing title are each reported', () => {
  const result = Portal.validateSubmission(validInput({ studentName: '', assignmentTitle: '' }));
  assert.equal(result.valid, false);
  assert.equal(result.errors.studentName, 'Student name is required.');
  assert.equal(result.errors.assignmentTitle, 'Assignment title is required.');
});

test('Extra: an empty URL is reported as required', () => {
  const result = Portal.validateSubmission(validInput({ submissionUrl: '' }));
  assert.equal(result.valid, false);
  assert.equal(result.errors.submissionUrl, 'Submission URL is required.');
});

test('Extra: unsafe or unusable URL types are rejected', () => {
  const bad = [
    'javascript:alert(1)',
    'ftp://example.com/file',
    'www.example.com',
    'https://',
    'https://nodots',
    'https://exa mple.com',
  ];
  for (const url of bad) {
    assert.equal(Portal.isValidUrl(url), false, `${url} should be rejected`);
  }
});

test('Extra: normal http and https links are accepted', () => {
  const good = ['https://github.com/user/repo', 'http://example.com', 'https://user.github.io/app/'];
  for (const url of good) {
    assert.equal(Portal.isValidUrl(url), true, `${url} should be accepted`);
  }
});

test('Extra: saved submissions survive a page reload (new store, same storage)', () => {
  const storage = fakeStorage();
  Portal.createSubmissionStore(storage).add(validInput());
  const reloaded = Portal.createSubmissionStore(storage);
  assert.equal(reloaded.list().length, 1);
});

test('Extra: newest submission is listed first and statistics count students', () => {
  const store = Portal.createSubmissionStore(fakeStorage());
  store.add(validInput({ assignmentTitle: 'First' }));
  store.add(validInput({ assignmentTitle: 'Second' }));
  store.add(validInput({ registrationNumber: 'FA23-BSE-010', studentName: 'Maryam', assignmentTitle: 'Third' }));
  const list = store.list();
  assert.equal(list[0].assignmentTitle, 'Third');
  assert.equal(store.stats().total, 3);
  assert.equal(store.stats().students, 2);
});

test('Extra: clear removes every saved submission', () => {
  const store = Portal.createSubmissionStore(fakeStorage());
  store.add(validInput());
  store.clear();
  assert.equal(store.list().length, 0);
  assert.equal(store.stats().total, 0);
});

test('Extra: corrupted saved data does not crash the portal', () => {
  const storage = fakeStorage();
  storage.setItem(Portal.STORAGE_KEY, '{this is not json');
  const store = Portal.createSubmissionStore(storage);
  assert.deepEqual(store.list(), []);
});
