# Assignment Submission Portal with Automated Testing

CSC418 DevOps - Lab Midterm Examination
COMSATS University Islamabad, Attock Campus

A small web portal where students submit an assignment link. Every push to GitHub is tested automatically, the test results are saved as a JSON report on your own computer, and (bonus) the site is published to GitHub Pages only when all tests pass.

> **Status of this project:** the code, tests, receiver, report script, email script and workflow were written and checked on a Linux test machine (see section 12). Nothing has been run on **your** GitHub account yet. The GitHub Actions run, the tunnel, GitHub Pages and real email delivery can only be verified by you. Do not write "verified" in your report until you have seen each one working with your own screenshots.

---

## 1. What is inside

```
assignment-submission-portal/
├── index.html, styles.css, app.js     The website (plain HTML, CSS, JavaScript)
├── tests/
│   ├── portal.test.js                 Automated tests (Test A, B, C + extras)
│   └── test_receiver.py               Self-tests for the Python receiver
├── scripts/
│   ├── run-tests.js                   Runs the tests, saves real results
│   ├── results-reporter.js            Turns test events into JSON
│   ├── create-report.js               Builds test-results/test-report.json
│   ├── send-report.js                 Sends the report to the receiver
│   ├── send-email.js                  Bonus: emails the report
│   ├── demo-defect.js                 Switches the controlled bug on/off
│   └── serve.js                       Tiny local web server
├── receiver/server.py                 Local HTTP receiver (saves test-report.json)
├── .github/workflows/ci.yml           GitHub Actions pipeline
├── docs/lab-midterm-report.docx       Your editable Word report
├── screenshots/README.md              Which screenshots to take
├── package.json, package-lock.json
└── .gitignore
```

**Where do submissions go?** Valid submissions are saved in the browser's **localStorage**. That is *not* a server database: the data stays in one browser on one computer and disappears if browser data is cleared. This is allowed by the lab ("save valid submissions") and is the only option on GitHub Pages, which cannot run server code.

## 2. Prerequisites (Windows 11)

Open **PowerShell** and check each tool:

```powershell
node --version      # needs v20 or newer (v22 recommended)
npm --version
python --version    # needs 3.9 or newer
git --version
```

If one is missing: install Node.js LTS from nodejs.org, Python from python.org (tick "Add python.exe to PATH"), and Git from git-scm.com. Close and reopen PowerShell afterwards. You also need a free GitHub account.

If `python` is not found, try `py --version` and use `py` instead of `python` everywhere below.

## 3. Install and run locally

```powershell
cd C:\path\to\assignment-submission-portal     # your project folder
npm install                                    # installs nodemailer (used only by the email bonus)
```

**Run the tests**

```powershell
npm test
```

You should see 12 tests with a green tick and `fail 0`. Real results are saved to `test-results\raw-results.json` and `test-results\test-output.log`.

**Build the JSON report from those results**

```powershell
npm run report            # creates test-results\test-report.json
```

**Run the receiver self-tests (optional)**

```powershell
npm run test:receiver
```

**Open the website**

```powershell
npm run serve             # then open http://localhost:5500
```

Press `Ctrl+C` to stop it. (You can also just double-click `index.html`.)

## 4. The local report receiver

The receiver is `receiver/server.py`. It uses only Python's standard library.

