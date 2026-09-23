# Bar Mitzvah Planner

A premium web app for one family to plan and manage their son's Bar Mitzvah end-to-end: guests
and households, invitations and RSVP, a visual seating planner, vendors, budget, menus, tasks,
ideas, documents, a run sheet, contacts and notes. React 18 + TypeScript + Vite + Tailwind on
Supabase, deployed to Vercel as an installable, phone-first PWA.

This is a standalone repository with its own `package.json`, `tsconfig`, `vite.config.ts`,
`eslint.config.js` and build pipeline. It was originally developed as a subfolder of the
`CRM_NEW` monorepo and has since been moved out, so it no longer shares tooling, dependencies
or a build with the CRM or Prima Mail.

## Running it

```
npm install
npm run dev
```

## The gate

```
npm run verify
```

runs `typecheck && test && orphans && lint:baseline` and is what any change here must pass
before it's considered done. See `CLAUDE.md` in this folder for the house rules, and
the `CRM_NEW` repo's `docs/barmitzvah-planner-plan.md` for the full build plan.

## Deploying

Live at **https://barmitzvah-planner.vercel.app** — Vercel project `barmitzvah-planner` on the
`primabrokers-projects` team, linked to this repository with `master` as the production branch, so
every push to `master` deploys.

This app is a static SPA (`npm run build` → `dist/`) deployed to Vercel. It needs **no
environment variables**: `src/lib/supabaseConfig.ts` carries committed defaults for the Supabase
URL and anon key, so importing the repo and deploying is enough.

Those two values are safe to commit precisely because Vite inlines every `VITE_*` variable into
the browser bundle — anyone loading the deployed app can read them in DevTools either way. The
anon key is Supabase's publishable key and the security boundary is row-level security, which is
enabled with membership-scoped policies on every `bm_*` table. A service role key would be a
different matter entirely and must never go near this repo or any `VITE_*` variable.

To point a build at a different Supabase project, set `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` (see `.env.example`); they override the defaults.

The app sits at the root of its own repository, so the Vercel project's **Root Directory** must
be left **blank**. It previously lived in a `barmitzvah-planner/` subfolder of the `CRM_NEW`
monorepo and needed Root Directory set to that path — if you are updating a Vercel project
created before the move, clear that setting or the build will not find `package.json`.

After a deploy, walk `docs/CHECKLIST.md` — it isn't covered by `npm run verify`.
# Invoice import and vendor payments

In **Settings → API keys**, add a Mixedbread key (or set `MIXEDBREAD_API_KEY` as an Edge Function secret). Keys remain server-side in the existing Vault flow.

From **Vendors → Import invoice**, drop one PDF/JPG/PNG/WebP invoice up to 15 MB. The private source document is retained; Mixedbread's structured extraction job supplies an editable draft. Review supplier details, dates, items, payment terms, bank details and printed net/VAT/gross amounts. Missing fields stay blank. Only GBP invoices with reconciled net/VAT/total can be saved; credit notes need manual handling.

Select an existing supplier to preserve its contact record. Select an existing budget expense if the invoice replaces an estimate or already has deposits logged; otherwise create a new expense. Saving is atomic and retry-safe. Identical file contents and repeated invoice numbers for the same supplier are protected against duplicate imports. Recent imports can be reopened after navigation or interruption.

Open a vendor's **Invoices & payments** to log deposits, instalments and final payments with dates, methods and references. Only payments marked Paid reduce the balance. Printed paid amounts are kept as reference information and never automatically become payments. The existing Budget page uses the same ledger.

Deployment requires migration `20260923204903_bm_vendor_invoice_imports.sql` and the `bm_invoice_extract` and `bm_ai_keys` Edge Functions, with JWT verification enabled. Extraction validates the Auth user and uses caller-scoped RLS reads before any service-role write. Imports are limited to 100 attempts per event per month and three attempts per failed document. Temporary Mixedbread files are deleted after a terminal poll; the original remains in private planner storage. A missing key is an actionable configuration error, never a simulated extraction.
