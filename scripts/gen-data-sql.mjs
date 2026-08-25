// Generates db/003_data.sql — 90 days of the deterministic series as plain SQL
// you can paste into the Supabase SQL Editor (no DB connection needed here).
// Mirrors src/lib/waterbank.ts exactly (same mulberry32(42) seed + call order).

import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, "..", "db", "003_data.sql");

const DAYS = 90;
const NOAA_STATION = "GHCND:USC00111436";
const TODAY = "2026-08-20";

const WELLS = [
  { id: "CHAM-07-04B", base: 41.5 }, { id: "CHAM-07-01A", base: 44.0 },
  { id: "CHAM-08-02A", base: 52.3 }, { id: "CHAM-08-03A", base: 48.9 },
  { id: "CHAM-08-08A", base: 38.7 }, { id: "MTH-22S", base: 67.9 },
];
const FARMS = [
  { id: "Farm A", kc: 1.15, acres: 120 }, { id: "Farm B", kc: 1.05, acres: 90 },
  { id: "Farm C", kc: 0.35, acres: 100 },
];

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeNormal(rng) {
  return (mean, sd) => {
    const u = Math.max(rng(), 1e-9), v = rng();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}

const DATES = (() => {
  const out = [], end = new Date(TODAY + "T00:00:00");
  for (let i = DAYS - 1; i >= 0; i--) { const d = new Date(end); d.setDate(end.getDate() - i); out.push(d.toISOString().slice(0, 10)); }
  return out;
})();

const rng = mulberry32(42);
const norm = makeNormal(rng);

const wellSeries = WELLS.map((w) => {
  let drift = 0;
  const depth = DATES.map((_, i) => { drift += norm(0.004, 0.05); return +(w.base + 0.7 * Math.sin((Math.PI * i) / DAYS) + drift).toFixed(2); });
  return { id: w.id, depth };
});

const weather = (() => {
  const tmax = [], tmin = [], rain = [], et0 = [];
  for (let i = 0; i < DAYS; i++) {
    const tx = 84 + 6 * Math.sin((2 * Math.PI * i) / DAYS) + norm(0, 3);
    const tn = tx - (14 + norm(0, 2)); const tmean = (tx + tn) / 2;
    const r = Math.max(Math.abs(norm(0.3, 0.4)) - 0.25, 0);
    const e = Math.min(Math.max(0.0023 * 0.4 * (tmean + 17.8) * Math.sqrt(Math.max(tx - tn, 0.1)) * 10, 0.05), 0.3);
    tmax.push(+tx.toFixed(1)); tmin.push(+tn.toFixed(1)); rain.push(+r.toFixed(2)); et0.push(+e.toFixed(3));
  }
  return { tmax, tmin, rain, et0 };
})();

const meterSeries = FARMS.map((f) => {
  const base = 4600 + rng() * 800;
  const gallons = DATES.map(() => Math.max(Math.round(norm(base, 650)), 0));
  for (let k = 0; k < 2; k++) { const idx = Math.floor(rng() * DAYS); gallons[idx] = Math.round(gallons[idx] * (rng() < 0.5 ? 0.05 : 2.6)); }
  const anomaly = gallons.map((g, i) => {
    const s = gallons.slice(Math.max(0, i - 13), i + 1);
    if (s.length < 5) return false;
    const m = s.reduce((a, b) => a + b, 0) / s.length;
    const sd = Math.sqrt(s.reduce((a, b) => a + (b - m) ** 2, 0) / s.length);
    return Math.abs(g - m) > 2 * sd;
  });
  return { farm: f.id, gallons, anomaly };
});

// canonical serialization identical to src/lib/ledger.ts (for the genesis hash)
const canonical = (v) => {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
};

let out = `-- Guardian Water Bank — 003_data.sql (generated)\n-- 90 days of the deterministic series. Run AFTER 001_schema.sql + 002_seed.sql.\n-- Idempotent: re-running upserts the same values.\n\n`;

// well_readings
const wrVals = [];
for (const w of wellSeries) for (let i = 0; i < DAYS; i++) wrVals.push(`('${w.id}','${DATES[i]}',${w.depth[i]},'simulated','M')`);
out += `insert into well_readings (well_id, reading_date, depth_ft, source, tag) values\n${wrVals.join(",\n")}\non conflict (well_id, reading_date) do update set depth_ft = excluded.depth_ft;\n\n`;

// weather_daily
const wVals = [];
for (let i = 0; i < DAYS; i++) wVals.push(`('${NOAA_STATION}','${DATES[i]}',${weather.tmax[i]},${weather.tmin[i]},${weather.rain[i]},${weather.et0[i]},'simulated')`);
out += `insert into weather_daily (station, obs_date, tmax_f, tmin_f, rain_in, et0_in, rain_source) values\n${wVals.join(",\n")}\non conflict (station, obs_date) do update set tmax_f = excluded.tmax_f, tmin_f = excluded.tmin_f, et0_in = excluded.et0_in;\n\n`;

// meter_readings
const mVals = [];
for (const m of meterSeries) for (let i = 0; i < DAYS; i++) mVals.push(`('${m.farm}','${DATES[i]}',${m.gallons[i]},${m.anomaly[i]},'manual')`);
out += `insert into meter_readings (farm_id, reading_date, gallons, anomaly, source) values\n${mVals.join(",\n")}\non conflict (farm_id, reading_date) do update set gallons = excluded.gallons, anomaly = excluded.anomaly;\n\n`;

// genesis ledger entry — hash computed here, using the ledger.ts canonical form.
// ts is fixed so the hash is reproducible; uses a fixed entry_id too.
const GENESIS = "0".repeat(64);
const entry_id = "00000000-0000-4000-8000-000000000001";
const ts = "2026-08-20T00:00:00+00:00";
const payload = { note: "genesis — DB seeded from deterministic series", days: DAYS, today: TODAY };
// ts is metadata — excluded from the hash (matches src/lib/ledger.ts).
const body = canonical({ entry_id, entry_type: "observation", tag: "M", subject: "genesis", payload, actor: "seed", references_hash: null });
const hash = createHash("sha256").update(GENESIS + body).digest("hex");
out += `insert into ledger (entry_id, ts, entry_type, tag, subject, payload, actor, references_hash, prev_hash, hash)\nselect '${entry_id}','${ts}','observation','M','genesis','${JSON.stringify(payload)}'::jsonb,'seed',null,'${GENESIS}','${hash}'\nwhere not exists (select 1 from ledger);\n`;

await writeFile(outPath, out, "utf8");
console.log("wrote", outPath, "-", wrVals.length + wVals.length + mVals.length, "data rows + genesis");