| Setting | Value |
|---|---|
| Host | `127.0.0.1` (default, change with `RECEIVER_HOST`) |
| Port | `8787` (default, change with `RECEIVER_PORT`) |
| Endpoint | `POST /report` (and `GET /health` to check it is alive) |
| Login | header `Authorization: Bearer <RECEIVER_TOKEN>` |
| Required variable | `RECEIVER_TOKEN` - at least 16 characters; the receiver refuses to start without it |
| Output folder | `receiver-output\` (change with `REPORT_DIR`) |
| Output file | `receiver-output\test-report.json` (always the **latest** report) |
| History | `receiver-output\history\` keeps a copy of every report received |

**Start it** (PowerShell window 1 - leave it open):

```powershell
cd C:\path\to\assignment-submission-portal
$env:RECEIVER_TOKEN = "replace-with-a-long-random-secret"
python receiver\server.py
```

To make a good random secret:

```powershell
-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 40 | ForEach-Object {[char]$_})
```

Check it is running (window 2):

```powershell
Invoke-RestMethod http://127.0.0.1:8787/health      # shows: status ok
```

The receiver rejects: no token or wrong token (401), non-JSON (400), JSON that is not a proper test report or whose counts do not match the test list (400), and bodies over 1 MB (413).

**Try the whole delivery locally, before involving GitHub** (window 2):

```powershell
$env:RECEIVER_TOKEN = "replace-with-the-same-secret"
$env:RECEIVER_URL   = "http://127.0.0.1:8787/report"
npm test
npm run report
npm run report:send
Get-Content receiver-output\test-report.json
```

## 5. The JSON report

`test-report.json` contains: `repository`, `branch`, `commitSha`, `pipelineRunId` (plus run number, attempt and URL), `executedAt`, a `tests` list (each with `name`, `result`, `durationMs`, `failureMessage`), `totalTests`, `passedTests`, `failedTests`, and `overallStatus` (`passed`, `failed`, or `error` if the test runner crashed before producing any result). It is built only from the real test run - never typed by hand.

## 6. Put the project on GitHub

1. On github.com click **New repository**. Name it e.g. `assignment-submission-portal`. Leave it empty (no README, no .gitignore). Public is simplest for GitHub Pages on a free account.
2. In PowerShell:

```powershell
cd C:\path\to\assignment-submission-portal
git init
git branch -M main
git config user.name  "Your Name"
git config user.email "you@example.com"
git add .
git status                      # check: no node_modules, test-results or receiver-output listed
git commit -m "Initial commit: portal, tests, receiver, workflow"
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
git push -u origin main
```

GitHub will ask you to sign in in the browser the first time. Never put your password or token in a file.

Then open the **Actions** tab. The first run starts by itself. It will pass the tests but will print a warning that the receiver is not configured - that is expected until section 7 is done.

## 7. Connect GitHub Actions to the receiver on your PC

**The important fact:** a GitHub-hosted runner is a machine in GitHub's data centre. If it posts to `localhost`, it talks to *itself*, not to your laptop. You need one of these two routes.

### Route A - secure tunnel (default, works with the normal GitHub runner)

A tunnel gives your local receiver a temporary public `https://` address. Only requests that carry your secret token are accepted.

**Option A1: ngrok** (needs a free ngrok account from ngrok.com)

```powershell
ngrok config add-authtoken YOUR_NGROK_AUTHTOKEN      # one time only
ngrok http 8787                                      # window 3 - leave it open
```

ngrok prints a line like `Forwarding https://random-name.ngrok-free.app -> http://localhost:8787`. Your receiver address is that URL plus `/report`.
The free random address changes every time you restart ngrok, so you must update the `RECEIVER_URL` secret each time. If your ngrok dashboard (Domains page) offers you a free static domain, you can use it so the address never changes: `ngrok http --url=your-name.ngrok-free.app 8787`. Check your own dashboard for what your plan includes.

**Option A2: Cloudflare quick tunnel** (no account needed)

```powershell
cloudflared tunnel --url http://localhost:8787       # window 3
```

It prints a `https://something.trycloudflare.com` address (random each time).

Test the tunnel from the outside before pushing (use your real address):

```powershell
Invoke-RestMethod https://YOUR-TUNNEL-ADDRESS/health
```

**Add the GitHub secrets** (repository -> **Settings** -> **Secrets and variables** -> **Actions** -> **New repository secret**):

| Secret name | Value |
|---|---|
| `RECEIVER_URL` | `https://YOUR-TUNNEL-ADDRESS/report` (must end in `/report`) |
| `RECEIVER_TOKEN` | the same token you set with `$env:RECEIVER_TOKEN` |

**During the demonstration keep three things running:** the receiver (window 1), the tunnel (window 3), and your computer awake and online. If either stops, the report cannot arrive; the workflow will print a warning, retry 4 times, and still show the true test result.

