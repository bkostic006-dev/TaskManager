# Tally — components translation key

Every designed element and the Mantine component that builds it. Theme object is `tokens.ts`; all tokens referenced below (`teal`, `brass`, `edge`, `ink`, `slate`, `mist`, `card`) come from `theme.other.tally`.

## Shell

| Designed element | Mantine component | Customization note |
|---|---|---|
| Page shell | `AppShell` (header 64, no navbar) | `bg` = `mist`; header `bg` = `card`, `borderBottom: 1px solid edge` |
| Wordmark "TALLY" | `Text` | `ff` display, 24px/700, uppercase, tracking `0.06em`, `c` = `ink` |
| Log out | `Button` | `variant="default"`, height 30, label **"Log out"**. Returns to login; task data persists across the round trip. There is no header nav — Archive and Settings are out of scope, so the header carries the wordmark, log out, workspace name and avatar only |
| Avatar / account menu | `Menu` + `Avatar` | `Avatar` radius `md` (not circular), `color="teal"`, `variant="light"` |
| Page title "Tasks" | `Title order={1}` | Display 30px/600 from `theme.headings` — no override needed |
| Hero count "47 tasks" | `Group` + `Text` ×2 | Numeral: `ff` display, 44px/700, `tabular-nums`, `c` = `ink`. Word: 12.5px `slate`, uppercase, tracking `0.12em` |
| Gallery section label | `Text` | 11px/700 uppercase, tracking `0.12em`, `c` = `slate`, preceded by a display-face index (`01`, `02` …) in `teal` |

## Toolbar

| Designed element | Mantine component | Customization note |
|---|---|---|
| Toolbar container | `Paper` | radius `md`, `withBorder`, shadow `xs`, padding `md`; inner `Group` with `gap="sm"`, `wrap="nowrap"` |
| Search field | `TextInput` | `leftSection={<IconSearch size={15} />}`, `w={280}`, placeholder "Search tasks" — active state shows the query as value with a `CloseButton` in `rightSection` |
| Status filter (all / pending / completed) | `SegmentedControl` | `data` = All / Pending / Completed, `color="teal"`, `bg` = `mist`, `border: 1px solid edge`. Selected indicator is filled `teal` with `card` text |
| Sort control | `Select` | `w={168}`, `data` = Due date / Recently added / A–Z / Status; `leftSection={<IconArrowsSort />}`, `allowDeselect={false}` |
| "New task" action | `Button` | `variant="filled"` `color="teal"`, `leftSection={<IconPlus size={15} />}`, label **"New task"** |
| Label chips ("API", "a11y") | `Badge` | `variant="light" color="teal"` radius `sm` (square-ish, distinct from the pill status badge), 10.5px/700 uppercase |

## Task list

| Designed element | Mantine component | Customization note |
|---|---|---|
| List container | `Stack gap={8}` | Rows are individual surfaces, never a bordered table |
| **Task row** | `Paper` with custom class `.tally-row` | radius `md`, shadow `xs`, `withBorder`; **hover raises shadow to `sm` and `border-color` to `edgeStrong`**; `display: grid`, `grid-template-columns: 44px 22px 1fr auto 78px 118px 30px`, `gap: 14px`, `min-height: 48px` (compact default; 60px comfortable), `align-items: center` |
| **Numeral spine (signature)** | `Text` inside the row's first grid cell | `ff` display, 30px/600, `tabular-nums`, `c` = `numeral #77898C` (`ink.6`), `text-align: right`. On row hover → `c` = `ink.9` (CSS only) — value, not hue: teal is too close to the neutrals to register |
| Completed marker | `Box` + `IconCheck` | Replaces the numeral: 28×28, radius `sm`, `bg` = **`ink`** (not the accent — a finished task must not read as clickable), `IconCheck` 17px in `card`. Shape change carries status without color |
| Completion toggle | `Checkbox` | `color="teal"` radius `sm`, `aria-label="Mark “{title}” complete"` |
| Row title | `Text` | 14px/400 `ink`; completed → `c` = `slate` + `td="line-through"` |
| Row meta line | `Text` | 12.5px `slate`, `tabular-nums` — "Added Aug 6 · 2 subtasks" |
| Status label | `Badge` | Pending: `variant="light" color="ink"`; Done: `variant="light" color="teal"`. Text always present — "Pending" / "Done" |
| Due date | `Text` | 12.5px `tabular-nums`, `c` = `slate` |
| Overdue date | `Group` + `Text` + `Badge` | `c` = `brass.6`, `fw` 700, plus a `Badge variant="light" color="brass"` reading "Overdue" |
| Completed row surface | same `Paper` + `.tally-row--done` | `bg` = `rowDone`, shadow none, border `edge` |
| Row actions (edit / delete) | `ActionIcon.Group` or `Menu` + `ActionIcon` | `variant="subtle" color="ink"`; visible on hover **and** on `:focus-within` so keyboard users reach them |

## Pagination

