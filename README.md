# HIG Biz Operation

Business operations for HIG. Mobile-first: the phone layout is the primary one,
tablet and desktop widen it rather than replacing it.

- **Framework** — Next.js (App Router) + TypeScript + Tailwind CSS v4
- **Backend** — Supabase (Postgres, Auth, Storage), with access rules in the database

## Getting started

```bash
npm install
cp .env.local.example .env.local   # fill in the two values
npm run dev
```

| Variable | Where to find it |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase dashboard → Project Settings → Data API |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | same page, the publishable (`sb_publishable_…`) key |

## How the app is put together

### Views

A **view** is a workspace — its own landing page and its own navigation set.
Views are separate from roles: one person may be entitled to several.

| Key | Name |
| --- | --- |
| `admin` | System Admin |
| `sales` | Sale |
| `accounting` | Accountant |
| `warehouse` | Warehouse & Logistic |

After signing in, `resolveEntryPath()` in `src/lib/access.ts` decides where the
user lands: no views → `/no-access`, exactly one → straight into it, more than one
→ `/select-view`. The chosen view is the first URL segment (`/sales/customers`),
so links are shareable and the navigation set is never ambiguous.

`src/app/(app)/[view]/layout.tsx` re-checks entitlement server-side on every
request — hiding a view from the switcher is presentation, that check is the
enforcement.

### Modules and navigation

Navigation is data, not code. `public.modules` holds the registry, and
`public.view_modules` says which modules appear in which view. The database
function `my_nav(view)` returns the entries the signed-in user may actually see,
already filtered by their `view` permission — so the sidebar, rail, bottom bar
and page titles cannot disagree with what the row-level policies allow.

Adding a module means one `modules` row, one `view_modules` row, and one page
file. Nothing in the shell needs editing.

### Access

Permission is granted per role, per module, per action (`view`/`add`/`edit`/
`delete`), at a scope (`own`/`sub`/`any`). A per-user override layers on top and
can both grant and revoke. See [`docs/access-model.md`](docs/access-model.md).

## Pages start blank

Every module page is deliberately empty:

```tsx
import { PageTitle } from "@/components/PageTitle";

export default function Page() {
  return <PageTitle />;
}
```

`PageTitle` takes no props — the heading comes from the URL and the module
registry. Screens get filled in one at a time, on purpose. Please keep new pages
blank until their content is actually specified.

## Database

Migrations live in `supabase/migrations/` and are the source of truth; they are
applied to the Supabase project in filename order. Never edit an applied
migration — add a new one.

```
0001_core_enums_and_org.sql   enums, departments, positions, roles, modules
0002_users.sql                the employee record, profile provisioning
0003_permissions.sql          role permissions and per-user overrides
0004_views.sql                views, their nav sets, and view assignment
0005_access_functions.sql     access resolution + the RPCs the frontend calls
0006_rls.sql                  row level security on every table
0007_seed.sql                 modules, views, roles, default permission matrix
0008_storage.sql              private avatars bucket
0009_bootstrap_super_admin    the first login (password placeholder, see file)
0010_grants.sql               explicit privileges for `authenticated`
0011_revoke_anon.sql          the anonymous role gets nothing
0012_revoke_public_execute    no function is callable just by being PUBLIC
0013_advisor_fixes.sql        database-linter findings
```

Run `get_advisors` (security and performance) after adding a migration. The only
finding left open is leaked-password protection, which is a project auth setting
rather than schema — enable it under Authentication → Policies in the dashboard.

## Tests

```bash
npm test          # Vitest, 47 tests
npm run test:watch
```

Vitest covers the logic that decides what a person sees: `usePageTitle` (the one
place page headings come from), `useScrollHidden` (the auto-hiding chrome),
`resolveEntryPath` (the 0/1/many rule every sign-in goes through), the
signed-in/signed-out redirects in `src/lib/supabase/middleware.ts`, and the
entitlement check in `src/app/(app)/[view]/layout.tsx`. It never touches the
network — the Supabase client is mocked.

### Access-model tests

The permission and RLS rules are tested in the database, because that is where
they run:

```bash
psql "$DATABASE_URL" -f supabase/tests/access_model.test.sql
```

85 assertions over `app.effective_scope`, `app.can`, `app.is_subordinate`,
`app.my_views`, `app.my_nav`, `app.my_permissions`, the CHECK constraints, the
grants, and row visibility under RLS. It builds its own fixtures — a two-level
report-to chain, overrides in both directions, a suspended super admin — and
rolls the whole transaction back, so a run leaves nothing behind.

**Success is reported as an error**, because the rollback is what forces it:

```
ERROR:  ACCESS MODEL OK - 85 assertions passed (rls: ran)
```

Any other message names the assertion that broke. Re-run it after every
migration.

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm test` | Vitest |
