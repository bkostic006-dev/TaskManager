# Tally — final QA pass (stage 8 input)

Browser QA for everything a terminal cannot check. Backend status codes, rotation under
concurrency, tenancy, the query contract, pagination stability, completion idempotency,
throttling and cache tenancy are **already verified** (69 tests + curl runs, recorded per stage in
[PLAN.md](PLAN.md)). **Do not re-test those.** What follows tests only what a human sees and does.

---

## How this works

There is no pre-written manual checklist. **The bot attempts everything**, and every pass ends by
reporting what it could not do. Your list is whatever comes back in those reports — measured, not
guessed. Anything needing a terminal (starting a dev server, stopping a container, reseeding) I run
from here; you only ever drive the browser.

**Stack.** `docker compose up -d --wait` → 5 containers. Web `http://localhost:3000`,
gateway `http://localhost:3001`.

**Profile.** Every pass runs in a **clean profile or incognito with all other extensions disabled**
except the Claude extension. The first smoke test showed `[WIREFRAMEIT] - Content Core Script loaded`
in the console — an unrelated extension. In a dirty profile our console noise cannot be told apart
from theirs, and "console clean" would mean nothing.

**Credentials**, repeated in every prompt because each run starts with no memory:

```
email:    dana@northbay.dev
password: tally-demo-2026
```

**Verified baseline**, checked live against the running stack:

| Fact | Value |
|---|---|
| Total tasks | 47 |
| Pending / completed | 31 / 16 |
| Pages at size 8 | 6 (all), 4 (pending), 2 (completed) |
| Page-size options | 8 / 16 / 24 / 48 |
| Password minimum | 10 characters |

### Order and data safety

Passes **1–7 and 10 are read-only.** **Pass 8 (CRUD) writes**, and is built to be net-zero: it
creates one task, edits, completes, uncompletes and deletes it, ending back at 47/31/16. Pass 9
forces failures but persists nothing.

Run in order. If pass 8 is interrupted, tell me and I'll reseed with
`docker compose down -v && up -d --build --wait`.

### Things I need to do from the terminal

Tell me when you reach these and I'll run them:

| Before | I run |
|---|---|
| Pass 9, step on the list error state | `docker compose stop gateway`, then `start gateway` on your word |
| Pass 11 (StrictMode) | `docker compose stop web` and `corepack pnpm --filter @tally/web dev` |
| Any re-run after pass 8 was interrupted | full reseed |

---

## Changes landed after this plan was written — new code, no browser coverage

Two frontend fixes shipped (`6744549`, `f1d06b6`) plus a README sweep. **81 tests pass** —
verified: 27 web + 32 gateway + 12 auth + 10 task. Both fixes need re-verification in a browser.

1. **Throttled refresh no longer looks like a logout.** Previously a `429` on `POST /auth/refresh`
   cleared the session and dumped the user on a blank login form, indistinguishable from an expired
   session. Now the session clears **only on a 401**; anything else (429, 5xx, network) reaches a new
   `unavailable` session state and the login page renders *"We couldn't restore your session."* with
   the gateway's own sentence. **The regression to watch for is an infinite spinner** — the fix added
   a fourth session state and getting it wrong hangs the app. → **Pass 4B**
2. **A throttled login no longer blames the form.** Previously a `429` showed the same sentence
   twice: a red Alert titled "Check the form below." plus a toast that never auto-closed. Now
   `isFormFailure()` (`form-errors.ts:27`) routes `400/401/409` to the inline Alert and everything
   else to a toast only — exactly one appears. → **Pass 2B**

### ⚠️ Rate-limit budget — why 2B and 4B are separate passes

Tiers: **login/signup 10/min · task list 240/min · everything else 120/min**, tracked **per IP**, and
behind Docker every request arrives from the bridge address, so one bucket is shared.

Pass 2 spends **5 login attempts** in its normal course. Testing the throttle needs 11 more in the
same minute. Run them together and pass 2's own steps start returning `429` mid-pass and every later
observation becomes unreadable. **They are split, and 2B must start on a fresh bucket — wait 60
seconds after pass 2 before running it.**

The server-authored message is *"Too many requests. Wait a moment and try again."* A raw framework
string like `ThrottlerException: Too Many Requests` appearing anywhere is a defect.

### Also to re-check

- **README is now reviewer-facing** — it has an API table, a Tests section and demo credentials. If
  any endpoint, status code or query default in that table disagrees with what the network recorder
  shows, that outranks any UI nit. Folded into passes 6 and 8.
- **`design/` is no longer tracked by git** (`481f104`), still on disk. Nothing in the app imports
  from it. **Any 404 on a design asset is a defect** — watch for it in every pass.

---

## Two pre-findings from reading the code — confirm, don't assume

Neither is browser evidence. The passes still observe rather than confirm, so the report rests on
what was seen.

