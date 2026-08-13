# Tally — chosen direction

**Personality:** *Tally — your day, counted out loud.* A quiet workbench with loud numbers. The app never raises its voice about styling; it raises its voice about **count**. How many are open, which one you're on, how many are left. Everything else is flat, cool, and out of the way.

**Why this reads as a real product:** the numeral system is load-bearing, not decorative. The same condensed digits appear as the row index, the open-task count, the pagination, and the empty-state figure. A reviewer sees one idea applied four times, which is what a point of view looks like.

---

## Palette — 6 named values

Light mode, committed. Cool slate-teal neutrals (not beige, not cream), one teal accent for anything interactive, one brass accent reserved strictly for lateness.

| Token | Hex | Role |
|---|---|---|
| `mist` | `#EEF1F1` | App background. Cool, low-chroma, slightly teal. Never pure grey. |
| `card` | `#FBFCFC` | Every surface: rows, panels, inputs, drawer. |
| `ink` | `#14262A` | Primary text, icons, checkbox strokes. 13.9:1 on `card`. |
| `slate` | `#596E72` | Secondary text, meta, placeholders. 5.0:1 on `card`. |
| `teal` | `#2F4C56` | Primary: filled buttons, focus rings, links, completed markers, active filter. White on teal = 9.0:1. |
| `brass` | `#8A6410` | Overdue only. Never used for anything that isn't late. 4.9:1 on `card`. |

Supporting tints (derived, not new colors): `teal-soft #E9EEEF`, `brass-soft #F6EFDC`, `edge #D6DCDD` (borders), `edge-strong #BDC7C8` (hover borders), `numeral #77898C` (the row index — 3.6:1 on `card`, AA at 24pt), `row-done #F4F7F7`.

## Type

Two families, Google Fonts.

**Big Shoulders Display** — display. Condensed, high-personality, and unmistakable at size. Used with restraint: **numerals, the wordmark, and page titles only. Never below 20px, never for body copy, never for a full sentence longer than four words.**

**Atkinson Hyperlegible** — body. Designed for legibility at small sizes with deliberately differentiated letterforms (1/l/I, 0/O), so it survives 13px dense rows and carries the accessibility floor honestly rather than decoratively.

| Role | Family | Weight | Size / line-height | Notes |
|---|---|---|---|---|
| Row numeral | Big Shoulders | 600 | 30 / 1 | `numeral #77898C`, `font-variant-numeric: tabular-nums` |
| Hero count | Big Shoulders | 700 | 44 / 1 | The "47" |
| Empty-state figure | Big Shoulders | 700 | 132 / 1 | `edge` colored, decorative but on-system |
| Page title | Big Shoulders | 600 | 30 / 1.1 | Tracking `0.01em` |
| Wordmark | Big Shoulders | 700 | 24 / 1 | Tracking `0.06em`, uppercase |
| Section label | Atkinson | 700 | 11 / 1.2 | Uppercase, tracking `0.12em`, `slate` |
| Row title | Atkinson | 400 | 14 / 1.35 | `ink` |
| Row title (done) | Atkinson | 400 | 14 / 1.35 | `slate`, `line-through` |
| Body / field text | Atkinson | 400 | 14 / 1.5 | |
| Meta, dates | Atkinson | 400 | 12.5 / 1.4 | `tabular-nums` |
| Label chip | Atkinson | 700 | 10.5 / 1 | Uppercase, tracking `0.08em` |
| Button | Atkinson | 700 | 13.5 / 1 | |

## Spacing, radius, shadow

**Spacing** (4px base): `xs 6` · `sm 10` · `md 16` · `lg 24` · `xl 36`. Row gap in lists is always `8px`; section gap is always `36px`. Row height is `48px` (compact, the shipped default); `60px` comfortable is the only alternative.

**Radius:** `sm 6` (chips, checkboxes) · `md 10` (default — rows, inputs, buttons) · `lg 14` (drawer, panels, toasts). Nothing is square; nothing is a pill except the status badge.

**Shadow:** `xs 0 1px 2px rgba(20,38,42,.06)` (resting rows) · `sm 0 2px 6px rgba(20,38,42,.09)` (row hover) · `md 0 10px 28px -8px rgba(20,38,42,.20)` (drawer, toasts). Three levels, no more.

**Motion:** `transition: box-shadow 120ms ease, border-color 120ms ease, background-color 120ms ease`. Nothing else animates.

## Signature element — the numeral spine

Every task row opens with a 44px gutter holding an oversized condensed numeral: its position in the list. Completed rows replace the numeral with a filled **ink** square carrying a check — deliberately not the accent, so a finished task never reads as a clickable one. The gutter is the spine of the whole layout — the toolbar count, the pagination controls, and both empty states use the same face at other sizes.

