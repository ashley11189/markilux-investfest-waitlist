# markilux — Private Sale Initiative Waitlist

Lead capture for **InvestFest 2026**. Visitors join the markilux USA Private Sale
list from the booth iPad or their own phone; every signup is validated on the
server and stored in Supabase for follow-up after the event.

Built from the Claude Design export in [`design-export/`](design-export/), which
is preserved verbatim as the visual reference.

---

## Stack

| Layer      | Choice                                        |
| ---------- | --------------------------------------------- |
| Framework  | Next.js 16 (App Router) · React 19 · TypeScript |
| Styling    | Tailwind CSS 4 + the Modernist design tokens   |
| Database   | Supabase (Postgres) with Row Level Security    |
| Validation | Zod 4, shared between client and server        |
| Hosting    | Vercel                                         |

---

## Quick start

```bash
npm install
cp .env.example .env.local     # then fill in the values
npm run dev                    # http://localhost:3000
```

You need a Supabase project before the form can save anything. See
[DEPLOYMENT.md](DEPLOYMENT.md) for the full walkthrough.

### Scripts

| Command                   | What it does                                       |
| ------------------------- | -------------------------------------------------- |
| `npm run dev`             | Development server                                 |
| `npm run build`           | Production build                                   |
| `npm start`               | Serve the production build                         |
| `npm run lint`            | ESLint                                             |
| `npm run typecheck`       | `tsc --noEmit`                                     |
| `npm run optimize:images` | Re-derive `public/img/` from `design-export/assets/` |

---

## How it works

```
Browser                      Next.js (server)              Supabase
───────                      ────────────────              ────────
SignupForm
  └─ zod parse (courtesy) ──▶ POST /api/signup
                               ├─ zod parse (authority)
                               ├─ honeypot check
                               ├─ time-on-form check
                               ├─ rate limit by hashed IP ──▶ signup_rate_exceeded()
                               └─ insert ───────────────────▶ signups (service role)
                                                               └─ unique(event, lower(email))
                                                            after response
                                                               └─ SMTP notify
/organizer (BackOffice)
  └─ passcode ─────────────▶ POST /api/organizer/session
                               └─ signed httpOnly cookie
  └─ list ─────────────────▶ GET /api/organizer/leads
                               └─ cookie required ──────────▶ select
  └─ triage ───────────────▶ PATCH /api/organizer/leads/:id
                               └─ cookie required ──────────▶ update status/notes
```

The browser never holds a Supabase key of any kind. All database access happens
in route handlers using the service-role key, which stays on the server.

### Layout

```
src/
  app/
    layout.tsx                     Fonts, metadata, viewport
    page.tsx                       Renders the signup experience
    organizer/page.tsx             Back office (noindex)
    globals.css                    Modernist design tokens + components
    api/
      signup/route.ts              Validate → spam-gate → rate-limit → insert
      organizer/session/route.ts   Passcode → signed cookie
      organizer/leads/route.ts     Cookie-gated lead list
      organizer/leads/[id]/route.ts  Cookie-gated status / notes update
      organizer/test-email/route.ts  Mailbox check and test send
  components/
    SignupExperience.tsx           Welcome / form / confirmation state machine
    SignupForm.tsx                 The form itself
    BackOffice.tsx                 Lead triage, search, CSV, QR, settings
  lib/
    validation.ts                  Zod schemas shared by client and server
    env.ts                         Lazy, validated environment access
    notify.ts                      SMTP new-signup email (never throws)
    request.ts                     IP hashing, confirmation codes, safe compare
    organizer-session.ts           HMAC-signed session cookie
    use-kiosk-mode.ts              Persisted kiosk toggle
    supabase/                      Service-role client + database types
supabase/
  migrations/                      Schema, RLS, rate-limit function
scripts/
  optimize-images.mjs              AVIF/WebP derivation
design-export/                     Original Claude Design export, untouched
```

---

## Security

The export was a booth prototype. These are the substantive changes:

