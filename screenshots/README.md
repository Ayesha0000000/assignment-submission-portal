# Screenshot guide

Take every screenshot yourself, from your own computer and GitHub account. Do not use edited, generated or borrowed images. Save them in this folder with the file names below, then paste them into the boxes in `docs/lab-midterm-report.docx` (the figure numbers match).

| Fig. | File name | What must be visible |
|---|---|---|
| 1 | `01-portal.png` | The portal home page in the browser (sidebar, hero, form). |
| 2 | `02-valid-submission.png` | After a valid submission: green success message and the new row in the list. |
| 3 | `03-missing-registration.png` | Registration number left empty: red message under the field and the red banner; list unchanged. |
| 4 | `04-invalid-url.png` | A bad link such as `not-a-valid-url`: red message under the URL field; list unchanged. |
| 5 | `05-github-repository.png` | The repository page with the file list and the repository name/URL in the address bar. |
| 6 | `06-actions-passing.png` | The Actions run that passed: green tick, commit message, both jobs (`deploy` also green). |
| 7 | `07-report-json-passing.png` | `receiver-output\test-report.json` after the passing run (open in VS Code or Notepad), ideally with the receiver window showing "saved ...". |
| 8 | `08-actions-failing.png` | The Actions run with the defect: red cross, the failed test in the log, and the `deploy` job shown as skipped. |
| 9 | `09-report-json-failing.png` | The same file after the failing run: `"overallStatus": "failed"` and the `failureMessage` text. |
| 10 | `10-actions-corrected.png` | The run after the fix: green again. |
| 11 | `11-github-pages.png` | The deployed site open at its real `github.io` address (address bar visible) plus Settings -> Pages. |
| 12 | `12-email-success.png` | The email received for the passing run. |
| 13 | `13-email-failure.png` | The email received for the failing run. |

Extra helpful ones: terminal with `npm test` output (pass and fail), `git diff` of the one-line defect, the tunnel window running, the Secrets page (names only - never show values).

Hide anything private before taking a screenshot: tokens, app passwords, secret values, personal email addresses you do not want shared.