**Why it fits the constraints:** it's a font-size and a grid column. It needs no illustration, no canvas, no animation — a `Paper` with `display: grid` and one extra font family. It also does real work: it gives a reviewer an unambiguous "row 6 of 8" reference in a screenshare, and it gives completion a second, non-color channel (numeral → filled marker) before the text label even loads.

**The risk, stated:** 30px display type inside a 48px dense row is louder than a task list is supposed to be. It's spent deliberately — muted to `numeral #77898C` so scale carries the personality while value keeps the hierarchy, and it darkens to `ink` rather than to the accent on hover, and it is the *only* place the design is loud. Everything else is one text weight, flat surfaces, one accent.

## Five do / don'ts for anyone extending this

1. **Do** keep Big Shoulders to numerals, the wordmark, and page titles. **Don't** set a sentence, a field label, a button, or anything under 20px in it — it's condensed and it fails at small sizes.
2. **Do** reserve `brass` for lateness and nothing else. **Don't** use it for warnings, "in progress", or emphasis; a second meaning kills the first.
3. **Do** encode status in at least two channels — marker shape, text label, and strikethrough. **Don't** ship a state that is only a color change.
4. **Do** keep surfaces flat: `card` on `mist`, one border, one shadow level. **Don't** add gradients, tinted row stripes, or a third shadow.
5. **Do** name actions with the verb the user pressed, and keep that name through the toast and the error. **Don't** introduce a synonym — "Create task" never becomes "Task added".

---

## Dark variant (secondary)

Light stays the committed default — it is the mode the product ships in and the mode both mockups show. The dark variant exists so the numeral spine survives a system-preference switch without being redesigned. Same six roles, re-valued; nothing new is introduced.

| Light token | Dark token | Hex | Note |
|---|---|---|---|
| `mist` | `night` | `#0F1A1C` | App background. Still teal-tinted, still not black — banned default #2 is a near-black field with one acid accent, and this is not it. |
| `card` | `shelf` | `#162427` | Every surface. Lifted by value, not by shadow: shadows barely read on dark, so borders do the work. |
| `ink` | `chalk` | `#E8EDED` | Primary text. 13.1:1 on `shelf`. |
| `slate` | `pewter` | `#9FB0B2` | Secondary text. 6.4:1 on `shelf`. |
| `teal` | `teal-lit` | `#8FB3BC` | Links, active filter, completed marker, focus ring. 6.9:1 on `shelf`. Filled buttons use `#416575` with `chalk` labels (5.6:1) — the brand teal is too dark to sit on `night`. |
| `brass` | `brass-lit` | `#D6A93C` | Lateness only. 8.2:1 on `shelf`. |
| `numeral` | `numeral-dark` | `#6D8286` | Row index. 3.1:1 on `shelf` — clears AA large-text at 24pt, same job as light mode. |

Supporting: `edge #29393D` (borders), `edge-strong #3B4E53` (hover borders), `teal-soft #1B282C` and `brass-soft #2C2415` (chip and alert tints), `row-done #131F22` (completed rows recede instead of tinting up).

**Three rules for the dark variant.** Completed rows get *darker*, not lighter — recession reads as closed. Borders replace shadows: keep `shadow xs/sm` in the theme so hover still has a channel, but expect `border-color` to carry it. Never raise chroma to compensate for the dark field; `teal-lit` and `brass-lit` are lightened, not saturated, which is what keeps this out of the acid-accent cliche.

---

## Revision — accent moved from plum to teal

The first build ran on plum `#6B2D5C`. The accent is now **teal `#2F4C56`**, which puts it in the same hue family as the neutrals and makes the interface near-monochrome by choice. Brass is the only warm note left in the system.

Three things changed to pay for that:

1. **Hover is value, not hue.** The row numeral darkens `#77898C → ink #14262A` on hover. Teal against `#77898C` is almost invisible, so the old plum hover cue would have quietly died.
2. **The completed marker is `ink`, not the accent.** Everything interactive is teal now — buttons, active filter, chips, links. A teal completion marker would have read as "clickable", so completion is stated in the neutral: a fact, not an action.
3. **Rows are 48px (compact) by default.** Denser than the original 60px, which suits a near-monochrome list; the numeral drops 32 → 30px to sit correctly in it.

**What this costs, said plainly.** The palette no longer has two voices. Interactive elements separate from the page by value and shape rather than by hue, which asks more of spacing and weight discipline than the plum version did. If a future screen feels flat, the fix is contrast and whitespace — not a second accent.
