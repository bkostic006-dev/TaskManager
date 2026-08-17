# QA session handoff — 2026-08-16

State of the browser QA effort at the end of this session. The working document with all pass
prompts, the live tracker and the full defect register is [QA-PLAN.md](QA-PLAN.md); this file is the
narrative a fresh session needs to pick the work up without re-deriving it.

---

## What this session did

1. **Built the QA plan.** Read `BRIEF.md`, `PLAN.md` and the whole of `apps/web/src` first, so the
   prompts reference real routes, real copy and real controls rather than assumptions.
2. **Verified the baseline live** before writing anything that asserts a number.
3. **Ran pass 1** (boot and unauthenticated routing) — 8 checks pass, 2 defects.
4. **Restructured the plan twice**, both times on the user's correction:
   - dropped the pre-written manual checklist in favour of making the bot report its own limits
   - moved all terminal work off the user's list and onto mine
5. **Investigated a user-run refresh experiment** and two user-found UI defects; confirmed all of
   them, and corrected two over-hedged conclusions in the experiment's report.
6. **Absorbed two frontend fixes** that landed after the plan was written, and found a rate-limit
   collision they would otherwise have caused.

---

## State of the app

| Thing | Value | Checked |
|---|---|---|
| Stack | 5/5 containers healthy | this session |
| Web / gateway | `localhost:3000` / `localhost:3001` | this session |
| Tests | **81 pass** — 27 web · 32 gateway · 12 auth · 10 task | this session, `pnpm -r test` |
| Seed | 47 tasks · 31 pending · 16 completed | this session, via the API |
| Pages at size 8 | 6 all · 4 pending · 2 completed | this session |
| Page sizes | 8 / 16 / 24 / 48 | `contracts/constants.ts:31` |
| Refresh cookie | `Path=/auth; HttpOnly; SameSite=Lax`, no `Secure` | this session, from `Set-Cookie` |
| Working tree | clean except untracked `docs/QA-PLAN.md`, `docs/QA-HANDOFF.md` | this session |

---

## Progress

**Done — 3 of 15**

| # | Title | Result |
|---|---|---|
| — | Backend, stages 1–7 | ✅ 69→81 tests + curl runs, recorded per stage in PLAN.md |
| — | Refresh replay path | ✅ extension wire-corruption run + terminal confirmation of rotation |
| 1 | Boot and unauthenticated routing | ✅ 8 checks pass, 2 fail (D1, D2) |

**Remaining — 11**

| # | Title | Note |
|---|---|---|
| 2 | Login, logout, auth errors | **next** — prompt is written and revised, never run |
| 2B | Rate-limit feedback on login | must start on a fresh bucket, 60s after pass 2 |
| 3 | Signup and the first-run empty state | |
| 4 | Session persistence, refresh count, cookie attributes | ⚠️ resolves the open question |
| 4B | Throttled refresh recovery | ⚠️ new code, watch for an infinite spinner |
| 5 | Session failure and two tabs | |
| 6 | List rendering, pagination, page size | + README API-table cross-check |
| 7 | Search, filter, sort, composition, URL state | |
| 8 | Task CRUD | writes data; built net-zero |
| 9 | Empty state, loading, toasts, list error | ⚠️ **brief gate** |
| 10 | Responsive, fonts, colours | ⚠️ **brief gate** |

**Blocked — 1**

| # | Title | Blocked on |
|---|---|---|
| 11 | StrictMode double-invoke | me — `docker compose stop web` then `corepack pnpm --filter @tally/web dev` |

---

## The gate that actually decides stage 6

The brief names four frontend requirements. Only one is proven. **Passes 9 and 10 carry three of
them**, which is why they outrank everything else remaining.

| Requirement | Where | Status |
|---|---|---|
| API behind reusable hooks / service functions | code-level | ✅ proven, stages 5–6 |
| Loading indicators | pass 9 | ⬜ unobserved |
| Toasts on action **and** error | pass 9 | ⬜ unobserved |
| Fully responsive | pass 10 | ⬜ unobserved |

If time runs short, run **9 and 10 before 2–8**. Everything else is quality; these three are
compliance.

---

## Defects — 4 open, none blocking

