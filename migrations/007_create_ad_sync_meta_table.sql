-- Per-preset sync provenance for Meta ad reporting: which Athens-calendar window
-- was fetched, the reporting timezone, and each account's native timezone.
-- Lets the Profit Cockpit prove (and display) that spend is bucketed in
-- Europe/Athens rather than the ad account timezone (America/Los_Angeles).
create table if not exists public.ad_sync_meta (
  preset text primary key,
  range_since date,
  range_until date,
  report_timezone text,
  account_timezones jsonb not null default '{}'::jsonb,
  fetched_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.ad_sync_meta enable row level security;
