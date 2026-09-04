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

## Theme and brand

Colours come from the logo and live as CSS custom properties in
`src/app/globals.css` — one light block, and the dark values in two places (an
explicit `[data-theme="dark"]`, and a `prefers-color-scheme` block for anyone who
has not chosen). **Keep those two dark blocks in step.** `light-dark()` would say
it once, but needs Chrome 123+/Safari 17.5+ and this has to run on whatever
phones the team already carry.

| Token | Light | Dark |
| --- | --- | --- |
| `--brand` | `#1975bf` | `#35aeea` |
| `--brand-fg` | `#ffffff` | `#06121c` |
| `--accent` | `#3ab54a` | `#4ecb5e` |

Two things that are easy to get wrong:

- **Never hardcode `text-white` on `bg-brand`.** Use `text-brand-fg`. The
  dark-mode blue is bright enough that white on it fails contrast; the token is
  dark there for that reason.
- The light-mode blue is slightly deeper than the logo's own blue. At the logo
  value, white-on-blue and blue-on-white both land near 4.2:1, short of the
  4.5:1 that button labels and active nav text need. The logo artwork keeps its
  true colours; this is only the interface accent.

Every foreground/background pair clears WCAG AA. If you change a token, re-check
it before shipping.

### Appearance switcher

Light / Dark / Auto sits in the profile dropdown as a segmented control, and as
a single cycling button in the top right of login and the view chooser — those
two screens have no title bar, so without it there would be no way to change the
theme until after signing in. Both read and write the same store, so they cannot
disagree. Auto is the default and follows the operating system, including while
the app is open. The choice is kept in
`localStorage` and re-applied by a small blocking script in `<head>`
(`src/components/ThemeScript.tsx`) so a dark-mode user never sees a white flash.
That script restates what `applyTheme()` does because nothing is imported that
early; the values it needs are interpolated from `src/lib/theme.ts` so the two
cannot drift.

### The logo

`public/logo-light.png` and `public/logo-dark.png` are the only two files the
app reads. **Overwrite those two paths** and everything follows — the login
screen, the view chooser, the title bar on every page. No code change, and any
aspect ratio works: callers fix the height and the width follows.

```bash
npm run icons   # regenerates the home-screen and tab icons from logo-light.png
```

Until the real artwork lands, both files hold a placeholder "HIG" wordmark.
It is deliberately a wordmark rather than an approximation of the mark, so it
never reads as a bad copy of the real thing.

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
0014_permission_scope_deny    `deny` as a storable scope
0015_deny_as_scope.sql        the matrix reads a stored deny
0016_employees_without_logins an employee record without an auth login
0017_can_edit_user.sql        the scoped "may I edit this person" question
0018_printers.sql             e-print addresses, and the one default
0019_user_status_changes.sql  suspension and discharge, stamped
0020_can_delete_user.sql      the scoped "may I remove this person" question
0021_self_edit_guard.sql      your own row: nickname, photo, second number only
0022_inventory.sql            the catalogue — categories, brands, items, prices
0023_lock_down_trigger_fns    trigger functions are not RPCs (see the file)
0024_category_bilingual_name  a category is named in English and Khmer
0025_customers.sql            shops, their contacts, pictures and address
0026_variant_code_and_barcode the variant becomes the sellable unit
0027_order_catalogue_codes    a stable order for the collected codes
0028_item_code_and_price      code and prices belong to the item, not the variant
0029_item_pictures            an item's own gallery
0030_audit_log.sql            who changed what, and when
0031_customer_soft_delete     a customer is retired rather than removed
0032_credit_limit_permission  a $500 default, and its own permission
0033_module_groups.sql        a module says which heading it sits under
0034_my_modules.sql           everything one person can reach, wherever it is filed
0035_telegram_check_ins       attendance punches, from the Telegram mini app
```

Run `get_advisors` (security and performance) after adding a migration. The only
finding left open is leaked-password protection, which is a project auth setting
rather than schema — enable it under Authentication → Policies in the dashboard.

## The Telegram check-in app

`telegram-checkin/` is a second Next.js project in this repository: a Telegram
Mini App where staff check in and out with their location and a photo. It shares
this Supabase project, these employee records and these access rules — the
migrations above are the source of truth for both apps.

It has its own `package.json` and its own deployment. See
[`telegram-checkin/README.md`](telegram-checkin/README.md) for the bot setup,
the two extra environment variables (both secrets, unlike this app's two), and
how the Telegram launch becomes a real Supabase session.

`check_in` is the second permission-only module, after `customer_credit`: a
`modules` row with no `view_modules` row, so it can be granted and checked
before any screen in this app reads it. There is no check-in screen here yet.

## Tests

```bash
npm test          # Vitest, 437 tests
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

