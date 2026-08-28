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