1. **URL state is very likely absent.** [dashboard/page.tsx:54](../apps/web/src/app/dashboard/page.tsx#L54)
   holds page, size, status, search and sort in `useState`. There is no `useSearchParams` anywhere in
   `apps/web/src`, and the only router calls in the app are `replace('/dashboard')` and
   `replace('/login')`. Pass 7 measures it.
2. **The refresh cookie appears under `localhost:3000` in the Application panel**, because cookies
   ignore port. Easy to misread as "the cookie is missing".

---

## The open question: `:3001/auth/refresh → 401`

**RESOLVED 2026-08-17 from passes 1 and 2, without pass 4.** Pass 4 was written before those two
ran; their request logs already answer it:

- **Before login** — pass 1 §2 and §3: *exactly one* `POST /auth/refresh → 401` per page load, on
  both `/` and `/dashboard`. Correct: the boot restore finding no cookie is how the app decides to
  show `/login`.
- **After login** — pass 2 §5's ordered list is `OPTIONS /auth/login 204 → POST /auth/login 200 →
  OPTIONS /tasks 204 → GET /tasks 200`. **No `/auth/refresh` at all**, so no post-login 401.
- **More than one per load** — never observed; every recorded page load produced exactly one.

**Residual gap, small:** the refresh count on an F5 *while logged in* was never counted directly.
`restoreAttempted` (`api-client.ts:138`) is a module-level latch and `refreshSession()` coalesces
concurrent callers, so the code cannot issue two; and pass 2 §5 plus the 7 passing coordinator tests
back that. Not measured in a browser, so stated as reasoned rather than observed.

The original rule, kept for reference:

| Where the 401 sits | Verdict |
|---|---|
| Before any login, as the only `/auth/refresh` call | **Correct.** The boot-time silent restore finding no cookie — how the app decides to show `/login`. |
| **After** a successful login | **Real defect.** Either the cookie is not riding the cross-origin XHR, or the single-flight is failing. |
| **More than one** per page load | **Real defect.** Rotation is compare-and-swap, so the second is answered 401 by design and logs the user out at random. |

### Already established (do not re-test)

A browser-extension run on 2026-08-16 corrupted the access token **on the wire** and observed
`GET /tasks 401 → POST /auth/refresh 200 → GET /tasks 200`, with no error flash and no bounce to
login. Confirmed from the terminal alongside it:

| Property | Evidence |
|---|---|
| Access token is in memory only | `auth-session.ts:39` — a module variable, never `localStorage` |
| Refresh token is an **httpOnly cookie**, not sessionStorage | `Set-Cookie: refresh_token=…; Path=/auth; HttpOnly; SameSite=Lax`, and the refresh call posts `undefined` with `anonymous: true` — the cookie is its only credential |
| Rotation rotates | login `O-rcS4ak…` → refresh `HxCJV5gV…`; spent cookie `401`, new one `200` |
| Boot with no cookie | `401 {"statusCode":401,"error":"UNAUTHORIZED","message":"That session has expired. Log in again."}` |
| Client single-flight | 7 passing tests in `api-client.spec.ts` |

**Still open:** the wire trick left the in-memory token valid throughout, so the replay would have
succeeded regardless — the refresh returning `200` is observed, the replay *using* its result is
not. And the **failure** path is untested entirely (pass 5).

*Aside, so it isn't mistaken for a bug:* a refresh in the same wall second as the login returns a
**byte-identical** access token. The payload has no `jti` and `iat`/`exp` are second-resolution, so
identical input signs identically. Two seconds apart they differ. Not a defect.

---

# The passes

Paste each block verbatim into a fresh extension run. Every one ends with the same capability rule —
that is the mechanism that produces your list.

---

## Pass 1 — Boot and unauthenticated routing

```
You are QA-testing a task manager web app at http://localhost:3000. This is a fresh run —
assume nothing about the app's behaviour and report only what you actually observe.

Open the DevTools Network and Console panels before you start and KEEP THEM OPEN for the
whole pass. Report anything unexpected in either, including exact text.

Credentials, if needed (you should NOT need to log in during this pass):
  email:    dana@northbay.dev
  password: tally-demo-2026

Steps, in order, starting with NO session (clear cookies for localhost first):

1. Go to http://localhost:3000/ . Report: what URL the address bar ends on, what is
   rendered there (headline, field labels, button labels), and how long any loading
   indicator showed before the final content appeared.
2. In the Network panel, list EVERY request to localhost:3001 during step 1, in order, with
   method, path and status code.
3. Go directly to http://localhost:3000/dashboard . Report the URL you end on, what was
   rendered in between and for how long, and what is rendered at the end.
4. Go to http://localhost:3000/login . Report the exact heading, the sub-heading, every
   field label, the button label, and any link text at the bottom.
5. Go to http://localhost:3000/signup . Report the same, plus any helper text under a field.
6. Go to http://localhost:3000/nope . Report exactly what is displayed and the HTTP status
   of the document request.

Report what you SAW, not what you expected. For any non-2xx response give the status code
and the response body.

IMPORTANT — capability reporting. Attempt every step. If you cannot do one, do NOT skip it
silently and do NOT substitute an easier version. Record the step number, exactly what you
tried, and what stopped you, then carry on with the remaining steps. End your report with a
section headed "COULD NOT DO" listing one line per step you could not complete. If you
completed everything, write "COULD NOT DO: nothing".
```

---

## Pass 2 — Login, logout, auth errors

```
You are QA-testing a task manager web app at http://localhost:3000. This is a fresh run —
assume nothing and report only what you actually observe.

Open the DevTools Network and Console panels before you start and KEEP THEM OPEN for the
whole pass. Report anything unexpected in either, with exact text.

Working credentials:
  email:    dana@northbay.dev
  password: tally-demo-2026

Steps, in order, starting logged out:

1. Go to http://localhost:3000/login . Submit with BOTH fields empty. Report any inline
   error text, any banner, any toast, and whether a request was sent at all (if so: method,
   path, status, response body).
2. Submit with email "not-an-email" and password "short". Report the exact error text and
   WHERE it appears (under a field? a banner? a toast?), plus status code and response body.
3. Submit dana@northbay.dev with the WRONG password "wrong-password-here". Report the exact
   error text, where it appears, the status code, the response body, and the request
   duration from the Network panel.
4. Submit a non-existent email nobody@nowhere.test with password "some-password". Report the
   same details, then state explicitly whether the message and status code are IDENTICAL to
   step 3 or different — quote both.
5. Log in with the working credentials. Report: the URL you land on, any toast (exact title
   and body, and how long before it disappears), whether the submit button showed a loading
   state, and the ordered list of requests to localhost:3001 with statuses.
6. Click Log out. Report the URL you end on, any toast, and the ordered request list.
7. Press the browser Back button. Report what is displayed — the task list again, or the
   login screen?

Report what you SAW, not what you expected. For every failing call give the status code and
the response body verbatim.

IMPORTANT — capability reporting. Attempt every step. If you cannot do one, do NOT skip it
silently and do NOT substitute an easier version. Record the step number, exactly what you
tried, and what stopped you, then carry on with the remaining steps. End your report with a
section headed "COULD NOT DO" listing one line per step you could not complete. If you
completed everything, write "COULD NOT DO: nothing".
```

---

## Pass 3 — Signup and the first-run empty state

*The demo account always has 47 tasks, so a fresh account is the only way to see the empty state.*

**Three constraints on this pass:**

1. **Signup shares the `authWrite` 10/min bucket with login.** This pass spends ~5. Do not run it
   within 60s of pass 2B or any other throttle test.
2. **It creates a real account** (`qa-probe-1@northbay.dev`) that persists until the next
   `down -v`. On a re-run that address will answer `409` — increment to `qa-probe-2` and record
   which was used.
3. **It is the clean re-measure for D5.** No iframe replay, no injected instrumentation — the
   toast lifetime and the notification-root count must be observed in one ordinary tab, or the
   measurement is contaminated the same way pass 2's was.

```
You are QA-testing a task manager web app at http://localhost:3000. This is a fresh run —
assume nothing and report only what you actually observe.

Open the DevTools Network and Console panels before you start and KEEP THEM OPEN for the
whole pass. Report anything unexpected in either, with exact text.

Start logged out, in a clean profile. Steps, in order:

1. Go to http://localhost:3000/signup . Submit the form completely EMPTY. Report every
   inline error with its exact wording, any banner heading and body, any toast, and whether
   a request was sent (method, path, status, and the response body).
2. WITHOUT reloading, type a valid name, a valid new email and a 12-character password into
   the three fields, but do NOT submit. Report for EACH field whether its red error state
   clears as you type or stays. Report separately whether the banner clears. Quote whatever
   is still on screen at the end of this step.
3. Submit with a valid name, a valid new email, and a password of exactly 9 characters
   ("shortpwd1"). Report the exact error text, where it appears, the status code and the
   response body.
4. Now try to sign up with the email dana@northbay.dev, a valid name, and the password
   "a-long-enough-password". Report the exact error text, the status code, the response
   body, and specifically WHERE the message appears: under the email field, or in a banner
   at the top, or BOTH? State explicitly whether a banner is present for this case.
5. Sign up properly with name "QA Probe", email "qa-probe-1@northbay.dev" and password
   "qa-probe-pass-2026". If that address returns 409 it already exists from an earlier
   attempt — switch to qa-probe-2@northbay.dev and say which you used. Report: the URL you
   land on, whether you were signed straight in or sent back to a login form, and the
   ordered request list.
6. TOAST MEASUREMENT — do this in the ordinary tab. Do NOT replay the navigation in an
   iframe, and do not inject timing instrumentation beyond reading the DOM. Report: the
   toast's exact title and message, WHICH CORNER it appears in, its approximate width in CSS
   pixels, and how many seconds it stays on screen before disappearing on its own.
7. Then run this in the page and report the number returned, exactly:
     document.querySelectorAll('.mantine-Notifications-root').length
   Report it once on this page, and state whether you have opened any iframe or injected any
   script during this pass.
8. On the new account's task list, report EXACTLY what is rendered: any large decorative
   character or number, the heading, the body text under it, and every button with its exact
   label.
9. Report the task count shown for this new account. State explicitly whether you can see
   any task belonging to the other account.
10. Click the button offered by that empty state and report what happens.
11. Log out, then log in as dana@northbay.dev / tally-demo-2026 and report the task count.
    State whether it differs from step 9.

Report what you SAW, not what you expected. For every failing call give the status code and
the response body verbatim.

IMPORTANT — capability reporting. Attempt every step. If you cannot do one, do NOT skip it
silently and do NOT substitute an easier version. Record the step number, exactly what you
tried, and what stopped you, then carry on with the remaining steps. End your report with a
section headed "COULD NOT DO" listing one line per step you could not complete. If you
completed everything, write "COULD NOT DO: nothing".
```

---

## Pass 3R — human redo of what pass 3 lost

Run by a person, not the extension. Only the observations the salvage could not recover. **Use
`qa-probe-2@northbay.dev`** — `qa-probe-1` exists and now answers `409`. Open DevTools first: a
human can, which is what makes 3R cheaper than the bot version.

| # | Do | Record |
|---|---|---|
| 1 | `/signup`, submit **empty** | Error under each of the three fields, verbatim. Banner heading + body, or "none" |
| 2 | **Without reloading**, type `QA Probe`, `qa-step2@northbay.dev`, `abcdefghijkl`. **Do not submit** | For each field: does the red clear as you type, or stay? Does the banner clear? ← **D4 on signup** |
| 3 | Set password to `shortpwd1` (9 chars), submit | Exact error text and where it sits |
| 4 | Set email to `dana@northbay.dev`, password `a-long-enough-password`, submit | Exact error text; **is it under the email field only, or is there also a banner?** Both, or one? |
| 5 | Set email `qa-probe-2@northbay.dev`, password `qa-probe-pass-2026`, submit | Where you land; signed straight in or bounced to login? |
| 6 | The moment the toast appears, paste the timer snippet below | Seconds until it disappears ← **D5 half 1** |
| 7 | Run the root-count snippet | The number ← **D5 half 2** |
| 8 | Look at the empty task list | Large figure/number, heading, body text, button label — verbatim |
| 9 | Read the task count | The number shown |

**Timer** — paste as soon as the toast is visible:

```js
(()=>{const s=Date.now(),i=setInterval(()=>{if(!document.querySelector('.mantine-Notification-root')){clearInterval(i);console.log('TOAST GONE after',((Date.now()-s)/1000).toFixed(1),'s')}},100)})()
```

**Root count:**

```js
document.querySelectorAll('.mantine-Notifications-root').length
```

**What the numbers mean.** Root count `1` plus a toast near 4s → D5 dismissed, pass 2's readings
were instrumentation artefacts. Root count `1` but a toast near 12s → D5 is real and the cause is in
the code, not the harness. Root count above `1` in a plain tab → a genuine mounting bug, and the
higher-severity outcome.

Already proven by the databases, so **not** in this list: signup creates the account and returns a
session · the new account has 0 tasks · the empty-state button opens the create drawer · Dana's
47/16 is untouched.

## Pass 4 — Session persistence, refresh count, cookie attributes ⚠️ resolves the open question

```
You are QA-testing a task manager web app at http://localhost:3000. This is a fresh run —
assume nothing and report only what you observe. This pass is about REQUEST ORDERING, so
the Network panel is the primary evidence.

Before you start: clear all cookies for localhost. Open the DevTools Network and Console
panels and KEEP THEM OPEN for the whole pass. In the Network panel, ENABLE "Preserve log" so
requests survive navigations. Report anything unexpected in either panel.

Credentials:
  email:    dana@northbay.dev
  password: tally-demo-2026

Steps, in order:

1. With cookies cleared, load http://localhost:3000/login . Before doing anything else, list
   EVERY request to localhost:3001 in order with method, path and status. State explicitly
   how many /auth/refresh calls you counted.
2. Log in and wait for the task list to render fully. List EVERY request to localhost:3001
   since step 1, in order. State explicitly how many /auth/refresh calls happened AFTER the
   login request, and what status each returned.
3. Open DevTools → Application → Cookies → the localhost entry. Find the cookie named
   refresh_token and report EXACTLY, as columns: Name, the first 8 characters of its Value,
   Domain, Path, Expires, and the HttpOnly / Secure / SameSite flags. If it is not listed
   under localhost:3000, also check the localhost:3001 entry before concluding it is missing.
4. Press F5. Report: are you still signed in, or sent to the login screen? What was rendered
   during the reload and for roughly how long? List every request the reload caused, and
   state explicitly how many /auth/refresh calls this ONE reload produced.
5. Go back to Application → Cookies and re-read the refresh_token Value. State whether its
   first 8 characters CHANGED from what you recorded in step 3.
6. Do a second hard refresh (Ctrl+Shift+R). Report: still signed in? and the exact count of
   /auth/refresh calls for this reload.
7. For the most recent successful POST to /auth/refresh, report from the Network panel:
   whether a Cookie header is present on the request and whether it names refresh_token, and
   whether the response carries a Set-Cookie whose value DIFFERS from the one sent.
8. Navigate to http://localhost:3000/login while still signed in. Report where you end up.
9. Finally, state a clear verdict: did any 401 from /auth/refresh occur AFTER a successful
   login in this session? Quote the ordered request list that supports your answer. A 401
   BEFORE any login is normal; AFTER a successful login it is not. Give the ordering
   evidence rather than a judgement.

Report what you SAW. For any failing call give the status code and the response body.

IMPORTANT — capability reporting. Attempt every step. If you cannot do one, do NOT skip it
silently and do NOT substitute an easier version. Record the step number, exactly what you
tried, and what stopped you, then carry on with the remaining steps. End your report with a
section headed "COULD NOT DO" listing one line per step you could not complete. If you
completed everything, write "COULD NOT DO: nothing".
```

---

## Pass 5 — Session failure and two tabs

*The dead-cookie logout path, and what a second tab does. DevTools can edit an `HttpOnly` cookie's
value even though script cannot read it.*

```
You are QA-testing a task manager web app at http://localhost:3000. This is a fresh run —
assume nothing and report only what you observe.

Open the DevTools Network and Console panels before you start, ENABLE "Preserve log", and
KEEP THEM OPEN for the whole pass. Report anything unexpected in either, with exact text.

Credentials:
  email:    dana@northbay.dev
  password: tally-demo-2026

Part A — two tabs:

1. Log in and land on the task list. Open a SECOND tab to http://localhost:3000/dashboard .
   Report whether the second tab shows the task list without asking you to log in again, and
   how many /auth/refresh calls the second tab made on load.
2. In tab A, create a task titled "two-tab probe". Report whether tab B shows it WITHOUT a
   manual refresh, and then after a manual refresh.
3. In tab A, delete "two-tab probe". Then, WITHOUT refreshing tab B, try to delete the same
   task from tab B's now-stale list. Report the status code of that request, the exact toast
   text that appears, and whether the app stays usable.
4. In tab A, click Log out. Switch to tab B and click something that makes a request. Report
   what happens: does tab B recover, redirect to the login screen, or show an error?

Part B — the dead cookie:

5. Close the second tab. Log in again fresh in one tab and land on the task list.
6. Open DevTools → Application → Cookies → localhost. Double-click the VALUE of the
   refresh_token cookie and replace it with the text: garbage
   Press Enter and confirm the row now shows that value. Report whether you were able to
   edit it.
7. Do NOT reload yet. Click a status filter to trigger an authenticated request. Report what
   happens and the status code — the in-memory access token should still be valid, so this
   is expected to succeed.
8. Now press F5. Report the ordered request list, the status of every /auth/refresh call,
   where you end up, and how long any loading state showed before it resolved. State
   explicitly whether you landed on the login screen, or were left on a spinner, a blank
   page, or a redirect loop.
9. Log in again normally and confirm the session recovers.

Report what you SAW, not what you expected. For every failing call give the status code and
the response body verbatim.

IMPORTANT — capability reporting. Attempt every step. If you cannot do one, do NOT skip it
silently and do NOT substitute an easier version. Record the step number, exactly what you
tried, and what stopped you, then carry on with the remaining steps. End your report with a
section headed "COULD NOT DO" listing one line per step you could not complete. If you
completed everything, write "COULD NOT DO: nothing".
```

---

## Pass 6 — List rendering, pagination, page size

```
You are QA-testing a task manager web app at http://localhost:3000. This is a fresh run —
assume nothing and report only what you observe.

Open the DevTools Network and Console panels before you start and KEEP THEM OPEN for the
whole pass. Report anything unexpected in either, with exact text.

Credentials:
  email:    dana@northbay.dev
  password: tally-demo-2026

Log in first, then:

1. Report every number displayed on the page: the large count near the heading, the
   "Showing X–Y of Z" text, how many task rows actually rendered, and the page numbers
   offered by the pagination control. Quote them exactly.
2. Report what a single task row contains: a number? a checkbox? a title? a smaller line
   under it? a status badge (what does it say)? action buttons (what are their labels or
   tooltips)?
3. Walk through EVERY page from 1 to the last. For each: the page number, the "Showing X–Y
   of Z" text, and how many rows rendered. On the LAST page report the row count. Also
   report whether row numbers continue counting up across pages or restart at 01 each page.
4. For one page change, report the full request URL sent to localhost:3001 including its
   query string, and the status code.
5. Back on page 1: report exactly which options the page-size selector offers. Then select
   EACH one and report, for each: rows rendered, the "Showing X–Y of Z" text, the number of
   pages offered, and the query string of the request sent.
6. Set the page size to the smallest option, go to the LAST page, then change the page size
   to the largest option. Report what page you end up on and whether any rows rendered —
   state explicitly whether you were left on an empty page.
7. State whether the total is consistent everywhere it appears, and quote any two numbers
   that disagreed.

Report what you SAW, not what you expected. Give the status code and response body for any
failing call.

IMPORTANT — capability reporting. Attempt every step. If you cannot do one, do NOT skip it
silently and do NOT substitute an easier version. Record the step number, exactly what you
tried, and what stopped you, then carry on with the remaining steps. End your report with a
section headed "COULD NOT DO" listing one line per step you could not complete. If you
completed everything, write "COULD NOT DO: nothing".
```

---

## Pass 7 — Search, filter, sort, composition and URL state

```
You are QA-testing a task manager web app at http://localhost:3000. This is a fresh run —
assume nothing and report only what you observe.

Open the DevTools Network and Console panels before you start and KEEP THEM OPEN for the
whole pass. Report anything unexpected in either, with exact text.

Credentials:
  email:    dana@northbay.dev
  password: tally-demo-2026

Log in, then:

1. Report every control in the toolbar above the task list: what each is (text box,
   segmented buttons, dropdown, button), its label or placeholder, and for dropdowns, every
   option offered, quoted exactly.
2. Type a word into the search box that appears in a visible task title. Report: how many
   requests went to localhost:3001 while you typed (one per keystroke, or is it debounced?),
   the query string of the final request, how many rows show afterwards, the "Showing X–Y of
   Z" text, and whether any loading indicator appeared and WHERE.
3. Clear the search. Open a task's edit view, find a word that appears ONLY in its
   description/notes and NOT in its title, and close without saving. Search for that word.
   Report how many results, whether that task appears, and the query string. Then search the
   same word in ALL CAPITALS and report whether the results are the same.
4. Clear the search. Select each status filter option in turn. For each: the option label,
   the large count, the "Showing X–Y of Z" text, the number of pages, and whether every
   visible row's badge matches that filter.
5. Set the filter back to "all". Change the sort dropdown to each option in turn. For each:
   the option label, the query string sent, and the titles of the first three rows.
6. COMPOSE THREE AT ONCE: set the status filter to pending, type a search term matching
   several tasks, and set a sort option. Then go to page 2 if there is one. Report the exact
   query string sent, the totals shown, and whether every visible row satisfies ALL THREE
   constraints.
7. With all three still set, report the EXACT contents of the address bar — the full URL
   including any query string. Copy it, open it in a brand new tab, and report what that tab
   shows: are the search term, filter, sort and page still applied, or has it reset to
   defaults? Quote the URL and describe the state of every control in the new tab.
8. With filters still applied, press the browser Back button. Report whether it undoes the
   last filter change or leaves the page entirely.

Report what you SAW, not what you expected. Give the status code and response body for any
failing call.

IMPORTANT — capability reporting. Attempt every step. If you cannot do one, do NOT skip it
silently and do NOT substitute an easier version. Record the step number, exactly what you
tried, and what stopped you, then carry on with the remaining steps. End your report with a
section headed "COULD NOT DO" listing one line per step you could not complete. If you
completed everything, write "COULD NOT DO: nothing".
```

---

## Pass 8 — Task CRUD ⚠️ writes data, designed to end at 47/31/16

```
You are QA-testing a task manager web app at http://localhost:3000. This is a fresh run —
assume nothing and report only what you observe.

Open the DevTools Network and Console panels before you start and KEEP THEM OPEN for the
whole pass. Report anything unexpected in either, with exact text.

Credentials:
  email:    dana@northbay.dev
  password: tally-demo-2026

This pass creates ONE task and deletes it at the end. Work on that task only — do not
delete or edit any pre-existing task.

Log in, then:

1. Report the total task count before you change anything.
2. Start creating a new task. Report what opened (a drawer? a modal? where on screen?),
   every field with its label and placeholder, and the button labels. First submit it with
   the title EMPTY and report exactly what happens — inline error wording, and whether a
   request was sent at all.
3. Fill in the title "QA smoke task 9f2" and put "zarquon marker for qa" in the
   notes/description field. Submit. Report: whether the button showed a loading state, any
   toast (exact title, message, colour), whether the panel closed itself, the new total, and
   method/path/status of every request sent.
4. Press F5. Report whether "QA smoke task 9f2" is still listed and whether the total still
   matches step 3.
5. Edit it: change the title to "QA smoke task 9f2 edited". Report whether the fields were
   pre-filled with existing values when the editor opened, the toast text after saving, and
   whether the row updated. Press F5 and report whether the edited title persisted.
6. Mark it complete. Report exactly what changed visually about the row (title style? a
   number or marker? badge text — quote before and after), the toast text, and how the
   pending/completed totals moved. Press F5 and report whether it is still complete.
7. Mark the same task incomplete again. Report the same details. Press F5 and report whether
   it is still incomplete.
8. Delete it. Report whether a confirmation appeared and its exact wording and button
   labels, what cancelling does, then confirm and report the toast text and new total. Press
   F5 and report whether it is gone and what the total is.
9. State the final total and whether it matches step 1.

Report what you SAW, not what you expected. Give the status code and response body for any
failing call. If any operation appears to succeed in the UI but does NOT survive the F5, say
so explicitly and loudly — that is the most important thing this pass can find.

IMPORTANT — capability reporting. Attempt every step. If you cannot do one, do NOT skip it
silently and do NOT substitute an easier version. Record the step number, exactly what you
tried, and what stopped you, then carry on with the remaining steps. End your report with a
section headed "COULD NOT DO" listing one line per step you could not complete. If you
completed everything, write "COULD NOT DO: nothing".
```

---

## Pass 9 — Empty state, loading, toasts, list error

*If step 7 fails because you cannot control throttling, tell me — I'll stop the gateway container
instead, which is the more honest test anyway.*

```
You are QA-testing a task manager web app at http://localhost:3000. This is a fresh run —
assume nothing and report only what you observe.

Open the DevTools Network and Console panels before you start and KEEP THEM OPEN for the
whole pass. Report anything unexpected in either, with exact text.

Credentials:
  email:    dana@northbay.dev
  password: tally-demo-2026

Log in, then:

1. Search for a term matching nothing: "zzzqqqxnothing". Report EXACTLY what renders where
   the list was: any large decorative character or number, the heading, the body text, and
   every button with its exact label. Report the status code — was the empty result a
   success or an error?
2. Click each button that empty state offers, returning to the empty state between them, and
   report what each does to the search box, the filter and the list.
3. Set the status filter to completed AND search "zzzqqqxnothing" at once. Report whether
   the empty-state heading differs from step 1 — quote both.
4. Clear everything. Change pages a few times and report every loading indicator you can
   see: WHERE it appears (over the rows? in the toolbar? beside the search box?), what it
   looks like (spinner, skeleton placeholder rows, dimming of existing content), and whether
   existing rows stay on screen while the next page loads or the list goes blank.
5. Hard-refresh and describe what renders BEFORE the task list appears — be specific about
   what you saw first, second and third.
6. In the DevTools Network panel, set throttling to "Offline". With the app offline, click a
   task's completion checkbox. Report: the toast's exact title, message and colour, whether
   it auto-dismisses or persists, whether the row reverted, and what the failed request
   shows in the Network panel.
7. Still offline, reload the page entirely. Report what the task list area renders: any
   error state, its exact heading, its body text, and any button. Then set throttling back
   to Online, click that button, and report whether the list recovers.
8. Report whether you saw BOTH a success toast and a failure toast in this pass, and quote
   one of each.

Report what you SAW, not what you expected. Give the status code and response body for any
failing call.

IMPORTANT — capability reporting. Attempt every step. If you cannot do one, do NOT skip it
silently and do NOT substitute an easier version. Record the step number, exactly what you
tried, and what stopped you, then carry on with the remaining steps. End your report with a
section headed "COULD NOT DO" listing one line per step you could not complete. If you
completed everything, write "COULD NOT DO: nothing".
```

---

## Pass 10 — Responsive, fonts, colours

```
You are QA-testing a task manager web app at http://localhost:3000. This is a fresh run —
assume nothing and report only what you observe.

Open the DevTools Network and Console panels before you start and KEEP THEM OPEN for the
whole pass. Report anything unexpected in either, with exact text.

Credentials:
  email:    dana@northbay.dev
  password: tally-demo-2026

Log in, then:

1. Set the viewport to exactly 1280px wide. Report the layout: where the header sits and
   what is in it, how the toolbar controls are arranged (one row? several?), how a task row
   reads left to right, and where the pagination sits. Note anything that overflows, is cut
   off, or overlaps. State the width you actually achieved.
2. Set the viewport to exactly 768px. Report the same, and specifically what CHANGED from
   1280 — did any control move to its own line, did anything become hidden, did any text
   change?
3. Set the viewport to exactly 360px. Report the same again, then check specifically: is
   there any HORIZONTAL page scrolling? Is any text clipped or overlapping? Are all buttons
   reachable? Can you still read the task title, the status badge and the row actions?
4. Still at 360px, open the create-task panel. Report whether all fields and buttons are
   visible and reachable without horizontal scrolling.
5. Still at 360px, open the edit view and the delete confirmation. Report whether each fits.
6. Return to 1280px. Do NOT use DevTools for this step — run script in the page instead.
   Report the output of each of these, exactly:
     document.fonts.check('700 24px "Big Shoulders"')
     document.fonts.check('400 14px "Atkinson Hyperlegible"')
     [...document.fonts].map(f => f.family + ' ' + f.weight + ' ' + f.status)
   Then find the "Tally" wordmark element and a task title element, and for each report
   getComputedStyle(el).fontFamily exactly as returned.
7. State explicitly whether the two faces actually loaded, quoting the check() results and
   the font status values rather than judging them. If a fontFamily string lists fallbacks,
   say which name is FIRST in the list and whether that face reports as loaded.
8. Using getComputedStyle in the page, report backgroundColor and color for: the page header
   bar, the main action button in the toolbar, a pending task's status badge, and a
   completed task's status badge and its number/marker element. Give the values exactly as
   returned.
9. State whether a completed task row uses the SAME accent colour as an interactive control
   — quote both values and say whether they match.
10. Filter the Network panel to fonts. Report every font file loaded, its status code, and
    whether any font request failed.

Report what you SAW, not what you expected. State the viewport widths you actually achieved
if you could not set them exactly.

IMPORTANT — capability reporting. Attempt every step. If you cannot do one, do NOT skip it
silently and do NOT substitute an easier version. Record the step number, exactly what you
tried, and what stopped you, then carry on with the remaining steps. End your report with a
section headed "COULD NOT DO" listing one line per step you could not complete. If you
completed everything, write "COULD NOT DO: nothing".
```

---

## Pass 11 — StrictMode double-invoke (trap 1) — only after I start the dev server

*The container runs a production build where StrictMode does not double-invoke. Tell me when you
reach this and I'll stop the web container and start `next dev`; the prompt is the same either way.*

```
You are QA-testing a task manager web app. A development server is running — I will tell you
the exact URL, which may be http://localhost:3000 or another port. This is a fresh run —
assume nothing and report only what you observe.

Open the DevTools Network and Console panels, ENABLE "Preserve log", and KEEP THEM OPEN for
the whole pass. Report anything unexpected in either, with exact text.

Credentials:
  email:    dana@northbay.dev
  password: tally-demo-2026

1. Load the app logged out. List every request to localhost:3001 in order with status, and
   state how many /auth/refresh calls the page load produced.
2. Log in. List every request since step 1 and state how many /auth/refresh calls happened
   AFTER the login, with their statuses.
3. Hard-refresh. State the exact number of /auth/refresh calls this ONE reload produced, and
   whether you are still signed in.
4. Hard-refresh four more times in a row. After each, state whether you are still signed in
   and how many /auth/refresh calls that reload produced.
5. State explicitly whether you were EVER unexpectedly logged out or bounced to the login
   screen during those five reloads.
6. Report every console warning or error, with exact text.

The number in steps 3 and 4 is the whole point: more than one /auth/refresh per page load,
or any unexpected logout, is a defect. Report the counts, not a judgement.

IMPORTANT — capability reporting. Attempt every step. If you cannot do one, do NOT skip it
silently and do NOT substitute an easier version. Record the step number, exactly what you
tried, and what stopped you, then carry on with the remaining steps. End your report with a
section headed "COULD NOT DO" listing one line per step you could not complete. If you
completed everything, write "COULD NOT DO: nothing".
```

---

# Progress tracker

Updated as results come in. This is the done-vs-remaining view; the final report opens with it.

| # | Pass | Covers | Status | Defects |
|---|---|---|---|---|
| — | Backend (stages 1–7) | status codes, rotation, tenancy, query contract, pagination, idempotency, throttle, cache | ✅ done — 69 tests + curl | 0 open |
| — | Refresh replay path | 401 → refresh → replay | ✅ done — extension + terminal, 2026-08-16 | 0 |
| 1 | Boot / routing | `/`, `/dashboard` logged out, `/login`, `/signup`, 404 | ✅ done 2026-08-16 | 2 (D1, D2) |
| 2 | Login / logout / errors | 4 credential paths, sticky validation, logout, Back | ✅ done 2026-08-17 | D4 confirmed, D3 confirmed, D5, D6 |
| 2B | Rate-limit feedback | throttled login shows ONE message, not two | 🟡 **server half proven** — browser console 2026-08-17 shows 10×`401` then `429` on the 11th, exactly `authWrite.limit=10`. The **UI message count** was lost when the extension signed out | — |
| 3 | Signup / first-run empty | validation, 409, fresh account, empty state | ✅ done — bot actions + human 3R | D4 confirmed, D3 confirmed, D5 dismissed |
| 4 | Session + refresh count | F5, refresh count, cookie attributes ⚠️ open question | ⬜ not started | — |
| 4B | Throttled refresh recovery | 429 on boot must not look like a logout, and must not hang ⚠️ new code | ⬜ not started | — |
| 5 | Session failure / two tabs | dead cookie, stale-tab 404, cross-tab logout | ⬜ not started | — |
| 6 | List / pagination / size | 47 rows, all pages, 4 page sizes | ✅ **pass** — sitting 3, user | — |
| 7 | Controls / URL | search, filter, sort, compose, URL state | ✅ **pass** — sitting 3, user | — |
| 8 | CRUD | create, edit, complete, uncomplete, delete + F5 each | ✅ **pass** — sitting 2, user | — |
| 9 | States / toasts | empty, loading, both toast paths, list error | ✅ done — sitting 1A/1B/1C | D7, D8, D9 |
| 10 | Responsive / visual | 360/768/1280, fonts, palette | ✅ done — sitting 1D/1E | D3 confirmed fixed |
| 11 | StrictMode | trap 1, needs `next dev` | ⬜ blocked on me starting the dev server | — |

Status values: ⬜ not started · 🟡 partial (some steps in COULD NOT DO) · ✅ done · ❌ failed ·
🔵 user-only (bot couldn't, waiting on you).

## Defect register

| ID | Defect | Severity | Found | Fix |
|---|---|---|---|---|
| D1 | **No custom 404 page.** A mistyped URL gives the stock Next.js black page — no Tally branding, no navigation, no link back, `<title>` still "Tally". Verified: no `not-found.tsx`, `error.tsx` or `global-error.tsx` in `apps/web/src/app`. | Low | Pass 1 §6 | one file: `app/not-found.tsx` |
| D2 | **Signup sub-heading contradicts the form.** "Two fields and you're counting." sits above three fields (name, email, password) — `signup/page.tsx:67`. | Trivial | Pass 1 §5 | one word |
| ~~D3~~ | **FIXED and confirmed in a browser 2026-08-17** — toast now renders bottom-right. Was: **toasts render top-right; the design specifies bottom-right.** `providers.tsx:37` sets `position="top-right"`. `design/mockups/dashboard.html:783` states: *"Bottom-right, 380px, radius lg, shadow md, 8px apart, newest on top."* This is not pixel-matching — the design source made the decision and the code contradicts it. | Low | User, 2026-08-16 | one prop |
| D4 | **Form validation errors are sticky — correcting the input leaves it red.** No form resets its error on change. `login/page.tsx` and `signup/page.tsx` never call `.reset()` at all; `dashboard/page.tsx:100,106` resets only when the drawer *opens*. So after a failed submit the red field state and the Alert persist while the user fixes the value, clearing only on the next submit. `task-drawer.tsx` partially escapes this — its client-side blank-title check re-derives on each keystroke — but its *server* field errors are sticky too. Affects **all three forms**. | Medium | User, 2026-08-16 | clear on change per form |

| ~~D5~~ | ~~Toast lives 12s; six notification roots~~ — **DISMISSED**, both halves. See the dismissal table. | — | — | — |
| D7 | **Offline mutations are silently queued — no feedback of any kind.** The `QueryClient` (`providers.tsx:21`) sets no `mutations` defaults, so TanStack Query v5's default `networkMode: 'online'` **pauses** a mutation when the browser reports offline rather than failing it. Result: the click produces no toast, no error, no visible state change; the mutation sits paused; and on reconnect every queued mutation fires at once, emitting success toasts three at a time (`limit={3}`). The brief requires feedback that informs users "of actions or errors" and this path gives neither. One-line fix: `mutations: { networkMode: 'always' }`, which converts the pause into a real failure and lets the existing error toast fire. | Medium | Sitting 1C | one line, but it is a UX decision — see note |
| ~~D10~~ | **FIXED 2026-08-17.** A stale row left on screen after another tab deleted it: acting on it toasted **"That task no longer exists."** while the row stayed put, so the app contradicted itself and the only way out was a manual reload. Cause: `onError` only toasted — `invalidate()` ran solely in `onSuccess`. Fix: `useNotifyFailure` in `use-tasks.ts` now invalidates the task tree on a `404`, so the dead row disappears on the refetch. Narrowed to `404` deliberately — a `503` or dead network says nothing about whether the row still exists. | Medium | Sitting 4D, user | done, needs a two-tab re-check |
| D8 | **The row busy indicator only tracks the most recently started mutation.** `dashboard/page.tsx:234` derives `busy` from `completion.variables.task.id === task.id`, but one `useMutation` instance holds only the latest call's variables. Click several checkboxes in quick succession and only the last row shows its busy state while the earlier ones revert to idle mid-flight. Observed offline, where the window is wide, but reachable online with rapid clicks. | Low | Sitting 1C | track in-flight ids in a set |
| D9 | **No `Access-Control-Max-Age`, so every request pays a preflight.** `main.ts:55` sets `origin` and `credentials` but no `maxAge`, so the browser re-preflights each cross-origin call — every debounced search costs two round trips. Not a brief requirement; a visible inefficiency in the network panel. | Low | Sitting 1B | `maxAge` on `enableCors` |

### Sitting 1C's error path — confirmed with the gateway genuinely stopped, 2026-08-17

Offline mode (D7) can't fail a mutation, only pause it, so it can't prove the error toast or the list
error state — two of the brief's required feedback surfaces. Ran a `docker compose stop gateway`
extension pass instead, verified against source:

| Observed | Verdict |
|---|---|
| Toast on a failed completion: **"Couldn't update this task" / "We couldn't reach the server. Check your connection and try again."**, bottom-right, does not auto-dismiss, row visually unchanged | ✅ matches `use-tasks.ts:169` and `api-error.ts`'s `UNREACHABLE` constant exactly |
| Reload → redirected to `/login` with banner **"We couldn't restore your session." / "We couldn't reach the server…"**, no infinite spinner | ✅ **this is the `unavailable`-session fix working**, and under a real outage rather than a synthetic throttle — the harsher and more convincing test |
| No "Try again" button on the *login* screen after a reload | Expected — boot's refresh failed, so the app is on `/login`, not the list. The list error panel is a different surface |
| **The list error panel and its Try again button, observed by the user**: seen while paging with the backend unreachable, and **clicking Try again recovered the list** once the gateway was back | ✅ closes sitting 1C steps 11 and 12 — `TaskListError` renders and `list.refetch()` is wired correctly |

**Responsive: PASS** at 360 / 768 / 1280, confirmed by the user 2026-08-17, including the drawer and
modal at 360. That is the third of the brief's four frontend requirements closed.

**Fonts: PASS.** `document.fonts.check('700 24px "Big Shoulders"')` and
`document.fonts.check('400 14px "Atkinson Hyperlegible"')` both returned `true`, so `next/font`'s
self-hosting works and neither face falls back. *Precisely what that proves:* both faces are loaded
and available — it is one step short of the Elements panel's "Rendered Fonts", which would also rule
out a cascade problem preventing them being applied. Given `theme.ts` sets `fontFamily` from the
CSS variables and `layout.tsx` puts those variables on `<html>`, the remaining risk is small but was
not separately measured.

**Toast position: PASS**, bottom-right — **D3's fix confirmed in a browser.** All four of the
fixes made this session (D1, D2, D3, D6) are now verified rather than asserted.

**Still unanswered, minor:** whether the completed row's teal "Done" badge makes a finished task read
as clickable, given CLAUDE.md's rule that it must not. Not blocking.

**One `ERR_CONNECTION_REFUSED` burst was not reproducible** and is attributed to the gap between
`compose start gateway` returning and the container accepting connections — health polling took
several seconds. Gateway shows 0 restarts and exit 0 throughout. Not a defect; recorded so it is not
re-investigated.
| Console: zero messages despite two `503`s and a redirect | ✅ clean — no unhandled rejection, no framework warning |
| **Every failed request reported as HTTP `503`** | ❌ **not what the wire shows** — see below |

**The `503` reading is the extension's own artifact, not app behaviour.** With the gateway process
stopped, `curl -sv http://localhost:3001/health` returns **`Connection refused`, `http_code 000`** —
there is no server to answer with any status. `api-error.ts:39` is explicit that this case gets
`statusCode: 0` specifically *because* "the server being down is not a status code." The extension's
network recorder appears to relabel a connection failure as `503` rather than reporting no status at
all — worth remembering for future runs; **do not take a reported status code at face value when the
failure could be a connection error**, cross-check with a terminal probe when it matters.

**This closes the two remaining unverified items in the brief's toast requirement**: an error toast
now has real evidence, matching a success toast (sitting 1C, steps 8–9). Recommend re-running the
recovery half (gateway back up, click Try again / reload) as a short follow-up now that it is back —
that observation is still open.
| D6 | **An empty email is reported as "Enter a valid email address."** rather than a required-field message — on *both* forms. Pass 3R shows the other fields do have proper required copy ("Enter your name.", "Enter your password."), so email is the lone exception. | Trivial | Pass 2 §1, Pass 3R §1 | one validator message |

### Measured, not assumed — throttle recovery

`RATE_LIMITS.authWrite` is `{ ttl: 60_000, limit: 10 }` with no `blockDuration` (`throttle.ts:87`).
Measured from a terminal 2026-08-17: 12 rapid login attempts → `429` first appears at request **11**;
probing at +20s and +40s returned `429`; the bucket **cleared at exactly +60s**. Light probing does
not extend the window. A report of "still blocked after two minutes" reflects request *volume*
during the block, not a longer block. **Pass 2B must trip the limit, then stop requesting entirely
and wait 60s from the first request.**

### Investigated and dismissed — do not re-raise

| Observation | Why it is not a defect |
|---|---|
| `/auth/refresh` says "That session has expired" to a cold, cookie-less visitor | Never rendered — `restoreSession()` swallows it, and a genuine expiry surfaces the *original* request's error instead. The string is deliberately identical in four places (`jwt-auth.guard.ts:76`: "The one answer to every way a token can fail"). Changing it adds a fifth string and breaks that property for a message no user reads. |
| `/` → `/dashboard` → `/login` double hop, costing one extra RSC prefetch | Deliberate and documented at `app/page.tsx:7-12` — the root has no opinion, so "where do I go" is answered in one place instead of two. |
| Terms / Privacy are plain text, not links | No such pages exist; out of scope per PLAN.md. |
| No `?next=` redirect-back when `/dashboard` is requested logged out | Nil impact — `/dashboard` is the only protected route and is the default landing after login. |
| "47 open. Nothing lost." shown to a logged-out signup visitor | Decorative statement copy in `AuthShell`, not live data. |
| **No CORS preflight on `POST /auth/logout`** while `/auth/login` and `/tasks` both get one | Correct and expected. `auth-api.ts:61` posts `undefined`, so axios sets no `Content-Type` and the request is CORS-*simple* — no preflight is required. It is not an unguarded hole: stage 3.6 added `CookieOriginGuard` precisely because refresh and logout take their credential from the cookie, and a hostile origin is `401` with the session surviving. |
| **Login accepts a 5-character password** (`"short"` produced no `password` error) | Correct. `PASSWORD_MIN_LENGTH` is a *signup* rule. Enforcing a policy minimum at login would reject legitimate legacy passwords and leak the policy to an attacker; login's only job is whether the pair matches. |
| **Logout raises no toast while login does** | Asymmetric but defensible — the user is leaving, and the toast would land on a page they did not stay to read. Not specified either way in `design/`. |
| **D5a — toast "lives 12 seconds"** | **Wrong measurement.** A human with a stopwatch snippet in a plain tab measured **2.7s**, consistent with Mantine's 4000ms default less the paste delay. Pass 2's 11,999ms came from its own iframe-replay harness. |
| **D5b — "six `.mantine-Notifications-root` containers"** | **Mantine's normal DOM.** `@mantine/notifications@8.3.18` renders **one root Box per position** — verified in `esm/Notifications.mjs`, six `data-position` containers (`top-left/center/right`, `bottom-left/center/right`) from the `positions` array in `get-grouped-notifications.mjs`. One `<Notifications>` mount always yields six roots so an individual notification can override placement. Nothing is double-mounted. |
| **Reloading while offline shows the browser's "no connection" page** | Not a defect. There is no service worker, and no web app without one can render its own shell offline. A PWA is out of scope and not in the brief. |
| **Success toasts appearing "three by three" after reconnect** | Correct. `providers.tsx:37` sets `limit={3}`, so Mantine queues the rest and shows them in batches as each closes. The *cause* — a burst of queued mutations all resolving at once — is D7, not the toast limit. |
| **Errors "never clear"** | Narrower than that: they *do* refresh on submit. Pass 3R §3 shows a submit returning only a `password` error clearing the name and email states. D4 is specifically *no clearing on typing*. |

## Pass 3 salvage — 2026-08-17

The extension exhausted its **weekly** quota mid-pass and could not compact, so the written report
was lost. The *actions* had already run. Recovered from the databases and the visible tool trace:

**Confirmed by data, no report needed:**

| Evidence | What it proves |
|---|---|
| `qa-probe-1@northbay.dev` / "QA Probe" exists, created 09:44:05 | Signup completes end to end |
| It holds **1 refresh token**, issued at the same second | Signup returns a session — the user is signed straight in, not bounced to a login form |
| `qa-step2@northbay.dev` does **not** exist | Step 2's "type but do not submit" was honoured, so the sticky-validation observation was made against a real un-submitted form |
| The new account has **0 tasks**; the trace shows it opened the New task drawer and then looked for Cancel | The first-run empty state was reached and its button opens the create drawer |
| `dana@northbay.dev` has 7 refresh tokens, last at 09:46:41 | Step 11 succeeded — logged back in ~2.5 min after signup |
| Dana still has **47 tasks / 16 done** | No cross-account leakage and no data damage from the pass |

**Still unobserved — these are the reason the pass must be redone:** the sticky-validation behaviour
on the signup form, whether a `409` shows inline only or also a banner, the 9-character password
error text, the empty-state copy, and — the important one — **D5's toast lifetime and notification
root count**.

**On a redo, use `qa-probe-2@northbay.dev`.** `qa-probe-1` now exists and will answer `409`.

## Measured extension capabilities (from pass 1's COULD NOT DO)

**The extension cannot open or drive the Chrome DevTools UI at all.** It has its own network and
console recorders giving **method, URL and status** for every request plus all console output — but
no request/response **headers or bodies**, no Application panel, no Elements panel, no throttling.
It also cannot clear or edit HttpOnly cookies, and cannot screenshot a transition shorter than a
screenshot round-trip (~100 ms).

What that changes, decided rather than left to discover:

| Step | Was | Now |
|---|---|---|
| Pass 4 §3, §5 — cookie attributes and value change | bot | 🔵 **user-only** — Application panel is the only place |
| Pass 4 §7 — Cookie / Set-Cookie headers on refresh | bot | ✅ **already done by me** from the terminal; drop the step |
| Pass 5 §6 — edit refresh cookie to `garbage` | bot | 🔵 **user-only** |
| Pass 9 §6, §7 — offline throttling | bot | **I substitute**: `docker compose stop gateway` |
| Pass 10 §6, §7 — Rendered Fonts | bot via DevTools | **rewritten** to use `document.fonts.check()`, which is scriptable |
| Pass 10 §8 — computed colours | bot via Elements | **rewritten** to use `getComputedStyle`, which is scriptable |

Response **bodies** stay reachable: the bot re-issues the identical request from page context and
reads the body that way. It did this in pass 1 and the result matched my terminal capture.

**Brief-compliance gate.** Only four items decide whether stage 6 can close. Three of them are
unobserved, and they live in passes 9 and 10 — which is why those two matter more than the rest:

| Brief requirement | Where | Status |
|---|---|---|
| API behind reusable hooks / service functions | code-level | ✅ proven in stages 5–6 |
| Loading indicators | pass 9 | ⬜ unobserved |
| Toasts on action **and** error | pass 9 | ⬜ unobserved |
| Fully responsive | pass 10 | ⬜ unobserved |

---

# Reporting back

Paste each pass's output back to me as you go. The **COULD NOT DO** sections are what build your
manual list — I'll collect them, work out which are genuine tool limits versus a step I worded
badly, and hand you a short list with exact steps for the ones that really need a human.

I'll consolidate everything into one report, opening with **done vs remaining**:

- **Done** — every area closed, with what proved it
- **Remaining** — split into *blocked on you*, *blocked on me*, and *deliberately not tested*, each
  with the reason
- a table of **area · what was tested · PASS / FAIL / PARTIAL / NOT TESTED · confidence % ·
  evidence · who ran it**
- every **defect** with severity and reproduction steps
- what **could not be tested**, and why
- what is **user-only and still outstanding**
- any place where a claim in the code, PLAN.md or the README is **contradicted by behaviour**

Confidence is rated honestly: something observed once under conditions we did not control scores
lower than something observed under a condition we set deliberately. A test is not a pass because
it did not visibly fail.