147 assertions over `app.effective_scope`, `app.can`, `app.is_subordinate`,
`app.my_views`, `app.my_nav`, `app.my_permissions`, the CHECK constraints, the
grants, and row visibility under RLS. It builds its own fixtures — a two-level
report-to chain, overrides in both directions, a suspended super admin — and
rolls the whole transaction back, so a run leaves nothing behind.

**Success is reported as an error**, because the rollback is what forces it:

```
ERROR:  ACCESS MODEL OK - 147 assertions passed (rls: ran)
```

Any other message names the assertion that broke. Re-run it after every
migration.

### Catalogue tests

The inventory module has its own suite, in the same shape and for the same
reason — it needs its own fixtures, and mixing them in would make both harder to
read:

```bash
psql "$DATABASE_URL" -f supabase/tests/inventory.test.sql
```

71 assertions over the one-level category rule, the sibling-name indexes, the
variant constraints, the `item_catalogue` view, and who may read, create, change
and destroy the catalogue.

```
ERROR:  INVENTORY OK - 71 assertions passed (rls: ran)
```

### Customer tests

```bash
psql "$DATABASE_URL" -f supabase/tests/customers.test.sql
```

47 assertions. This is the module where permission *scope* finally does real
work — sales holds add and edit at `own`, warehouse view at `sub` — so most of
the suite is about who may see and change whose accounts, alongside the address
chain, the one-primary rules and the directory view.

```
ERROR:  CUSTOMERS OK - 47 assertions passed (rls: ran)
```

### Check-in tests

```bash
psql "$DATABASE_URL" -f supabase/tests/check_ins.test.sql
```

56 assertions. Two of them are the reason this file exists rather than being
folded into the access-model suite. `check_ins` is append-only, and "nobody may
change this, the super admin included" is a claim about *grants* rather than
about policies, so it is asserted differently from everything else here. And
0035 reopened `guard_self_edit` to add a column to its tuple — the kind of edit
that silently stops guarding if it is got wrong, so the guard is re-tested here.

```
ERROR:  CHECK-INS OK - 56 assertions passed (rls: ran)
```

## Deploy

The app runs on **Vercel**. It cannot go on GitHub Pages: `src/proxy.ts` is
middleware and several routes are server components that read cookies and
redirect, none of which survive a static export.

`main` is the production branch. Every push to it redeploys.

There are **two** Vercel projects from this one repository: this app from the
root, and the Telegram check-in app with its Root Directory set to
`telegram-checkin`. CI checks both, as `check (.)` and `check (telegram-checkin)`
— if a branch protection rule requires the old `check` context, it needs
updating to those two names.

### First-time setup

1. At [vercel.com](https://vercel.com), *Continue with GitHub*.
2. *Add New…* → *Project* → import this repository.
3. The Next.js preset is detected automatically — leave the build settings alone.
4. Add both environment variables, for all environments:

   | Name | Where it comes from |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase dashboard → Project Settings → Data API |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | same page, the `sb_publishable_…` key |

5. Deploy.

Neither value is a secret. The publishable key is meant to reach browsers, and
`anon` holds no privileges on anything since migration `0011` — an
unauthenticated caller gets nothing regardless of what it knows.

### After the first deploy

- **Supabase → Authentication → URL Configuration**: set *Site URL* to the
  production URL and add `https://<your-url>/**` to *Redirect URLs*. Password
  sign-in works without this; password-reset emails do not.
- **Vercel → Settings → Functions → Region**: set it near the database
  (`ap-northeast-2`, Seoul). Singapore is the closest sensible choice for a
  Cambodia-based team. Every page render makes several Supabase calls, so the
  default US region is felt on mobile.

### On a phone

The app ships a web manifest and runs standalone, so *Add to Home Screen* gives
it an icon and drops the browser chrome. That is the intended way to test the
mobile layout — the auto-hiding title bar and bottom bar are built for it.

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm test` | Vitest |
| `npm run icons` | Regenerate app icons from the brand palette |
