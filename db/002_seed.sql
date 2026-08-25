-- Guardian Water Bank — reference seed data.
-- Real ISWS Mahomet well IDs + the pilot farms + demo policy rules.
-- Idempotent: safe to re-run (on conflict do nothing / update).

-- ── wells (real ISWS Mahomet monitoring-well IDs; MTH-22S under QA/QC) ────────
insert into wells (id, name, base_depth, qaqc) values
  ('CHAM-07-04B', 'Bondville (E. Mahomet)',        41.5, false),
  ('CHAM-07-01A', 'Zahnd Pond / Mahomet',          44.0, false),
  ('CHAM-08-02A', 'Middle Fork / Mahomet',         52.3, false),
  ('CHAM-08-03A', 'South of Ludlow / Mahomet',     48.9, false),
  ('CHAM-08-08A', 'Lake of the Woods / Mahomet',   38.7, false),
  ('MTH-22S',     'N. Mahomet (McLean–Tazewell)',  67.9, true)
on conflict (id) do update
  set name = excluded.name, base_depth = excluded.base_depth, qaqc = excluded.qaqc;

-- ── farms (pilot) ────────────────────────────────────────────────────────────
insert into farms (id, crop, stage, acres, kc) values
  ('Farm A', 'Corn',    'Tasseling', 120, 1.15),
  ('Farm B', 'Soybean', 'Pod fill',   90, 1.05),
  ('Farm C', 'Corn',    'Emergence', 100, 0.35)
on conflict (id) do update
  set crop = excluded.crop, stage = excluded.stage,
      acres = excluded.acres, kc = excluded.kc;

-- ── policy rules (demo governance) ───────────────────────────────────────────
insert into policy_rules (rule, type, trigger, source, effective, applies_to) values
  ('RULE-014', 'Declining groundwater trend', '7-day depth change > +0.15 ft', '[demo policy]', '2026-08-01', 'E-Central IL demo geography'),
  ('RULE-021', 'Withdrawal threshold',        'farm pumping > 2× 14-day baseline', '[demo policy]', '2026-08-01', 'Simulated farms A/B/C'),
  ('RULE-033', 'Conservation trigger',        'drought advisory active', '[agency doc — TBD]', 'TBD', 'TBD')
on conflict (rule) do update
  set type = excluded.type, trigger = excluded.trigger, source = excluded.source,
      effective = excluded.effective, applies_to = excluded.applies_to;
