-- ═══════════════════════════════════════════════════════════════════════════
-- Lead triage — working state for the back office.
--
-- Everything here is staff-owned. Nothing in this migration is ever shown to a
-- visitor or accepted from the public signup form; it is written only through
-- the cookie-gated organizer routes using the service-role key.
-- ═══════════════════════════════════════════════════════════════════════════

do $$ begin
  create type public.lead_status as enum (
    'New',
    'Contacted',
    'Follow-up',
    'Closed'
  );
exception when duplicate_object then null; end $$;

alter table public.signups
  add column if not exists status public.lead_status not null default 'New';

-- Named staff_notes, not notes: `notes` already holds what the visitor typed
-- into the form, and overloading it would let internal comments leak into an
-- export that is handed to someone outside the team.
alter table public.signups
  add column if not exists staff_notes text
    check (staff_notes is null or length(staff_notes) <= 2000);

alter table public.signups
  add column if not exists updated_at timestamptz not null default now();

comment on column public.signups.status is
  'Where this lead sits in follow-up. Staff-owned; never set by the form.';
comment on column public.signups.staff_notes is
  'Private internal comments. Not the visitor-supplied notes column.';
comment on column public.signups.updated_at is
  'Last time a staff member changed status or staff_notes.';

-- The back office lists by status and recency, so index the pair it filters on.
create index if not exists signups_event_status_idx
  on public.signups (event_id, status, created_at desc);

-- Keep updated_at honest rather than trusting every caller to set it.
create or replace function public.touch_signup_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists signups_touch_updated_at on public.signups;
create trigger signups_touch_updated_at
  before update on public.signups
  for each row
  execute function public.touch_signup_updated_at();
