
/*
 * Assignment Submission Portal - application logic
 *
 * This single file has two parts:
 *   1. PortalCore - pure logic (validation + saving).
 *   2. The page - connects PortalCore to index.html.
 *
 * Saving: valid submissions are kept in browser localStorage.
 */

(function (root, factory) {
  var core = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = core;
  } else {
    root.PortalCore = core;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STORAGE_KEY = 'assignmentPortal.submissions.v1';

  var MESSAGES = {
    nameRequired: 'Student name is required.',
    registrationRequired: 'Registration number is required.',
    registrationFormat:
      'Registration number can only contain letters, numbers, hyphens and slashes (for example FA23-BSE-032).',
    titleRequired: 'Assignment title is required.',
    urlRequired: 'Submission URL is required.',
    urlInvalid:
      'Enter a valid link that starts with http:// or https:// (for example https://github.com/user/repo).',
  };

  var REGISTRATION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9\-\/]{2,29}$/;

  function isBlank(value) {
    return value === undefined ||
      value === null ||
      String(value).trim() === '';
  }

  function clean(value) {
    return isBlank(value) ? '' : String(value).trim();
  }

  /** True only for a well-formed http(s) link with a real-looking host. */
  function isValidUrl(text) {
    if (typeof text !== 'string' || text.length > 2048 || /\s/.test(text)) {
      return false;
    }

    var parsed;

    try {
      parsed = new URL(text);
    } catch (e) {
      return false;
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    var host = parsed.hostname;

    return host === 'localhost' || /^[^.]+(\.[^.]+)+$/.test(host);
  }

  /**
   * Checks one submission.
   * Returns { valid, errors, values }.
   */
  function validateSubmission(input) {
    input = input || {};

    var values = {
      studentName: clean(input.studentName),
      registrationNumber: clean(input.registrationNumber),
      assignmentTitle: clean(input.assignmentTitle),
      submissionUrl: clean(input.submissionUrl),
    };

    var errors = {};

    if (isBlank(values.studentName)) {
      errors.studentName = MESSAGES.nameRequired;
    }

    // FIX: Reject empty and spaces-only registration numbers.
    if (isBlank(values.registrationNumber)) {
      errors.registrationNumber = MESSAGES.registrationRequired;
    }

    // Check format only when a registration number was entered.
    if (
      values.registrationNumber &&
      !REGISTRATION_PATTERN.test(values.registrationNumber)
    ) {
      errors.registrationNumber = MESSAGES.registrationFormat;
    }

    if (isBlank(values.assignmentTitle)) {
      errors.assignmentTitle = MESSAGES.titleRequired;
    }

    if (isBlank(values.submissionUrl)) {
      errors.submissionUrl = MESSAGES.urlRequired;
    } else if (!isValidUrl(values.submissionUrl)) {
      errors.submissionUrl = MESSAGES.urlInvalid;
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors: errors,
      values: values,
    };
  }

  /** In-memory storage used if localStorage is blocked. */
  function createMemoryStorage() {
    var data = {};

    return {
      getItem: function (k) {
        return Object.prototype.hasOwnProperty.call(data, k)
          ? data[k]
          : null;
      },

      setItem: function (k, v) {
        data[k] = String(v);
      },

      removeItem: function (k) {
        delete data[k];
      },
    };
  }

  /**
   * Creates the submission list.
   * Storage needs getItem, setItem and removeItem.
   */
  function createSubmissionStore(storage, options) {
    options = options || {};

    var now = options.now || function () {
      return new Date();
    };

    var counter = 0;
    var store = storage || createMemoryStorage();

    function load() {
      try {
        var raw = store.getItem(STORAGE_KEY);
        var parsed = raw ? JSON.parse(raw) : [];

        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        return [];
      }
    }

    function save(list) {
      store.setItem(STORAGE_KEY, JSON.stringify(list));
    }

    return {
      /** Validates and saves only valid submissions. */
      add: function (input) {
        var result = validateSubmission(input);

        if (!result.valid) {
          return {
            ok: false,
            errors: result.errors,
            submission: null,
          };
        }

        counter += 1;

        var submission = {
          id: now().getTime().toString(36) + '-' + counter,
          studentName: result.values.studentName,
          registrationNumber: result.values.registrationNumber,
          assignmentTitle: result.values.assignmentTitle,
          submissionUrl: result.values.submissionUrl,
          submittedAt: now().toISOString(),
        };

        var list = load();

        list.unshift(submission);
        save(list);

        return {
          ok: true,
          errors: {},
          submission: submission,
        };
      },

      list: load,

      clear: function () {
        store.removeItem(STORAGE_KEY);
      },

      stats: function () {
        var list = load();
        var students = {};

        list.forEach(function (s) {
          students[s.registrationNumber.toLowerCase()] = true;
        });

        return {
          total: list.length,
          students: Object.keys(students).length,
          latest: list.length ? list[0].submittedAt : null,
        };
      },
    };
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    MESSAGES: MESSAGES,
    isValidUrl: isValidUrl,
    validateSubmission: validateSubmission,
    createSubmissionStore: createSubmissionStore,
    createMemoryStorage: createMemoryStorage,
  };
});

