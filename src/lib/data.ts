// Server-side data loader — reads the real numbers from Postgres and assembles
// them into the WaterData shape the dashboard renders. This is what serves real
// values in the initial server render (no client-side simulation, no raw-fetch
// zeros). Numeric columns come back from postgres.js as strings, so everything
// is Number()-coerced here.

import "server-only";
import { sql } from "./db";
import type { WaterData, Well, Farm, WellSeries, Weather, MeterSeries, PolicyRule } from "./waterbank";

export async function getWaterData(): Promise<WaterData> {
  // Queries run SEQUENTIALLY on a single connection (db.ts uses max:1). Supabase's
  // transaction pooler can't handle postgres.js pipelining multiple concurrent
  // queries on one connection — Promise.all here hangs. Sequential is ~2s total
  // and, with max:1, never exhausts the shared free-tier pooler.
  const wellRows = await sql<{ id: string; name: string; base_depth: string; qaqc: boolean }[]>`
    select id, name, base_depth, qaqc from wells order by id`;
  const farmRows = await sql<{ id: string; crop: string; stage: string; acres: string; kc: string }[]>`
    select id, crop, stage, acres, kc from farms order by id`;
  const policyRows = await sql<{ rule: string; type: string; trigger: string; source: string; effective: string; applies_to: string }[]>`
    select rule, type, trigger, source, effective, applies_to from policy_rules order by rule`;
  const wrRows = await sql<{ well_id: string; d: string; depth_ft: string }[]>`
    select well_id, reading_date::text as d, depth_ft from well_readings order by well_id, reading_date`;
  // Bound weather to the readings window so real NOAA rows pulled for dates
  // beyond the 90-day axis (e.g. the last few real days) don't misalign charts.
  const wxRows = await sql<{ d: string; tmax_f: string; tmin_f: string; rain_in: string; et0_in: string; rain_source: string }[]>`
    select obs_date::text as d, tmax_f, tmin_f, rain_in, et0_in, rain_source
    from weather_daily
    where obs_date <= (select max(reading_date) from well_readings)
    order by obs_date`;
  const mrRows = await sql<{ farm_id: string; d: string; gallons: string; anomaly: boolean }[]>`
    select farm_id, reading_date::text as d, gallons, anomaly from meter_readings order by farm_id, reading_date`;

  const wells: Well[] = wellRows.map((w) => ({
    id: w.id, name: w.name, base: Number(w.base_depth), qaqc: w.qaqc,
  }));

  const farms: Farm[] = farmRows.map((f) => ({
    id: f.id, crop: f.crop, stage: f.stage, acres: Number(f.acres), kc: Number(f.kc),
  }));

  const policyRules: PolicyRule[] = policyRows.map((p) => ({
    rule: p.rule, type: p.type, trigger: p.trigger, source: p.source,
    effective: p.effective, appliesTo: p.applies_to,
  }));

  // Common date axis (weather has exactly one row per day).
  const dates = wxRows.map((r) => r.d);

  const weather: Weather = {
    tmax: wxRows.map((r) => Number(r.tmax_f)),
    tmin: wxRows.map((r) => Number(r.tmin_f)),
    rain: wxRows.map((r) => Number(r.rain_in)),
    et0: wxRows.map((r) => Number(r.et0_in)),
    rainSource: wxRows.map((r) => r.rain_source),
  };

  // Group well readings by well, aligned to `dates`.
  const wellSeries: WellSeries[] = wells.map((w) => ({
    id: w.id, name: w.name, qaqc: w.qaqc,
    depth: wrRows.filter((r) => r.well_id === w.id).map((r) => Number(r.depth_ft)),
  }));

  const meterSeries: MeterSeries[] = farms.map((f) => {
    const rows = mrRows.filter((r) => r.farm_id === f.id);
    return {
      farm: f.id,
      gallons: rows.map((r) => Number(r.gallons)),
      anomaly: rows.map((r) => r.anomaly),
    };
  });

  return { dates, wells, farms, policyRules, wellSeries, weather, meterSeries };
}