### Route B - run the pipeline on your own PC (self-hosted runner)

Here the job runs on your computer, so `localhost` really is your computer and no tunnel is needed.

1. Repository -> **Settings** -> **Actions** -> **Runners** -> **New self-hosted runner** -> choose Windows and follow GitHub's download-and-configure commands. Start it with `.\run.cmd` and leave it running.
2. Repository -> **Settings** -> **Secrets and variables** -> **Actions** -> **Variables** tab -> new variable `CI_RUNNER` = `self-hosted`.
3. Set the secret `RECEIVER_URL` to `http://localhost:8787/report` and `RECEIVER_TOKEN` as above.
4. The runner needs Node.js, Python and Git installed on that PC (you already have them). The workflow uses Git Bash (`shell: bash`), which comes with Git for Windows.

Security note: use a self-hosted runner only on a **private** repository or one where you trust everyone who can open pull requests, because it runs workflow code on your own PC. To go back to GitHub's runners, delete the `CI_RUNNER` variable.

## 8. How the workflow behaves (`.github/workflows/ci.yml`)

* **When:** every push to any branch, every pull request, and manual runs ("Run workflow" button).
* **Job `test`:** installs dependencies -> **Run automated tests** -> build JSON report -> send to receiver -> email -> receiver self-test -> upload `test-results` as a downloadable artifact.
  The report, delivery, email and upload steps use `if: ${{ !cancelled() }}`, so they run **even when tests fail**. The delivery and email steps have `continue-on-error`, so a network or mail problem can never hide a test result. Because the test step itself fails, the job ends **red** when a test fails, even though reporting succeeded.
* **Job `deploy`:** has `needs: test`, so it starts only if the whole test job succeeded, and only for a push to `main`. If tests fail, deploy is *skipped* and the previously published site stays online.

## 9. Bonus A - GitHub Pages

1. Push the project to GitHub (section 6).
2. Repository -> **Settings** -> **Pages** -> under **Build and deployment**, set **Source** to **GitHub Actions**. (No branch choice is needed.)
3. Push to `main`. When tests pass, the `deploy` job runs.
4. Find the real URL in either place: the **deploy** job in the Actions run (the `github-pages` environment link), or **Settings -> Pages** at the top.
5. The usual shape is `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/`. Only copy the address GitHub shows you, after opening it and checking that the site loads.

GitHub Pages hosts static files only. It cannot run `receiver/server.py` - the receiver always runs on your PC. If the first run says "Pages is not enabled" or "environment protection rules", re-check step 2; the `github-pages` environment may also restrict deploys to the `main` branch, which is what we want.

## 10. Bonus B - email report

The workflow always runs `scripts/send-email.js` after the tests. If the secrets below are missing it prints a notice and does nothing, so the bonus is optional.

Create these repository secrets (same place as section 7):

| Secret | Example |
|---|---|
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `465` (SSL) or `587` (STARTTLS) |
| `SMTP_USER` | your mailbox address |
| `SMTP_PASS` | an **app password**, not your normal password |
| `EMAIL_TO` | where the report should go |
| `EMAIL_FROM` | optional; defaults to `SMTP_USER` |

For Gmail: turn on 2-Step Verification, then create an App Password in your Google account security settings and use that as `SMTP_PASS`. Other providers (Outlook, a university mailbox) work too; use their SMTP host and port.

**Preview the email without sending anything:**

```powershell
npm run report:email:dry
```

**Test real delivery from your PC** (these variables exist only in this PowerShell window):

```powershell
$env:SMTP_HOST="smtp.gmail.com"; $env:SMTP_PORT="465"
$env:SMTP_USER="you@gmail.com";  $env:SMTP_PASS="your-app-password"
$env:EMAIL_TO="you@gmail.com"
npm run report:email
```

The email contains the repository, branch, full commit SHA, run ID, result, counts, every test with its failure message, and `test-report.json` as an attachment. Take the successful-run and failed-run email screenshots only from real emails in your inbox.

## 11. The demonstration (Task 5)

