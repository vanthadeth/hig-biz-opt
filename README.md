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

Data Sync needs three more. Without them the app runs; only syncing is inert.

| Variable | What it is |
| --- | --- |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | The service account key, as JSON or base64 of it. See **Data sync** below. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → Project Settings → API. Server-side only — never `NEXT_PUBLIC_`. |
| `SYNC_TICK_SECRET` | Any long random string you invent. The scheduler presents it to start due syncs. On Vercel, set `CRON_SECRET` instead — the endpoint accepts either. |

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

## Data sync

HIG's real database is a spreadsheet people update every day, and this app is
not ready to replace it. So the sheet stays authoritative and the app follows
it, one way, until the day that can be switched off.

**Nothing here can write to a sheet.** Not by policy — by credential. The
service account is granted `spreadsheets.readonly` and that scope is a constant
in `src/lib/google/sheets.ts`, not a setting. A request that tried to write
would be refused by Google before it reached the file.

### Setting up the Google side, once

1. In the [Google Cloud console](https://console.cloud.google.com), create a
   project and enable the **Google Sheets API**.
2. Create a **service account**. It needs no roles — it is not accessing Google
   Cloud, only files people share with it.
3. Create a **JSON key** for it and download the file.
4. Put that file in `GOOGLE_SERVICE_ACCOUNT_JSON`, either as-is or base64
   encoded. Prefer base64 on a hosting provider: a PEM private key is full of
   newlines, and a newline pasted into an environment box is the commonest way
   this credential arrives broken.

   ```bash
   base64 -w0 service-account.json
   ```

5. **Share each spreadsheet with the service account's email address as a
   Viewer.** This is the step people forget, and it is the one that cannot be
   done from inside this app. The address is shown at the top of the Data Sync
   page so nobody has to go looking for it.

### Defining a sync

Data Sync lives in the admin view. A sync is one tab into one table:

- **The sheet** — paste the address bar; the file id is taken out of it. Then
  *Read the sheet*, which lists the tabs and, once one is chosen, its headings.
- **The table** — one of the targets in `public.sync_targets`. Not a free text
  box: a sync that could name any table could name `public.users` and map a
  column onto `is_super_admin`.
- **Column pairing** — every heading in the sheet, with the table column it
  feeds and how to read it. Leave one on *Skip* to ignore it. Sample values from
  the first rows are shown beside each heading, because "Price" next to
  "1,250.50" is obvious and "Price" alone is a guess.
- **When it runs** — every so often, or when the sheet changes.

Rows are matched on the target's key column (`code` for items and customers,
`name` for brands). A row whose key is already there is **updated**; one that is
not is **added**. Nothing is ever deleted: a row that disappears from the sheet
stays in the table, because a sheet row deleted by accident must not empty the
catalogue. Columns the mapping does not name are left alone — a sheet is not the
whole truth about an item.

Rows with no value in the key column are skipped and counted, as are duplicate
keys within one sheet. The run log says how many and why.

### Making it run on a schedule

The app exposes `POST /api/sync/tick`, which runs every interval sync that is
due. It needs `Authorization: Bearer $SYNC_TICK_SECRET`. Point any scheduler at
it. On Vercel, `vercel.json` already does:

```json
{ "crons": [{ "path": "/api/sync/tick", "schedule": "0 * * * *" }] }
```

Vercel Cron sends `Authorization: Bearer $CRON_SECRET`, so on Vercel set
`CRON_SECRET` and nothing else — the endpoint accepts either name. Any other
scheduler should send `SYNC_TICK_SECRET`. With neither set the endpoint refuses
everything, so an unset variable cannot leave it open.

A sync set to "every 15 minutes" still only runs as often as the scheduler calls
the endpoint. The interval says when a sync is *due*, not how often anything is
checked, so set the cron to the shortest interval any sync uses.

### Making a sheet notify the app

A sync set to *When the sheet changes* shows a short Apps Script on its page.
Paste it into that spreadsheet (Extensions → Apps Script), then add an
installable trigger: **onSheetChange**, from spreadsheet, on change.

The script sends no data — only word that something changed. The app then reads
the sheet itself, with the same read-only credential as always.

### What is deliberately not here

- **Two-way sync.** Asked for explicitly, and refused by the credential.
- **Deletion.** See above.
- **Arbitrary target tables.** `public.sync_targets` is seeded by migration.
  Adding one is a migration, which is a review, which is the point.

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
0028_item_code_and_price      code and price belong to the item, not the variant
0029_item_pictures.sql        several pictures per item, one of them primary
0030_audit_log.sql            who changed what, append-only by construction
0031_customer_soft_delete     a retired contact is hidden, never destroyed
0032_credit_limit_permission  $500 by default, and who may move it
0033_module_groups.sql        a module says which menu heading it belongs under
0034_my_modules.sql           everything a person can reach, for the Menu page
0035_catalog_and_cart.sql     packing, stock, and a cart that is yours alone
0036_data_sync.sql            Google Sheets in, one way, through an allow-list
0036b_sync_apply_wrapper      the writer's doorway, open to the service role
```

Run `get_advisors` (security and performance) after adding a migration. The only
finding left open is leaked-password protection, which is a project auth setting
rather than schema — enable it under Authentication → Policies in the dashboard.

## Tests

```bash
npm test          # Vitest, 378 tests
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

97 assertions over the one-level category rule, the sibling-name indexes, the
variant constraints, the packing and stock columns, the `item_catalogue` view,
and who may read, create, change and destroy the catalogue.

```
ERROR:  INVENTORY OK - 97 assertions passed (rls: ran)
```

### Cart tests

The cart is the one table in the schema whose rows belong to a person rather
than to a module, so the question is never "may you" but "is it yours":

```bash
psql "$DATABASE_URL" -f supabase/tests/catalog.test.sql
```

23 assertions over the one-line-per-item index, the quantity constraint, the
`user_id` default that stops a client writing into somebody else's cart, and
the fact that not even a super admin can see or change another person's.

```
ERROR:  CATALOG OK - 23 assertions passed (rls: ran)
```

### Data sync tests

```bash
psql "$DATABASE_URL" -f supabase/tests/data_sync.test.sql
```

42 assertions. Most of them answer one question: what stops somebody who may
define a sync from defining one into `public.users` that maps a sheet column
onto `is_super_admin`. The answer is in three places and all three are asserted
— the target must be in a seeded registry, every mapped column must survive an
allow-list checked by a trigger, and the only function that writes re-checks
both before composing a statement. A table outside the registry offers no
columns at all, so there is nothing a mapping could even name.

The rest is the failure that would cost real money: a sync that cannot tell an
edited row from a new one doubles the catalogue every night.

```
ERROR:  DATA SYNC OK - 42 assertions passed (rls: ran)
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

## Deploy

The app runs on **Vercel**. It cannot go on GitHub Pages: `src/proxy.ts` is
middleware and several routes are server components that read cookies and
redirect, none of which survive a static export.

`main` is the production branch. Every push to it redeploys.

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
