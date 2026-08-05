-- ═══════════════════════════════════════════════════════════════════════════
-- Hardening found by a full pre-event audit.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Enforce lower-case email in the database, not just in zod ───────────
-- The duplicate path in the signup route looks a row up with `email = $1`
-- after a unique violation, but the unique index is on lower(email). Those
-- agree only while every writer happens to lower-case first. A row imported
-- through the SQL editor as 'Ashley@Example.com' would trip the index and
-- then fail the lookup, telling a real visitor they are already registered
-- while showing them no confirmation code. Normalising on the way in makes
-- the two agree for every writer, not just the app.

create or replace function public.normalise_signup_email()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.email := lower(btrim(new.email));
  return new;
end;
$$;

comment on function public.normalise_signup_email is
  'Keeps email lower-cased so `email = $1` agrees with the lower(email) index.';

drop trigger if exists signups_normalise_email on public.signups;
create trigger signups_normalise_email
  before insert or update of email on public.signups
  for each row
  execute function public.normalise_signup_email();

-- Fix any rows that predate the trigger.
update public.signups set email = lower(btrim(email))
 where email <> lower(btrim(email));

-- ── 2. Only stamp updated_at when something actually changed ──────────────
-- Re-selecting a lead's current status in the back office issues an UPDATE
-- with identical values. Without this guard the row is rewritten and
-- updated_at moves, so the column cannot be trusted to mean "a staff member
-- changed this".
drop trigger if exists signups_touch_updated_at on public.signups;
create trigger signups_touch_updated_at
  before update on public.signups
  for each row
  when (old.* is distinct from new.*)
  execute function public.touch_signup_updated_at();

-- Rows that existed before updated_at was added were all stamped with the
-- migration's own timestamp, which reads as "edited on deploy day".
update public.signups set updated_at = created_at
 where updated_at > created_at
   and status = 'New'
   and staff_notes is null;

-- ── 3. Stop reserving a rate-limit oracle for anon ────────────────────────
-- Postgres grants EXECUTE on new functions to PUBLIC. The function is
-- security invoker and anon cannot read signups, so it yields nothing today —
-- but that safety rests entirely on the table grants staying revoked. If
-- anyone later adds a permissive SELECT policy this becomes an unauthenticated
-- "does this IP hash exist" probe. Cheaper to close now.
revoke execute on function
  public.signup_rate_exceeded(text, interval, integer) from public;
revoke execute on function
  public.signup_rate_exceeded(text, interval, integer) from anon, authenticated;

revoke execute on function public.touch_signup_updated_at() from public;
revoke execute on function public.normalise_signup_email() from public;

-- ── 4. Drop an index that serves no query ─────────────────────────────────
-- Added for "lists by status", but the back office selects by event and
-- created_at and filters status client-side. With status between the two
-- columns the planner cannot use it for that ORDER BY either, so it only
-- costs write throughput.
drop index if exists public.signups_event_status_idx;

-- ── 5. Reject a stray unlowered email outright ────────────────────────────
-- Belt and braces behind the trigger: if the trigger is ever dropped, writes
-- fail loudly instead of silently reintroducing the mismatch above.
do $$ begin
  alter table public.signups
    add constraint signups_email_is_lowercase
    check (email = lower(email));
exception when duplicate_object then null; end $$;
