-- ═══════════════════════════════════════════════════════════════════════════
-- markilux Private Sale Initiative — waitlist schema
--
-- Security model: the anon key can do NOTHING here. RLS is enabled with no
-- permissive policies for anon/authenticated, so even a leaked publishable key
-- yields an empty result set. All writes go through the Next.js API route using
-- the service-role key, which never reaches the browser.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ── lookup: events ─────────────────────────────────────────────────────────
-- Normalized so the same codebase can run at the next show without a migration.

create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  starts_on   date,
  ends_on     date,
  created_at  timestamptz not null default now()
);

comment on table public.events is
  'Conferences / activations that feed the waitlist. Referenced by signups.';

insert into public.events (slug, name, starts_on, ends_on)
values ('investfest-2026', 'InvestFest 2026', '2026-08-21', '2026-08-23')
on conflict (slug) do nothing;

-- ── enums ──────────────────────────────────────────────────────────────────
-- Kept in sync with src/lib/validation.ts. Changing a label is a migration.

do $$ begin
  create type public.signup_role as enum (
    'Property owner',
    'Contractor or builder',
    'Designer or architect'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.signup_timeline as enum (
    'Ready now',
    'Next 90 days',
    'Later this year'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.signup_interest as enum (
    'markilux 1600',
    'Other product lines'
  );
exception when duplicate_object then null; end $$;

-- ── signups ────────────────────────────────────────────────────────────────

create table if not exists public.signups (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events (id) on delete restrict,

  name           text not null check (length(btrim(name)) between 1 and 120),
  email          text not null check (length(email) <= 254 and email like '%_@_%.__%'),
  phone          text check (length(phone) <= 40),
  location       text check (length(location) <= 120),
  notes          text check (length(notes) <= 1000),

  role           public.signup_role not null,
  timeline       public.signup_timeline,
  interests      public.signup_interest[] not null default '{}',

  consent        boolean not null default false check (consent),
  consent_at     timestamptz not null default now(),

  -- Provenance. ip_hash is a salted digest, never a raw address, so the table
  -- stays useful for abuse control without storing an identifier we don't need.
  ip_hash        text,
  user_agent     text check (length(user_agent) <= 500),
  source         text not null default 'web' check (source in ('web', 'kiosk')),

  confirmation   text not null unique,
  created_at     timestamptz not null default now()
);

comment on table public.signups is
  'Private Sale Initiative waitlist registrations captured at events.';
comment on column public.signups.ip_hash is
  'sha256(ip + SIGNUP_IP_SALT). Used for rate limiting only; not reversible.';
comment on column public.signups.confirmation is
  'Short human-readable code shown on the confirmation screen.';

-- One signup per email per event. Case-insensitive, so Ashley@ and ashley@
-- are the same person. This is what makes duplicate submission impossible
-- rather than merely unlikely.
create unique index if not exists signups_event_email_key
  on public.signups (event_id, lower(email));

create index if not exists signups_event_created_idx
  on public.signups (event_id, created_at desc);

create index if not exists signups_ip_hash_created_idx
  on public.signups (ip_hash, created_at desc)
  where ip_hash is not null;

-- ── row level security ─────────────────────────────────────────────────────
-- Enabled with zero policies: anon and authenticated get nothing. The
-- service-role key bypasses RLS by design and is the only way in.

alter table public.signups enable row level security;
alter table public.events  enable row level security;

-- Belt and braces: revoke the default grants Supabase hands the API roles, so
-- a future permissive policy can't accidentally expose the table.
revoke all on public.signups from anon, authenticated;
revoke all on public.events  from anon, authenticated;

-- ── rate limiting ──────────────────────────────────────────────────────────
-- Counting rows in a window is enough at event scale and needs no extra
-- infrastructure. Runs as the caller (service role), so RLS is not a factor.

create or replace function public.signup_rate_exceeded(
  p_ip_hash text,
  p_window  interval default '10 minutes',
  p_limit   integer  default 5
)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select count(*) >= p_limit
    from public.signups
   where ip_hash = p_ip_hash
     and created_at > now() - p_window;
$$;

comment on function public.signup_rate_exceeded is
  'True when this client has already created p_limit signups inside p_window.';