| Designed element | Mantine component | Customization note |
|---|---|---|
| Range readout | `Text` | "Showing 1–8 of 47" — 12.5px `slate`, `tabular-nums` |
| Page controls | `Pagination` | `total={6}`, `color="teal"`; controls use the **display face at 18px** (theme override) so paging joins the numeral system |
| Page-size select | `Select` | `w={132}`, `data` = 8 / 16 / 24 / 48 per page, label rendered inline as `Text` "Rows" |

## Create / edit surface

| Designed element | Mantine component | Customization note |
|---|---|---|
| **Edit surface** | `Drawer` (right, 420px) | Chosen over `Modal` so the list stays visible while editing — see the justification comment in `mockups/dashboard.html` |
| Drawer title | `Drawer.Title` | Display 24px/600, prefixed with the row's numeral (`07`) in `edgeStrong` when editing |
| Title field | `TextInput` | `label="Task title"`, `withAsterisk`, autofocus |
| Title field error | `TextInput error` | "This task needs a title. Add a few words so you can find it later." — `error` slot 12.5px `red`-free: uses `brass.8` for AA on `card` |
| Notes field | `Textarea` | `autosize minRows={3} maxRows={8}`, `label="Notes"` |
| Due date | `DateInput` (@mantine/dates) | radius `md`, `valueFormat="MMM D, YYYY"`, `label="Due date"` |
| Status | `SegmentedControl` | Pending / Completed — same control as the toolbar filter, deliberately |
| Labels | `MultiSelect` | `data` = API / a11y / infra / docs / billing; chips inherit the `Badge` light-teal treatment |
| Footer | `Group` in `Drawer` footer | Primary `Button` **"Save task"**, `variant="subtle"` `Button` "Cancel", and on edit a right-aligned `Button variant="subtle" color="brass"` "Delete task" |

## States

| Designed element | Mantine component | Customization note |
|---|---|---|
| Loading rows | `Skeleton` inside the same `.tally-row` `Paper` | 3 bars per row: `h={13} w="46%"`, `h={10} w="28%"`, `h={10} w={72}`; numeral cell gets `Skeleton circle={false} h={26} w={30} radius="sm"`. Row geometry is identical to the loaded row so nothing shifts |
| Empty — no tasks yet | `Paper` + `Stack align="center"` | Figure: display face `132px/700` "01" in `edge`. Title `Title order={3}` "Nothing on the list yet". Body `Text` `slate`. `Button` "Create task" |
| Empty — no results | `Paper` + `Stack align="center"` | Figure: display "00". Title quotes the query. Actions: `Button variant="default"` "Clear search" + `Button variant="subtle"` "Show all tasks" |
| Success toast | `notifications.show()` → `Notification` | `icon={<IconCheck />}` `color="teal"`, title **"Task created"** (matches the "Create task" button), radius `lg`, shadow `md` |
| Error toast | `notifications.show()` → `Notification` | `icon={<IconAlertTriangle />}` `color="brass"`, `autoClose={false}`, title "Couldn't save this task", description states cause + the retry verb, plus an inline `Button variant="subtle"` "Save task" |
| Focus ring | theme `focusRing: 'auto'` | `outline: 2px solid teal; outline-offset: 2px` — never removed, including on rows and icon buttons |

## Login / signup

| Designed element | Mantine component | Customization note |
|---|---|---|
| Split layout | `SimpleGrid cols={2}` (`{ base: 1 }` at `sm`) | Left brand panel `bg` = `teal`; right form column `bg` = `mist` |
| Brand panel numeral column | `Box` with custom class | Display face 60px/700 `01 02 03 …` at 22% white opacity, `aria-hidden` — decorative use of the signature |
| Form card | `Paper` | radius `lg`, shadow `md`, `w={392}`, padding `xl` |
| Email / password | `TextInput` / `PasswordInput` | `PasswordInput` visibility toggle uses `ActionIcon variant="subtle"` |
| Stay signed in | `Checkbox` | radius `sm`, 13px label |
| Submit | `Button fullWidth` | Label **"Log in"** (signup variant: **"Create account"**) |
| Form-level error | `Alert` | `variant="light" color="brass"`, radius `md`, `icon={<IconAlertTriangle />}` |
| Footer switch | `Text` + `Anchor` | "New here? **Create an account**" |

## Prototype notes

`Tally Prototype.dc.html` is the clickable version of these states — login, signup and the dashboard as three screens in one file.

| Thing | Behaviour |
|---|---|
| Demo credentials | **dana@northbay.dev** / **tally-demo-2026**, prefilled. Anything else shows the login error state (form-level `Alert`, brass) |
| Entry screen | Login, always. Signup is reachable from the footer switch and back again |
| After log in | Dashboard, plus a welcome toast — title "Welcome back, Dana", body counts pending and overdue |
| Log out | Header button, returns to login. Task edits persist, so clicking around costs a reviewer nothing |
| Offline switch | Header toggle that makes the next **Save task** fail, so the error toast is reachable on demand. Prototype-only — not a product feature |
| Not in the prototype | The numeral's hover colour change (a parent-hover-child rule the prototype's inline styling can't express). It is specified here and shown in `mockups/dashboard.html` |
