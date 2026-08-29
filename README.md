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

Light / Dark / Auto sits in the profile dropdown. Auto is the default and follows
the operating system, including while the app is open. The choice is kept in
`localStorage` and re-applied by a small blocking script in `<head>`
(`src/components/ThemeScript.tsx`) so a dark-mode user never sees a white flash.
That script restates what `applyTheme()` does because nothing is imported that
early; the values it needs are interpolated from `src/lib/theme.ts` so the two
cannot drift.

### Swapping in the real logo

`public/logo-light.svg` and `public/logo-dark.svg` are **placeholder wordmarks**,
not the HIG mark. Replace both files — same paths, similar aspect ratio — and
nothing in the code changes. Then:

```bash
npm run icons   # regenerates the home-screen and tab icons
```

## Interface

### Component kit

`src/components/ui/` holds the visual vocabulary, all built on the theme tokens
so nothing hardcodes a colour:

| Component | For |
| --- | --- |
| `Card` | The standard surface; pass `href` to make it a pressable link |
| `StatTile` | A headline number on a tinted ground, with an optional sparkline |
| `ModuleTile` | A module as a destination — the name is the content, not a number |
| `Sparkline` | A trend shape with no axes or scale |
| `Chip` | Category, status, priority |
| `SegmentedTabs` | Filter row with an active pill |
| `ProgressBar` / `Gauge` | Completion, flat or as a half-donut |
| `Avatar` / `AvatarStack` | Initials or photo, with the remainder counted |
| `TimelineItem` | A typed entry in a day list |
| `DayStrip` | A week of days as tap targets |
| `Sheet` | Bottom sheet on phones, centred dialog from `sm` up |
| `SectionHeader`, `Skeleton` | Section titles, loading placeholders |

The four tint tokens (`--tint-1` … `--tint-4`) are derived from the brand blue
and green, so a grid of tiles stays varied without importing new hues.

### Motion

CSS handles micro-interaction: `.pressable` for the press response, `.stagger`
for lists that arrive in sequence, and keyframes for sheets and menus. Route
changes use React's `<ViewTransition>`, which the App Router supports with no
configuration.

`RouteTransition` crossfades rather than sliding, because the bottom bar
switches between sibling modules — that is tab switching, and a directional
slide would wrongly imply hierarchy. It keys on the pathname: it lives in the
layout, and layouts persist, so without the key React would treat a navigation
as an in-place update and never animate.

The title bar, bottom bar and sidebar carry `viewTransitionName` and have their
animation suppressed, so content moves under the chrome rather than the whole
viewport appearing to slide. Everything is disabled under
`prefers-reduced-motion`.

### The centre button

The raised **+** opens a sheet of what the signed-in person may actually create,
resolved from their `add` permissions in the current view — so it can never
offer an action the row-level policies would then refuse. Adding a module needs
no change here; only an entry in `CREATE_LABELS` (`src/lib/quickActions.ts`) if
you want wording other than "New {module}".

The bottom bar holds four slots around that button. Beyond three modules the
last slot becomes **More**, which opens a sheet rather than shrinking labels
until they are unreadable.

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
npm test          # Vitest, 94 tests
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
