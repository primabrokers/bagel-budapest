# Manual QA checklist

A pass over everything the automated gate (`npm run verify` + `npm run build`) can't see:
real rendering, real navigation, a real signed-in session, print output, and the public RSVP
portal. Run this after any change that touches routing, auth, the shell, print CSS, the service
worker, or a migration — and always before/after a deploy.

Do the whole pass at **390px width** (a locked-zoom phone is this app's primary target) and then
again at **desktop width** (≥1024px, sidebar layout). Where a step is phone-specific or
desktop-specific it says so; everything else applies to both.

## 1. Sign-up and provisioning

- [ ] Sign up with a brand-new email against a fresh browser profile (or incognito).
- [ ] First sign-in populates the full demo world (18 households, functions, vendors, budget,
      menus, tasks, ideas, seating, notes, invitations) — not a blank shell.
- [ ] A second account with **no** invite waiting for it lands on `NoAccessPage`, not the first
      family's data.
- [ ] Signing out and back in as the original account returns to the same event, not a re-seed.

## 2. Every nav page, at 390px AND desktop

For each: loads without a console error, no horizontal page scroll at 390px, the phone tab bar
(Home/Guests/Tasks/Budget/More) works, and the sidebar nav works at desktop width.

- [ ] `/` Dashboard — widgets render real data; Edit-layout reorder persists after a reload.
- [ ] `/guests` Guests — household groups, search/filter/sort, HouseholdSheet, GuestSheet,
      BulkBar multi-select, TagManager, CSV import wizard, CSV export.
- [ ] `/invitations` Invitations — TemplateDesigner block editor, SendSheet (copy link, WhatsApp
      link, email).
- [ ] `/rsvp-tracker` RSVP tracker — per-household timeline, reminder action.
- [ ] `/seating` Seating — Room/Table detail/Guest list/Unseated tabs; drag a table on desktop;
      select-then-place on phone; warnings panel shows the seeded keep-apart violation.
- [ ] `/vendors` Vendors — status board/list, VendorSheet (quotes, linked tasks, linked notes).
- [ ] `/budget` Budget — charts render, ExpenseSheet, PaymentSheet, due-soon/overdue/over-budget
      views.
- [ ] `/menu` Menu — per-function sections/items, CateringSummaryCard, allergen roster.
- [ ] `/tasks` Tasks — list/kanban/calendar/timeline tabs, TaskSheet, Generate milestones.
- [ ] `/ideas` Ideas — board columns (desktop) / status-filtered grid (phone), image upload,
      IdeaSheet.
- [ ] `/documents` Documents — folders, upload, signed-URL preview.
- [ ] `/run-sheet` Run sheet — time-ordered, audience filter.
- [ ] `/contacts` Contacts — households ∪ vendors ∪ custom contacts, tel:/wa.me/mailto actions.
- [ ] `/notes` Notes — pinned-first, tag filter, markdown checklist toggling live.
- [ ] `/notifications` Notifications — bell badge count, each of the 7 rule kinds has at least
      one real entry, marking read persists.
- [ ] `/settings` Settings — event identity, date + Hebrew date + override, venue, functions
      editor, palette pickers, monogram/logo upload, Family access (invite by email).

## 3. All 7 print routes

Open each from its normal in-app entry point (not by typing the URL), confirm the screen-only
toolbar's Print button opens the browser print dialog, and check the print preview: correct page
size, no clipped content, no app chrome (sidebar/tab bar/toolbar) in the preview.

- [ ] `/print/invitation/:householdId` — A5 card size.
- [ ] `/print/seating-plan/:planId` — A4 document, one section per table.
- [ ] `/print/caterer/:planId` — headcounts + dietary detail, not the family-facing table list.
- [ ] `/print/place-cards/:planId` — A4 card grid, 8-up with fold lines.
- [ ] `/print/table-cards/:planId` — A4 card grid.
- [ ] `/print/catering-summary/:functionId` — A4 document.
- [ ] `/print/run-sheet` — A4 document.

## 4. RSVP portal, incognito

In a fresh/incognito browser context (no shared session with the signed-in family account):

- [ ] A bad or made-up token shows a clear "not found" state, not a crash or blank page.
- [ ] A real household's token (copied from Invitations → SendSheet, or the RSVP tracker) opens
      the branded portal: event details, Hebrew date, venue, per-guest per-function RSVP chips,
      dietary fields, message-to-hosts.
- [ ] Submitting updates every field; the RSVP tracker and dashboard RSVP widget reflect it
      without a manual refresh once revisited.
- [ ] Re-opening the same link afterwards shows the submitted answers and allows editing
      (edit-later), not a fresh blank form.
- [ ] The portal works at 390px with the locked viewport.

## 5. Search, quick-add, notifications

- [ ] ⌘K / Ctrl+K opens the command palette from anywhere in the app, including from inside an
      open sheet; Escape and backdrop press both close it.
- [ ] Searching finds a guest, a vendor, a task, an idea, a note, a document and a contact by
      name; picking a result navigates to the right page.
- [ ] The FAB (phone) / quick-add (desktop) opens QuickAddSheet; each of guest, household,
      vendor, expense, task, idea and note opens its own real create sheet and the created row
      shows up in its list page.
- [ ] Document/Table/Menu item quick-add options navigate to the right page instead of a broken
      quick-create.

## 6. PWA install + offline

- [ ] Desktop Chrome/Edge offers "Install" for the app; installed window has no browser chrome
      and shows the plum/gold star icon.
- [ ] iPhone Safari → Share → "Add to Home Screen" installs with the same icon and app name; the
      installed icon isn't clipped (maskable safe-zone check).
- [ ] With the app already installed/visited once online, turn off networking and relaunch: the
      shell loads from cache rather than a browser offline error; navigating to an unvisited
      route while offline falls back to `/offline.html` rather than a blank tab.
- [ ] Zoom is locked (pinch-zoom does nothing) on the installed phone app.

## 7. Update banner across two deploys

- [ ] Load the app in a tab and leave it open.
- [ ] Ship a second deploy (any change, including a no-op one).
- [ ] Within the poll interval (or after bringing the tab back into focus), the tab shows the
      "update available" banner; choosing to update reloads onto the new build without losing
      the signed-in session.
- [ ] A tab that was closed and reopened after the second deploy loads the new build directly,
      no banner needed.
