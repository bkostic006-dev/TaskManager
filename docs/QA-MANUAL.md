# Tally — remaining QA, done by hand

Everything still outstanding, restructured for a human. The 11-pass split in
[QA-PLAN.md](QA-PLAN.md) existed only because the browser extension ran out of context mid-run; a
person has no such limit, so this merges them into **five sittings ordered by what gates the
project**. Sitting 1 is the only one that must happen.

Already done and **not** repeated here: backend (81 tests + curl), the refresh replay path, and
passes 1, 2 and 3. Open defects are D1, D2, D3, D4, D6 — listed in QA-PLAN.md.

---

## Conventions

**Docker isn't on PATH.** In PowerShell:

```powershell
$d = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
& $d compose ps
```

**Credentials:** `dana@northbay.dev` / `tally-demo-2026`. Baseline **47 tasks · 31 pending ·
16 completed**, page sizes 8/16/24/48.

**Clean profile** for anything touching sessions. DevTools open — you can use panels the bot could
not, which is most of why these are cheaper by hand.

**Rate limits:** login/signup **10/min**, task list **240/min**, everything else **120/min**, per IP.
Sittings 4 and 5 deliberately trip them; leave **60 seconds** after each before doing more auth work.

**Record as you go.** Anything that surprises you is worth a line even if it isn't on the list.

---

# Sitting 1 — the brief's gate ⚠️ do this one first

*Was passes 9 + 10. Covers three of the brief's four frontend requirements: loading indicators,
toasts, responsive. These are the only outstanding items that decide whether stage 6 can close —
everything in sittings 2–5 is quality, not compliance.* **~15 minutes.**

Log in as Dana.

### 1A — Empty state and the two variants

| # | Do | Record |
|---|---|---|
| 1 | Search `zzzqqqxnothing` | Large figure, heading, body text, every button label — verbatim |
| 2 | Click each button that state offers | What each does to the search box, filter and list |
| 3 | Search `zzzqqqxnothing` **and** set filter to Completed | Does the heading differ from step 1? Quote both |

The two empty states are different components on purpose — first-run says "Nothing on the list yet",
no-results should name the constraint that emptied the list. If they look identical, that's a defect.

### 1B — Loading indicators

| # | Do | Record |
|---|---|---|
| 4 | Clear filters. Change pages a few times | Where does a loading indicator appear — over the rows, in the toolbar, beside the search box? What does it look like? |
| 5 | Same, watching the rows | Do existing rows **stay on screen** while the next page loads, or does the list go blank? |
| 6 | Hard-refresh (Ctrl+Shift+R) | What renders first, second, third before the list appears? |
| 7 | Type slowly in the search box, watch the Network panel | One request per keystroke, or is it debounced? |

### 1C — Toasts, both directions

| # | Do | Record |
|---|---|---|
| 8 | Complete any task (click its checkbox) | Toast title + message, colour, corner, seconds until it closes |
| 9 | Uncomplete the same task | Same. Does the verb match the action? |
| 10 | DevTools → Network → throttling **Offline**. Click a checkbox | Toast title + message, colour, **does it auto-close or stay?**, does the row revert? |
| 11 | Still offline, reload the page | What the list area renders: heading, body, button label |
| 12 | Throttling back to **Online**, click that button | Does the list recover? |

If DevTools throttling is awkward, use the gateway instead — it's the more honest failure:

```powershell
& $d compose stop gateway     # then reload the app
& $d compose start gateway    # then click Try again
```

An error toast that auto-closes is a defect — the user needs time to read it. A success toast that
never closes is also a defect.

### 1D — Responsive

DevTools → Ctrl+Shift+M → Responsive → type each width exactly.

| # | Width | Record |
|---|---|---|
| 13 | **1280** | Toolbar arrangement, row layout, where pagination sits. Anything overflowing or overlapping |
| 14 | **768** | What *changed* from 1280 — anything move to its own line, become hidden, change text? |
| 15 | **360** | Same. Then specifically: **any horizontal page scroll?** Any clipped or overlapping text? Every button reachable? |
| 16 | **360** | Open New task, the edit drawer, and the delete confirmation. Does each fit without horizontal scrolling? |

Horizontal scrolling at 360 is the one hard fail in this section.

### 1E — Fonts and palette

Back at 1280. Console:

```js
document.fonts.check('700 24px "Big Shoulders"')
document.fonts.check('400 14px "Atkinson Hyperlegible"')
```

| # | Do | Record |
|---|---|---|
| 17 | Run both lines | Two true/false values |
| 18 | Elements → select the `Tally` wordmark → Computed → **Rendered Fonts** | The family name |
| 19 | Same for a task title | The family name |
| 20 | Compare a **completed** row's number/marker against the New task button | Are they the same colour? Quote both |

Expected: **Big Shoulders** for the wordmark, **Atkinson Hyperlegible** for body. A generic serif,
Arial or Segoe UI means `next/font` self-hosting failed. Step 20 matters because a completed task
must **not** render in the teal accent `#2F4C56` — a finished row shouldn't read as clickable.