| ID | Defect | Severity | Source |
|---|---|---|---|
| D1 | No custom 404 page — stock Next.js black page, no branding, no way back | Low | Pass 1 |
| D2 | Signup sub-heading says "Two fields" above three fields | Trivial | Pass 1 |
| D3 | Toasts render top-right; design source specifies bottom-right | Low | User |
| D4 | Form validation errors are sticky — correcting an input leaves it red, on all three forms | Medium | User |

Full reproduction detail and fix scope in [QA-PLAN.md](QA-PLAN.md)'s defect register.

**D4 is the one worth fixing before submission.** It is the only defect a reviewer will hit by
accident: mistype a password, correct it, and the field is still red. D3 is one prop. D1 is one file.
D2 is one word.

---

## Findings investigated and dismissed — do not re-raise

Each of these looked like a defect and is not. Reasons are recorded in the plan's dismissal table so
a later pass does not spend time on them again:

- `/auth/refresh` saying *"That session has expired"* to a cold, cookie-less visitor — never
  rendered to a user, and the string is deliberately identical in four places.
- `/` → `/dashboard` → `/login` double hop — deliberate, documented at `app/page.tsx:7-12`.
- A refresh in the same wall second as the login returning a **byte-identical** access token — no
  `jti`, second-resolution `iat`/`exp`, so identical input signs identically.
- Terms/Privacy as plain text · no `?next=` redirect-back · "47 open" on signup.

---

## Measured tool capability — the constraint that shaped the plan

**The Claude Chrome extension cannot open or drive the DevTools UI at all.** No Network, Console,
Application or Elements panel, no throttling. Its own recorders give **method, URL and status** plus
console output — but no headers or bodies. It cannot clear or edit HttpOnly cookies, and cannot
screenshot a transition shorter than ~100 ms.

Workarounds adopted, all verified: re-issue a request from page context to read its body ·
`document.fonts.check()` for rendered fonts · `getComputedStyle` for colours · iframe replay plus
Resource Timing for sub-100ms transitions.

**Genuinely user-only:** cookie attributes, editing a cookie to force failure, network throttling.
For forced backend failure I stop the gateway container instead, which is the better test anyway.

---

## The open question — still open

`:3001/auth/refresh → 401`. **Pass 4 resolves it.** Partially de-risked: a pre-login 401 with no
cookie is confirmed correct and expected. What remains unmeasured is whether more than one refresh
fires per page load, and whether any 401 appears *after* a successful login.

---

## Hazards a fresh session must not walk into

1. **Rate-limit budget.** Login/signup 10/min, task list 240/min, everything else 120/min, tracked
   per IP — and behind Docker every request shares one bucket. Pass 2 spends 5 login attempts; the
   throttle test needs 11 more. **They must not run in the same minute**, which is why 2B and 4B are
   separate passes.
2. **Pass 8 writes data.** It is built net-zero (create → edit → complete → uncomplete → delete), but
   if it is interrupted the counts are wrong and every counting pass after it is invalid. Reseed with
   `docker compose down -v && up -d --build --wait`.
3. **Clean profile, always.** An earlier smoke test was polluted by an unrelated extension injecting
   console output. Pass 1 reported zero console messages, which is only meaningful because the
   profile was clean.
4. **Do not re-test the backend.** Status codes, rotation, tenancy, the query contract, pagination
   stability, completion idempotency, throttling and cache tenancy are all verified from a terminal.
   The value of this effort is entirely in what a human sees.

---

## Recommended next actions, in order

1. Run **pass 2** (prompt ready in QA-PLAN.md, revised to cover D4's sticky validation and D3's toast
   corner). Wait 60s, then **2B**.
2. Run **9 and 10** next rather than in numeric order — they carry the brief's gate.
3. Fix **D4** before submission; D1/D2/D3 are one-line fixes worth taking at the same time.
4. Decide **URL state**: the dashboard holds page/filter/sort in `useState` with no `useSearchParams`
   anywhere, so filtered views are not deep-linkable. **Recommendation: do not build it.** The brief
   never asks for it, and touching the state machine that `task-query.spec.ts` protects immediately
   before submission is the wrong risk. Record it as a README limitation instead.
5. At stage 8, cross-check the README's new API table against what the network recorder actually
   shows — a documentation error there outranks any UI nit.