| Prototype                                                     | Now                                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `ORGANIZER_CODE = 'MKX-2026'` in page source                   | Server-side `ORGANIZER_PASSCODE`, constant-time compare, signed httpOnly cookie |
| Leads in `localStorage` on the booth device, permanently       | Leads in Postgres; the device holds nothing                                |
| Email checked with a regex in the browser only                 | Same Zod schema re-run on the server, which is the authority               |
| Backend URL editable by anyone who opened the organizer panel  | Fixed server-side environment variable                                     |
| No rate limiting, no spam protection                           | Honeypot, time-on-form, and per-IP rate limit backed by the database       |
| Duplicate signups possible                                     | `unique (event_id, lower(email))` — enforced by Postgres, not by a check   |
| Confirmation shown even when the save failed                   | Success is only ever reported after the server confirms it                 |
| Three CDN dependencies (fonts, qrcodejs, three.js)             | Everything bundled; the page works on hostile conference Wi-Fi             |
| No security headers                                            | CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, Permissions-Policy          |

Row Level Security is enabled on both tables with **no permissive policies**, and
the default grants to `anon`/`authenticated` are revoked. A leaked publishable
key yields nothing.

Visitor IPs are stored only as a salted SHA-256 digest, used for rate limiting.

---

## Accessibility

- A real `<form>` — Enter submits, native semantics throughout
- Every input has an associated `<label>`; radio and checkbox groups use
  `<fieldset>` / `<legend>`
- Errors are announced via `aria-live="assertive"` and take focus
- `aria-required` / `aria-invalid` / `aria-describedby` wired to per-field messages
- Focus moves to the new heading on every screen change
- The organizer dialog traps Tab and closes on Escape
- `prefers-reduced-motion` respected
- Focus-visible outlines meet the design system's 2px rule

---

## Performance

The export's hero image was a 2.8 MB PNG. `npm run optimize:images` pre-encodes
AVIF and WebP at three widths:

| Asset      | Before  | After (phone, AVIF) |
| ---------- | ------- | ------------------- |
| Hero image | 2778 KB | 50 KB               |
| Wordmark   | 39 KB   | 4 KB                |

Fonts are self-hosted by `next/font`, so nothing is fetched from
`fonts.googleapis.com` at runtime.

---

## Back office

`/organizer`, reachable from the footer link and gated by the passcode. It is
`noindex`, and the page ships no lead data in its HTML — everything comes from
the cookie-gated API after sign-in.

- **Sign ups** — the full list, searchable across every field. Each row carries
  a **status** (New / Contacted / Follow-up / Closed) and a private
  **internal notes** box; both save as you change them, optimistically, and roll
  back if the server refuses. CSV export follows the current filter.
- **QR code** — generated locally, for the booth sign.
- **Settings** — kiosk toggle, and a test-email button that proves the mailbox
  works before the event rather than during it.

`staff_notes` is deliberately separate from `notes`: the latter is what the
visitor typed, and internal comments must not leak into an export.

## Email notifications

Set the `SMTP_*` variables and every new signup emails `SIGNUP_NOTIFY_TO` with
the full details and a link into the back office. Replies go to the person who
signed up.

Sending happens in `after()`, so it runs once the response has already reached
the visitor, and every failure is caught and logged. An unreachable mail server
cannot fail a signup — leaving the variables unset simply turns notifications
off. Duplicates do not re-notify.

## Kiosk mode

Open the back office, sign in, and toggle **Kiosk mode** under Settings. The
page then shows a welcome screen, hides the organizer link, and returns to the
start seven seconds after each confirmation so the next visitor never sees the
previous person's name. The setting persists across refreshes.

---

## Documentation

- [DEPLOYMENT.md](DEPLOYMENT.md) — Supabase setup, Vercel deploy, environment variables
- [.env.example](.env.example) — every variable, annotated
- [supabase/migrations/](supabase/migrations/) — the schema
- [design-export/README.md](design-export/README.md) — the original handoff notes
