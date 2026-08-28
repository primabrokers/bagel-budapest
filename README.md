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

This app is a static SPA (`npm run build` → `dist/`) deployed to Vercel. Two environment
variables, copied from `.env.example`, must be set on the Vercel project (values live in the
Supabase project's API settings — never commit real values into this repo):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

The app sits at the root of its own repository, so the Vercel project's **Root Directory** must
be left **blank**. It previously lived in a `barmitzvah-planner/` subfolder of the `CRM_NEW`
monorepo and needed Root Directory set to that path — if you are updating a Vercel project
created before the move, clear that setting or the build will not find `package.json`.

After a deploy, walk `docs/CHECKLIST.md` — it isn't covered by `npm run verify`.