/* ------------------------------------------------------------------ */
/* Page wiring (browser only)                                          */
/* ------------------------------------------------------------------ */

if (typeof document !== 'undefined') {
  (function () {
    'use strict';

    var Core = window.PortalCore;

    var storage;
    var usingFallback = false;

    try {
      storage = window.localStorage;
      storage.setItem('__portal_test__', '1');
      storage.removeItem('__portal_test__');
    } catch (e) {
      storage = Core.createMemoryStorage();
      usingFallback = true;
    }

    var store = Core.createSubmissionStore(storage);

    var $ = function (id) {
      return document.getElementById(id);
    };

    var form = $('submission-form');
    var statusBox = $('form-status');
    var tbody = $('submission-rows');
    var emptyState = $('empty-state');
    var tableWrap = $('table-wrap');
    var clearBtn = $('clear-all');
    var dialog = $('confirm-dialog');

    var fields = [
      'studentName',
      'registrationNumber',
      'assignmentTitle',
      'submissionUrl',
    ];

    if (usingFallback) {
      $('storage-note').textContent =
        'Your browser blocked localStorage, so submissions are kept in memory only and will be lost when you close this page.';
    }

    function formatDate(iso) {
      var d = new Date(iso);

      return isNaN(d)
        ? ''
        : d.toLocaleString([], {
            dateStyle: 'medium',
            timeStyle: 'short',
          });
    }

    function clearErrors() {
      fields.forEach(function (name) {
        var input = $(name);

        input.removeAttribute('aria-invalid');
        $(name + '-error').textContent = '';
      });
    }

    function showErrors(errors) {
      var first = null;

      fields.forEach(function (name) {
        if (errors[name]) {
          $(name).setAttribute('aria-invalid', 'true');
          $(name + '-error').textContent = errors[name];

          if (!first) {
            first = $(name);
          }
        }
      });

      if (first) {
        first.focus();
      }
    }

    function setStatus(kind, message) {
      statusBox.className = 'status status-' + kind;
      statusBox.textContent = message;
      statusBox.hidden = false;
    }

    function cell(text, label, className) {
      var td = document.createElement('td');

      td.setAttribute('data-label', label);

      if (className) {
        td.className = className;
      }

      td.textContent = text;

      return td;
    }

    function render() {
      var list = store.list();
      var stats = store.stats();

      $('stat-total').textContent = stats.total;
      $('stat-students').textContent = stats.students;

      $('stat-latest').textContent = stats.latest
        ? formatDate(stats.latest)
        : 'No submissions yet';

      $('nav-count').textContent = stats.total;

      tbody.textContent = '';

      list.forEach(function (s) {
        var tr = document.createElement('tr');

        tr.appendChild(cell(s.studentName, 'Student'));
        tr.appendChild(cell(s.registrationNumber, 'Reg. no.'));
        tr.appendChild(cell(s.assignmentTitle, 'Assignment'));

        var linkCell = document.createElement('td');

        linkCell.setAttribute('data-label', 'Link');

        var a = document.createElement('a');

        a.href = s.submissionUrl;
        a.textContent = s.submissionUrl;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';

        linkCell.appendChild(a);
        tr.appendChild(linkCell);

        tr.appendChild(cell(formatDate(s.submittedAt), 'Submitted'));

        tbody.appendChild(tr);
      });

      var has = list.length > 0;

      emptyState.hidden = has;
      tableWrap.hidden = !has;
      clearBtn.disabled = !has;
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();

      clearErrors();

      var input = {};

      fields.forEach(function (name) {
        input[name] = $(name).value;
      });

      var result = store.add(input);

      if (!result.ok) {
        showErrors(result.errors);

        setStatus(
          'error',
          'Submission not saved. Please fix the highlighted fields.'
        );

        return;
      }

      form.reset();

      setStatus(
        'success',
        'Submission saved for ' + result.submission.studentName + '.'
      );

      render();

      $('submissions').scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });

    clearBtn.addEventListener('click', function () {
      if (typeof dialog.showModal === 'function') {
        dialog.showModal();
      } else if (window.confirm('Delete all saved submissions?')) {
        store.clear();
        render();
      }
    });

    $('confirm-yes').addEventListener('click', function () {
      store.clear();
      dialog.close();

      setStatus('success', 'All submissions were deleted.');

      render();
    });

    $('confirm-no').addEventListener('click', function () {
      dialog.close();
    });

    // Mobile menu
    var menuBtn = $('menu-toggle');
    var sidebar = $('sidebar');

    menuBtn.addEventListener('click', function () {
      var open = sidebar.classList.toggle('is-open');

      menuBtn.setAttribute('aria-expanded', String(open));
    });

    sidebar.addEventListener('click', function (e) {
      if (e.target.closest('a')) {
        sidebar.classList.remove('is-open');

        menuBtn.setAttribute('aria-expanded', 'false');
      }
    });

    render();
  })();
}
