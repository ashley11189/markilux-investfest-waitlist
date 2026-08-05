# Deployment guide

From an empty Supabase account to a working booth page. Allow about 20 minutes.

---

## 1. Create the Supabase project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and create a
   new project.
2. Choose a region close to Atlanta — **East US (North Virginia)** matches the
   `iad1` region already set in [vercel.json](vercel.json).
3. Save the database password somewhere safe. You will not need it for this app,
   but you will want it later.

## 2. Apply the schema

In the Supabase dashboard, open **SQL Editor → New query**, paste the entire
contents of
[`supabase/migrations/20260804000001_init_waitlist.sql`](supabase/migrations/20260804000001_init_waitlist.sql),
and run it.

It creates:

- `events` — seeded with the `investfest-2026` row
- `signups` — the waitlist table, with a unique index on `(event_id, lower(email))`
- `signup_rate_exceeded()` — the rate-limit helper
- Row Level Security enabled on both tables, with **no** permissive policies

Verify by running:

```sql
select tablename, rowsecurity from pg_tables
 where schemaname = 'public' and tablename in ('signups','events');
```

Both rows must show `rowsecurity = true`.

> If you use the Supabase CLI instead, `supabase db push` applies the same file.

## 3. Collect the credentials

**Project Settings → API**:

| Value                          | Environment variable        |
| ------------------------------ | --------------------------- |
| Project URL                    | `NEXT_PUBLIC_SUPABASE_URL`  |
| `service_role` key (secret)    | `SUPABASE_SERVICE_ROLE_KEY` |

The `service_role` key bypasses Row Level Security. It belongs in Vercel's
environment variables and nowhere else — not in the repo, not in a Slack
message, not in a screenshot.

## 4. Generate the secrets

```bash
openssl rand -base64 32   # SIGNUP_IP_SALT
openssl rand -base64 32   # ORGANIZER_SESSION_SECRET
```

Then choose an `ORGANIZER_PASSCODE` for booth staff. Something a person can type
on an iPad without a password manager, but not something guessable — and rotate
it when the event ends.

## 5. Run it locally

```bash
cp .env.example .env.local
# fill in the six values
npm install
npm run dev
```

Submit the form, then check **Table Editor → signups** in Supabase. The row
should be there.

## 6. Deploy to Vercel

### Via the dashboard

1. [vercel.com/new](https://vercel.com/new) → import the GitHub repository.
2. Framework preset is detected as **Next.js**. Leave the build settings alone.
3. Add every variable from `.env.example` under **Environment Variables**, for
   Production, Preview, and Development.
4. Deploy.

### Via the CLI

```bash
npm i -g vercel
vercel login
vercel link
vercel env add SUPABASE_SERVICE_ROLE_KEY production   # repeat per variable
vercel --prod
```

### After the first deploy

Set `NEXT_PUBLIC_SITE_URL` to the real deployment URL and redeploy, so the Open
Graph image resolves against the right origin.

## 7. Verify the deployment

Run these against the live URL:

```bash
SITE=https://your-deployment.vercel.app

# Security headers present
curl -sS -D - -o /dev/null $SITE | grep -iE 'content-security-policy|strict-transport|x-frame'

# Validation rejects an empty submission
curl -sS -X POST $SITE/api/signup -H 'Content-Type: application/json' -d '{}'

# The lead list refuses anonymous access
curl -sS -o /dev/null -w '%{http_code}\n' $SITE/api/organizer/leads   # expect 401
```

Then, by hand:

1. Submit a real signup and confirm the row lands in Supabase.
2. Submit the **same email again** — you should see "already on the list", and
   no second row should appear.
3. Open `/organizer`, sign in, and confirm the list and CSV export work.
4. Change a lead's status and add an internal note; refresh and confirm both stuck.
5. Settings → **Send a test email**, and confirm it arrives.
6. Toggle kiosk mode and confirm the welcome screen appears and auto-resets.

---

## Environment variables

| Variable                    | Secret | Purpose                                        |
| --------------------------- | ------ | ---------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`  | no     | Supabase project REST URL                      |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** | Server-side database access; bypasses RLS      |
| `SIGNUP_IP_SALT`            | **yes** | Salts the IP hash used for rate limiting       |
| `ORGANIZER_PASSCODE`        | **yes** | What booth staff type to view the lead list    |
| `ORGANIZER_SESSION_SECRET`  | **yes** | Signs the organizer session cookie (≥32 chars) |
| `NEXT_PUBLIC_EVENT_SLUG`    | no     | Must match a row in `events.slug`              |
| `NEXT_PUBLIC_SITE_URL`      | no     | Canonical URL for Open Graph                   |
| `SMTP_HOST`                 | no     | Mail server for signup notifications           |
| `SMTP_PORT`                 | no     | 587 for STARTTLS, 465 for implicit TLS         |
| `SMTP_USER`                 | **yes** | Mailbox login, usually the full address       |
| `SMTP_PASSWORD`             | **yes** | App password where the account uses 2FA       |
| `SMTP_FROM`                 | no     | Defaults to `SMTP_USER`                        |
| `SIGNUP_NOTIFY_TO`          | no     | Who gets notified; comma-separate for several  |

The `SMTP_*` group is optional. Leave it unset and notifications are off;
signups still save and still appear in the back office. Once set, confirm it
works from **/organizer → Settings → Send a test email** rather than waiting to
find out at the booth.

A missing variable raises a clear `MissingEnvError` on the first request that
needs it, rather than failing the build.

---

## Running a second event

No code change required:

```sql
insert into public.events (slug, name, starts_on, ends_on)
values ('next-show-2027', 'Next Show 2027', '2027-03-01', '2027-03-03');
```

Set `NEXT_PUBLIC_EVENT_SLUG=next-show-2027` and redeploy. Signups are scoped per
event, so the same person can join the list at two different shows.

---

## Exporting the leads

**From the booth**: organizer panel → Download CSV.

**From Supabase**: Table Editor → `signups` → Export as CSV, or:

```sql
select s.created_at, s.name, s.email, s.phone, s.role,
       s.interests, s.timeline, s.location, s.notes, s.confirmation
  from public.signups s
  join public.events e on e.id = s.event_id
 where e.slug = 'investfest-2026'
 order by s.created_at desc;
```

Everyone in this table ticked the consent box, which is recorded alongside the
timestamp in `consent` and `consent_at`.

---

## After the event

1. Export the leads.
2. Rotate `ORGANIZER_PASSCODE`.
3. Consider rotating `SUPABASE_SERVICE_ROLE_KEY` if it was ever handled loosely.
4. If the page stays up between shows, point `NEXT_PUBLIC_EVENT_SLUG` at the
   next event so stray signups don't land in the InvestFest list.

---

## Troubleshooting

| Symptom                                        | Cause                                                                        |
| ---------------------------------------------- | ---------------------------------------------------------------------------- |
| "We could not save that just now"              | Check the Vercel function logs. Usually a wrong `SUPABASE_SERVICE_ROLE_KEY` or a schema that was never applied. |
| Organizer passcode rejected                    | `ORGANIZER_PASSCODE` not set in the deployed environment, or set without a redeploy. |
| "Could not load the event"                     | `NEXT_PUBLIC_EVENT_SLUG` doesn't match any `events.slug` row.                 |
| Signups blocked with "a lot of signups"        | The per-IP limit is 30 per 10 minutes, and a whole booth shares the venue's NAT. If a genuinely busy show hits it, raise `RATE_LIMIT_MAX` in [src/app/api/signup/route.ts](src/app/api/signup/route.ts) and redeploy. |
| Organizer session drops                        | Expected after 12 hours. Sign in again.                                      |
