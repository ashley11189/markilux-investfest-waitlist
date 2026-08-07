-- ═══════════════════════════════════════════════════════════════════════════
-- Subdivision / HOA community.
--
-- An awning usually needs architectural-committee approval before it can be
-- installed, and that review is what delays a job. Capturing the community at
-- signup lets sales check the covenants before the first conversation instead
-- of after a quote has already been given.
--
-- Optional on purpose: plenty of properties are not in an HOA at all, and a
-- required field there would cost a lead rather than qualify one.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.signups
  add column if not exists hoa_community text
    check (hoa_community is null or length(hoa_community) <= 120);

comment on column public.signups.hoa_community is
  'Subdivision or HOA community. Collected for architectural approval only.';
