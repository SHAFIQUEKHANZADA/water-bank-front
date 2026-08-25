-- Guardian Water Bank — core schema (v1)
-- Postgres (Supabase). Everything the frontend reads lives here, so raw-fetch
-- never sees zeros again and the audit ledger persists (never resets on refresh).
--
-- Evidence tags carried per row:  M | C | E | R | V
--   M Measured  · C Calculated · E Estimated · R Recommended · V Verified
--
-- Run order: 001_schema.sql then 002_seed.sql.

-- gen_random_uuid()
create extension if not exists pgcrypto;

-- ── reference: monitoring wells (real ISWS Mahomet IDs) ──────────────────────
create table if not exists wells (
  id          text primary key,             -- e.g. CHAM-07-04B
  name        text        not null,
  base_depth  numeric     not null,         -- baseline depth (ft)
  qaqc        boolean     not null default false,
  created_at  timestamptz not null default now()
);

-- daily depth reading per well  [M]  (simulated now → USGS/ISWS in #3)
create table if not exists well_readings (
  id           bigserial primary key,
  well_id      text        not null references wells(id),
  reading_date date        not null,
  depth_ft     numeric     not null,
  source       text        not null default 'simulated',  -- simulated|usgs|isws
  tag          char(1)     not null default 'M',
  created_at   timestamptz not null default now(),
  unique (well_id, reading_date)
);

-- ── weather (daily, per NOAA station) ────────────────────────────────────────
-- rain_in is [M] once NOAA fills it; et0_in is [C] (Hargreaves-Samani).
create table if not exists weather_daily (
  id          bigserial primary key,
  station     text        not null,          -- GHCND:USC00111436
  obs_date    date        not null,
  tmax_f      numeric,
  tmin_f      numeric,
  rain_in     numeric,
  et0_in      numeric,
  rain_source text        not null default 'simulated',   -- noaa|simulated
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (station, obs_date)
);

-- ── farms (pilot) ────────────────────────────────────────────────────────────
create table if not exists farms (
  id         text primary key,               -- Farm A
  crop       text        not null,
  stage      text        not null,
  acres      numeric     not null,
  kc         numeric     not null,           -- FAO-56 crop coefficient
  created_at timestamptz not null default now()
);

-- daily farm meter (gallons applied)  [M] — manual/photographed per pilot plan
create table if not exists meter_readings (
  id           bigserial primary key,
  farm_id      text        not null references farms(id),
  reading_date date        not null,
  gallons      numeric     not null,
  anomaly      boolean     not null default false,
  source       text        not null default 'manual',
  created_at   timestamptz not null default now(),
  unique (farm_id, reading_date)
);

-- ── audit ledger: append-only, SHA-256 hash-chained ──────────────────────────
-- Corrections are NEW rows that reference a prior entry's hash — never an UPDATE.
create table if not exists ledger (
  seq             bigserial primary key,
  entry_id        uuid        not null default gen_random_uuid(),
  ts              timestamptz not null default now(),
  entry_type      text        not null,      -- observation|calculation|recommendation|review|correction
  tag             char(1)     not null,      -- M|C|E|R|V
  subject         text        not null,      -- what this entry is about
  payload         jsonb       not null,      -- the data being attested
  actor           text        not null,      -- who/what wrote it
  references_hash text,                        -- correction → prior entry hash
  prev_hash       text        not null,      -- previous row's hash (chain)
  hash            text        not null unique -- sha256(prev_hash + canonical body)
);

create index if not exists ledger_ts_idx      on ledger (ts);
create index if not exists ledger_subject_idx on ledger (subject);

-- Enforce append-only: block UPDATE and DELETE on the ledger at the DB level.
create or replace function ledger_is_immutable() returns trigger as $$
begin
  raise exception 'ledger is append-only: % is not allowed', tg_op;
end;
$$ language plpgsql;

drop trigger if exists ledger_no_update on ledger;
create trigger ledger_no_update before update on ledger
  for each row execute function ledger_is_immutable();

drop trigger if exists ledger_no_delete on ledger;
create trigger ledger_no_delete before delete on ledger
  for each row execute function ledger_is_immutable();

-- ── independent reviews  [V] — earned, never a toggle ────────────────────────
create table if not exists reviews (
  id         bigserial primary key,
  ledger_seq bigint      references ledger(seq),
  reviewer   text        not null,
  verdict    text        not null,           -- verified|rejected|needs_more
  notes      text,
  created_at timestamptz not null default now()
);

-- ── policy rules (demo governance) ───────────────────────────────────────────
create table if not exists policy_rules (
  rule       text primary key,               -- RULE-014
  type       text not null,
  trigger    text not null,
  source     text not null,
  effective  text,
  applies_to text
);
