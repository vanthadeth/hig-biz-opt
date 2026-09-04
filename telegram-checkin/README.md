# HIG Check-in

A Telegram Mini App with one screen and one job: **check in and check out, with
your location and a photo of you.**

It is a separate Next.js project that shares the web app's Supabase project, its
employee records and its access rules. The database is the source of truth for
both; migrations live at the repository root, in `../supabase/migrations`.

## Getting started

```bash
npm install
cp .env.local.example .env.local   # fill in the four values
npm run dev
```

| Variable | Secret | Where it comes from |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | no | Supabase dashboard → Project Settings → Data API |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | no | same page, the `sb_publishable_…` key |
| `TELEGRAM_BOT_TOKEN` | **yes** | `@BotFather` → `/token` |
| `SUPABASE_SECRET_KEY` | **yes** | Project Settings → API Keys → the `sb_secret_…` key |

Both secrets are read inside request handlers, never at module scope, so
`npm run build` succeeds without them. That is what keeps CI free of secrets.

## Signing in

Telegram hands the page `initData`: a query string it has signed with the bot's
token, naming the account that opened the app. Everything follows from checking
that signature server-side.

1. **First launch.** The Telegram account matches no employee, so the page asks
   for the HIG email and password the person already uses for the web app.
   `POST /api/telegram/bind` verifies the launch, signs them in, and writes
   their numeric Telegram account onto their employee record.
2. **Every launch after.** `POST /api/telegram/session` verifies the launch,
   finds the employee, and mints a real Supabase session. No password.

The session is an ordinary Supabase one, so **every row-level policy written for
the web app applies here unchanged**. Nothing about who may see what is
re-implemented in TypeScript.

Two things are worth knowing before changing any of this:

- **The bind cannot be done from the browser.** `public.guard_self_edit` refuses
  a self-service write to `telegram_user_id` — otherwise any employee could
  point their own record at a colleague's Telegram account and collect their
  attendance. The write needs the secret key, which means a server.
- **A magic link is minted only when there is no session.** Supabase rate-limits
  them per user, and inside that window `generateLink` returns the token it
  issued last time — which `verifyOtp` has already spent. The handler checks for
  an existing session first, and falls back to the sign-in panel rather than to
  an error if the mint fails anyway.

## The screen

One page, because there is one thing to do: who you are, today's punches, and a
button that says **Check in** or **Check out** depending on the last one. It is
disabled until both the location and the photo are in hand.

- **Location** comes from Telegram's `LocationManager` on Bot API 8.0 and later,
  and from `navigator.geolocation` otherwise — which is also the path Telegram
  Desktop takes, since it has no location manager. Which instrument answered is
  stored on the record, because they are not the same evidence.
- **The photo** opens the camera, and is redrawn on a canvas at 1280 px on the
  long edge before upload. A phone camera returns four to eight megabytes; the
  bucket's limit is five, and the team is on mobile data.

## Setting up the bot

1. `@BotFather` → `/newbot`, and keep the token.
2. `/newapp`, or Menu Button → Web App, pointed at the deployed URL.
3. Telegram requires **HTTPS on a public host**. A Vercel preview URL works;
   `localhost` does not. For local work, tunnel it — `cloudflared tunnel --url
   http://localhost:3000` — and point BotFather back afterwards.

## Testing without a phone

Most of it opens in an ordinary browser: with no `window.Telegram`, the page
says so and the sign-in and location paths can still be exercised with
DevTools' location override. **Telegram Desktop** runs Mini Apps and has
devtools behind Settings → Advanced → Experimental → *Enable webview
inspecting*; because it has no `LocationManager`, it is also what proves the
browser fallback. **Telegram Web** loads the app in an iframe, which is the
client that would catch a framing header if one were ever added.

## Tests

```bash
npm test
```

Vitest covers the parts that can be wrong quietly: the `initData` signature
check (including that the newer Ed25519 `signature` field is excluded from the
check string, which is what breaks a validator written before it existed), which
punch the button offers given the day so far, the Phnom Penh day boundary, and
the choice between Telegram's location manager and the browser's.

The database rules are tested in the database, where they run — see
`../supabase/tests/check_ins.test.sql`.

## Deploy

A **second Vercel project**, with Root Directory set to `telegram-checkin`. Set
all four environment variables, mark the two secrets as sensitive, and put the
functions in the same region as the database.
