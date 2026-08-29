# Bar Mitzvah Planner

React 18 + TypeScript + Vite + Tailwind, on Supabase. Deployed to Vercel as a static SPA,
installed as a PWA on desktop and iPhone — phone width (390px) is a first-class target and
zoom is locked, so layouts have to work there without zooming out.

This is a **standalone repository** — its own `package.json`, `tsconfig`, `vite.config.ts`,
`eslint.config.js` and test/lint/orphan tooling, with nothing above it in the tree. It was
originally built as a subfolder of the `CRM_NEW` monorepo and has since been moved out; any doc
or comment still calling it a sibling project inside `CRM_NEW` is stale. One practical
consequence of the move: a dependency can no longer be satisfied by a parent's hoisted
`node_modules`, so everything this app imports must be declared in this `package.json`.

The canonical full build plan lives in the `CRM_NEW` repo at `docs/barmitzvah-planner-plan.md`
and was not carried over. This file is the distilled, load-bearing subset for day-to-day work.

## Commands

```
npm run dev           # Vite dev server
npm run verify         # typecheck + test + orphan check + lint ratchet — the gate for any change
npm run typecheck      # tsc --noEmit -p tsconfig.app.json — must pass at 0 errors
npm run test           # vitest run
npm run lint            # eslint . — full report
npm run lint:baseline  # the ratchet: fails only if you ADDED errors/warnings vs .lint-baseline.json
npm run orphans        # fails when a tested src/lib or src/data module has no consumer
npm run build          # vite build && stamp-sw.cjs
```

**Run `npm run verify` before calling any change done.** `npm run build` does *not* typecheck —
Vite transpiles without checking — so a build can go green with type errors.

Unlike the CRM root, this project's `.lint-baseline.json` is a **single scope**, seeded at
`{"errors": 0, "warnings": 0}`. Since this is a small, brand-new codebase, the expectation is
that it *stays* at or near zero — fix lint problems in your own new code rather than bumping the
baseline to hide them. Only bump it with a genuinely unavoidable violation, and say why in the
commit/PR.

### A tested module nothing renders is not done

`npm run orphans` fails when a `src/lib/**` or `src/data/**` module with a `.test.ts` beside it
is imported by nothing else. A module with no importer passes typecheck, tests, lint and the
build — this is the one check that catches it. Wire up what you write in the same change, or if
it's genuinely consumer-free infrastructure, add it to `ALLOWED` in
`scripts/orphan-check.cjs` **with a reason**. An entry with no reason is an unwired feature, not
an exemption.

## Data — the shared Supabase project

This app's backend lives in the Supabase project `qdofumucgrggpehrxvdr` (org "Prima Insurance
Brokers"). **That project is shared with unrelated legacy data** — `sedarim`, `masechtos`,
`perakim`, `mishnayos`, `campaigns`, `luach_*` and related tables — which must **never** be
modified, queried destructively, or dropped by anything in this app.

To keep the two worlds apart:

- **Every new table, storage bucket, RPC and Edge Function this app creates must be prefixed
  `bm_`** (e.g. `bm_guests`, `bm_events`, `bm_rsvp_links`, storage bucket `bm-documents`,
  function `bm_rsvp_get`). Never touch or rename the legacy unprefixed tables.
- Before writing a migration, check what already exists (list tables) so a new `bm_` name
  can't collide with something already there.
- Migrations live in `supabase/migrations/`, named `YYYYMMDDHHMMSS_description.sql`, and must be
  **both** applied via the Supabase MCP **and** committed to the repo — a migration applied only
  remotely, or committed but never run, are both half-done.

### API keys live in the Vault, never in a table or the bundle

Provider keys (`ANTHROPIC_API_KEY`, `HF_TOKEN`, `OPENAI_API_KEY`, `XAI_API_KEY`, `RESEND_API_KEY`)
can be set two ways: as Edge Function environment secrets, or by a family member in
**Settings → API keys**, which stores them in **Supabase Vault** under a `bm_ai_`-prefixed name.
`_shared/secrets.ts` in each function resolves environment first, Vault second, so a dashboard
secret always beats one typed into the app.

The rules that make that safe, none of which are optional:

- `anon` and `authenticated` have **no USAGE on the `vault` schema**. That, not any application
  code, is the boundary. Never grant it.
- `bm_ai_secret_get` / `_set` / `_clear` are SECURITY DEFINER wrappers in `public` (they have to
  be — PostgREST exposes only `public`), with EXECUTE **revoked from public/anon/authenticated and
  granted to `service_role` alone**, a pinned `search_path`, and a hard whitelist of secret names.
  The whitelist is what keeps this app away from any secret belonging to the legacy app sharing
  this project. Adding a key means adding it to `bm_ai_secret_allowed()` *and* to
  `bm_ai_keys/_shared/keyCatalogue.ts`.
- **There is no way to read a key back to the browser, and there must never be one.** The
  `bm_ai_keys` function has no `get` action; `list` returns `last4` only. `bm_ai_key_status` is a
  metadata mirror holding no secret material.
- Never put a key in a `VITE_*` variable — Vite inlines those into the public bundle.

## Conventions

- **UK English, GBP.** Dates and money are British, always.
- **Phone-first at 390px, zoom locked.** Every screen must work at that width without
  horizontal scroll or the user zooming out — verify at 390px, not just at desktop width.
- **Dates**: once `src/lib/format.ts` exists (Stage 2+), all date/time formatting goes through
  it (`formatDate` / `formatDateTime` / `formatTime`) — never a locale-less
  `toLocaleDateString()` / `toLocaleTimeString()`, which is ambiguous (06/10 vs 10/06) with
  nothing on screen to say which. The lint config already bans this even before the helper
  exists — pass an explicit `'en-GB'` in the meantime.
- **Money**: once a money-parsing helper exists (Stage 2+, mirroring the CRM's
  `parseMoneyInput`), reading a money field goes through it — never a hand-rolled `Number()` /
  `parseFloat()`, which silently truncates or misparses input a family typed by hand.
- **Decisions vs status**: once `confirmDialog()` / `showToast()` exist (Stage 2+), use them —
  never `window.confirm` / `window.alert` / `window.prompt`, which block the main thread and
  paint browser chrome over an installed PWA. The lint config already bans these.
- **Focus rings**: `focus-visible:`, never a bare `focus:` — a bare ring flashes on every mouse
  click as well as keyboard focus. Enforced by the lint config's `no-restricted-syntax` bans.
- **Grids**: never an unprefixed `grid-cols-3` or wider — start at `grid-cols-1` (or `-2`) and
  widen at a breakpoint. Enforced by the lint config.
- **`cn()`** from `src/lib/cn.ts` (`clsx` + `tailwind-merge`) for conditional/merged
  classNames, matching the CRM's own pattern.

## Dependencies this project deliberately avoids

No `date-fns` (format on `Intl` with an explicit `en-GB` instead), no `papaparse`, no
`dnd-kit` (the seating planner is hand-rolled SVG + pointer events), no `jsPDF`, no chart
library, no rich-text editor library. Keep the dependency list small — check the plan document
before adding anything not already named there.