---

# Sitting 2 — Task CRUD

*Was pass 8. **Writes data**, built net-zero: create one task, put it through everything, delete it,
end back at 47/31/16.* **~10 minutes.**

Work only on the task you create. If you abandon this halfway, reseed:
`& $d compose down -v; & $d compose up -d --build --wait`

| # | Do | Record |
|---|---|---|
| 1 | Note the total before touching anything | The number |
| 2 | Open New task, submit with the **title empty** | Error wording; was a request sent at all? |
| 3 | Title `QA smoke task 9f2`, notes `zarquon marker for qa`, save | Loading state on the button? Toast text? Did the panel close itself? New total? |
| 4 | **F5** | Is it still there? Total still right? |
| 5 | Edit it → title `QA smoke task 9f2 edited` | Were fields pre-filled? Toast text? Did the row update? |
| 6 | **F5** | Did the edit persist? |
| 7 | Mark it complete | What changed visually — title style, number/marker, badge text? Quote before and after. Toast? How did pending/completed totals move? |
| 8 | **F5** | Still complete? |
| 9 | Mark it incomplete | Same details |
| 10 | **F5** | Still incomplete? |
| 11 | Delete it | Was there a confirmation? Its wording and button labels. What does Cancel do? |
| 12 | Confirm the delete, then **F5** | Toast text, new total, is it gone? |
| 13 | Final total | Does it match step 1? |

**The F5 after every operation is the entire point.** Anything that looks changed but doesn't survive
a refresh is the most serious class of bug this whole effort can find.

---

# Sitting 3 — List, pagination, controls

*Was passes 6 + 7. Read-only.* **~15 minutes.**

### 3A — Pagination and page size

| # | Do | Record |
|---|---|---|
| 1 | Look at the loaded list | Large count, "Showing X–Y of Z", rows rendered, page numbers offered |
| 2 | Walk every page to the last | Per page: number, "Showing X–Y of Z", row count. On the last page, how many rows? |
| 3 | While walking | Do row numbers keep counting up across pages, or restart at 01? |
| 4 | Open the page-size selector | Which options exactly? |
| 5 | Select each in turn | Per option: rows, "Showing X–Y of Z", pages offered, and the query string in the Network panel |
| 6 | Smallest size → last page → switch to largest size | What page do you land on? **Any rows, or an empty page?** |

Totals must read 47 everywhere. A `400` from the gateway on any page-size change is a defect — it
rejects out-of-range rather than clamping, so the selector must only offer valid values.

### 3B — Search, filter, sort

| # | Do | Record |
|---|---|---|
| 7 | Search a word you can see in a title | Rows returned, "Showing X–Y of Z", query string |
| 8 | Open a task, find a word **only in its notes**, close without saving, search it | Does that task come back? |
| 9 | Search the same word in ALL CAPITALS | Same results? |
| 10 | Clear search. Try each status filter | Per option: totals, pages, does every visible badge match? |
| 11 | Filter back to All. Try each sort option | Per option: query string, first three row titles |

Expected filter totals: **All 47 · Pending 31 · Completed 16.**

### 3C — Composition and the URL

| # | Do | Record |
|---|---|---|
| 12 | Set filter Pending **+** a search term matching several **+** a sort. Go to page 2 if there is one | Query string, totals, does every row satisfy all three at once? |
| 13 | Look at the address bar | The **full URL**, verbatim |
| 14 | Copy that URL into a brand new tab | Are the search, filter, sort and page still applied, or reset to defaults? |
| 15 | Back button with filters applied | Does it undo the last filter change, or leave the page? |

**Steps 13–14 are expected to fail.** The dashboard holds all view state in `useState` and there is no
`useSearchParams` anywhere in `apps/web/src`, so filtered views are not shareable or deep-linkable.
Record it as evidence; **my recommendation is not to build it** — the brief never asks for URL state,
and touching that state machine right before submission is the wrong risk. It belongs in the README's
known-limitations section.

---

# Sitting 4 — Session, cookies, refresh, two tabs

*Was passes 4 + 5 + 2B. Resolves the last open question.* **~15 minutes.** Clean profile,
**cookies cleared for localhost**, DevTools Network open with **Preserve log ON**.

### 4A — The refresh count ⚠️ the open question

| # | Do | Record |
|---|---|---|
| 1 | Load `/login` with cookies cleared | Every request to `:3001` in order. **How many `/auth/refresh`?** |
| 2 | Log in, wait for the list | Same. **How many `/auth/refresh` AFTER the login request, and what status?** |
| 3 | F5 | Still signed in? **How many `/auth/refresh` for this one reload?** |
| 4 | Ctrl+Shift+R | Same two answers |

**The rule:** a `401` on `/auth/refresh` *before* any login is correct — it's how the app decides to
show `/login`. A `401` *after* a successful login is a real defect. **More than one refresh per page
load is a defect** either way: rotation is compare-and-swap, so the second is answered `401` by
design and logs the user out at random.