Start with receiver (window 1) and tunnel (window 3) running and secrets set. Take the screenshots listed in `screenshots/README.md` at each stage.

**Stage 1 - working revision passes**

```powershell
git status
npm test                                   # all green on your PC first
git add . ; git commit -m "Working revision" --allow-empty
git push
```
Show: Actions run is green -> `receiver-output\test-report.json` shows `"overallStatus": "passed"`.

**Stage 2 - introduce the controlled defect**

```powershell
npm run defect:on                          # changes ONE line in app.js
git diff                                   # screenshot the one-line change
npm test                                   # Test B turns red locally
git add app.js
git commit -m "Introduce defect: registration check broken"
git push
```
Show: Actions run is **red**, the failing test and its message in the log, the **deploy job skipped**, and `receiver-output\test-report.json` now shows `"overallStatus": "failed"` with a `failureMessage` for the failed tests. The earlier Pages site is still online.

**Stage 3 - fix it**

```powershell
npm run defect:off
npm test
git add app.js
git commit -m "Fix registration number validation"
git push
```
Show: Actions run green again, report back to `"passed"`, deploy job runs, Pages site updated.

Useful viewing commands:

```powershell
Get-Content receiver-output\test-report.json
Get-ChildItem receiver-output\history          # one file per run received
git log --oneline
```

(`npm run defect:on` makes Test B fail and also one extra test about a blank registration number, so you will see 2 failures. That is expected.)

## 12. What was checked, and what was not

Checked on a Linux test machine (Node 22, Python 3.12) while building this:

* The 12 JavaScript tests pass; with the defect switched on, 2 fail and the test command exits non-zero; after the fix they pass again.
* The report script produced valid JSON for passing and failing runs; the receiver saved each one as `test-report.json`; the receiver refused a wrong token (401); the sender reported a clear error when the receiver was unreachable. (Run locally against `127.0.0.1`.)
* The 12 receiver self-tests pass.
* The page logic was exercised in a simulated browser (jsdom): validation messages, rejected saves, saved list, statistics, safe text display.
* `ci.yml` passes the `actionlint` workflow checker.
* The email script builds the correct message in `--dry-run` mode.

**Not** checked (needs your accounts and computer): a real GitHub Actions run, the tunnel from GitHub's runner to your PC, a self-hosted runner, a real GitHub Pages deployment and URL, real email delivery, and the website in a real browser's visual layout.

## 13. Troubleshooting

| Problem | What to do |
|---|---|
| `python` not recognised | Try `py`, or reinstall Python with "Add to PATH" ticked. |
| `RECEIVER_TOKEN is missing...` | Set it in the same PowerShell window: `$env:RECEIVER_TOKEN = "..."`. |
| Workflow warning "RECEIVER_URL ... not set" | Add the two secrets (section 7). |
| "could not reach the receiver" in the log | Receiver or tunnel is not running, or the tunnel address changed - update `RECEIVER_URL`. |
| HTTP 401 in the log | `RECEIVER_TOKEN` secret differs from the one the receiver was started with. |
| HTTP 404 | `RECEIVER_URL` is missing `/report` at the end. |
| `npm ci` fails in Actions | Make sure `package-lock.json` is committed. |
| Deploy job did not run | Tests failed, or the push was not to `main`, or Pages source is not "GitHub Actions". |
| Deploy job error about Pages | Settings -> Pages -> Source = GitHub Actions; repository must allow Pages (public on free plans). |
| Email warning "Invalid login" | Use an app password, not your normal password; check host and port. |
| Windows blocks scripts | Not needed here; every command is a plain program, not a `.ps1` script. |
| Tests pass locally but fail in CI | Run `node --version` - CI uses Node 22. Commit all files (`git status`). |

## 14. Security notes

* No passwords, tokens or SMTP details are in the code. They live only in GitHub secrets and in your own PowerShell session.
* `.env`, `test-results/` and `receiver-output/` are in `.gitignore`.
* The receiver listens only on `127.0.0.1`, checks the token in constant time, limits body size, and validates the JSON before saving.
* If you ever paste a secret in a public place by mistake, change it straight away.