### 4B — Cookie attributes (only you can do this)

Application → Cookies → the `localhost` entry.

| # | Do | Record |
|---|---|---|
| 5 | Find `refresh_token` | Name, first 8 chars of Value, Domain, **Path**, Expires, **HttpOnly**, **Secure**, **SameSite** |
| 6 | F5, re-read the Value | Did the first 8 characters **change**? |

Expected: `Path=/auth`, `HttpOnly ✓`, `SameSite=Lax`, `Secure ✗` (correct — plain HTTP on localhost,
`COOKIE_SECURE` is explicitly false). Flag it only if HttpOnly is missing, Path isn't `/auth`, or
SameSite isn't Lax. Step 6 changing is rotation visible from the browser's own storage.

*Cookies ignore port, so this appears under `localhost:3000` even though `:3001` set it.*

### 4C — Dead cookie must log you out cleanly

DevTools can edit an HttpOnly cookie's **value** even though script can't read it.

| # | Do | Record |
|---|---|---|
| 7 | Application → Cookies → double-click `refresh_token`'s Value → replace with `garbage` → Enter | Did the edit stick? |
| 8 | **Don't reload.** Click a status filter | What happens? (Expected: works fine — the in-memory access token is still valid) |
| 9 | Now F5 | Ordered requests, status of each `/auth/refresh`, **where you end up**, how long any loading state showed |
| 10 | Log in again | Does it recover? |

**The failure to watch for is an infinite spinner.** You should land on `/login`. Not a spinner, not
a blank page, not a redirect loop.

### 4D — Two tabs

| # | Do | Record |
|---|---|---|
| 11 | Logged in, open a second tab to `/dashboard` | Does it show the list without a fresh login? How many `/auth/refresh` on its load? |
| 12 | Tab A: create `two-tab probe` | Does tab B show it without a refresh? After a manual refresh? |
| 13 | Tab A: delete it. Then **without refreshing tab B**, delete the same task from tab B | Status code, **exact toast text**, does the app stay usable? |
| 14 | Tab A: log out. Switch to tab B, click anything that makes a request | Does B recover, redirect to login, or error? |

### 4E — Throttled login shows ONE message

New code, never seen in a browser. Spend the bucket from a terminal so you only need one UI submit:

```powershell
1..10 | % { curl.exe -s -o NUL -X POST http://localhost:3001/auth/login -H "Content-Type: application/json" -H "Origin: http://localhost:3000" -d '{\"email\":\"x@y.dev\",\"password\":\"nope-nope-nope\"}' }
```

| # | Do | Record |
|---|---|---|
| 15 | Immediately submit the login form once, with any credentials | **How many messages appear?** Quote every one, and say whether each is an inline banner or a toast |

**Exactly one** message should appear, and it must **not** say "Check the form below." — nothing is
wrong with the form. Two messages, or a heading blaming the form, is the old bug back. The wording
should be *"Too many requests. Wait a moment and try again."* A raw `ThrottlerException: Too Many
Requests` anywhere is a defect.

### 4F — Throttled refresh must not look like a logout

Also new code. **Wait 60s after 4E**, then with the app loaded and logged in:

```powershell
1..130 | % { curl.exe -s -o NUL -X POST http://localhost:3001/auth/refresh }
```

| # | Do | Record |
|---|---|---|
| 16 | Reload the app | What renders? Quote any message |

Expected: the login page showing **"We couldn't restore your session."** with the gateway's sentence.
**Not** a blank login form (indistinguishable from an ordinary expiry), and **not** an infinite
spinner — the fix added a fourth session state, and getting it wrong hangs the app. The spinner is
the specific regression to watch for.

Wait 60s afterwards before any more auth work.

---

# Sitting 5 — StrictMode double-invoke (optional)

*Was pass 11. The container runs a production build where StrictMode doesn't double-invoke, so this
is the only way to test it.* **~5 minutes.** Skip if short on time — the coordinator has 7 passing
unit tests and a live 20-parallel-401 check behind it already.

```powershell
& $d compose stop web
corepack pnpm --filter @tally/web dev
```

Then in a clean profile at the dev server's URL, Network open, Preserve log ON:

| # | Do | Record |
|---|---|---|
| 1 | Load logged out | `/auth/refresh` count |
| 2 | Log in | Count **after** the login, and statuses |
| 3 | Hard-refresh **five times** | Count per reload; were you **ever** unexpectedly logged out? |
| 4 | Console | Every warning or error, verbatim |

More than one refresh per load, or any random logout, is trap 1 reappearing.

```powershell
& $d compose start web
```

---

# When you're done

Paste results back per sitting — terse is fine, exact quotes only where the tables ask. I'll fold
them into QA-PLAN.md's tracker and defect register, and produce the final consolidated report.

**Priority if you run out of time:** sitting 1 is the compliance gate and must happen. Sitting 2 is
the largest functional surface. Sittings 3–5 are quality and can be reported as "not tested, and why"
without harming the submission.
