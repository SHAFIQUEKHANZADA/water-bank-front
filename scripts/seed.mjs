// One-shot migrate + seed. Run once you have DATABASE_URL set:
//   node scripts/seed.mjs
//
// It (1) applies db/001_schema.sql + db/002_seed.sql, (2) loads 90 days of the
// current deterministic series into well_readings / weather_daily / meter_readings
// so the frontend reads real DB rows, and (3) writes a genesis ledger entry.
//
// The 90-day generator mirrors src/lib/waterbank.ts EXACTLY (same mulberry32(42)
// seed and call order) so the dashboard doesn't visually jump when it switches
// from client-simulated to DB-backed.

import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set. Put it in .env / your shell and retry.");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { prepare: false });

// ── deterministic generation (ported 1:1 from src/lib/waterbank.ts) ──────────
const DAYS = 90;
const GAL_PER_ACRE_INCH = 27150;
const NOAA_STATION = "GHCND:USC00111436";
const TODAY = "2026-08-20";
const UNC_ETC = 0.12;

const WELLS = [
  { id: "CHAM-07-04B", base: 41.5 },
  { id: "CHAM-07-01A", base: 44.0 },
  { id: "CHAM-08-02A", base: 52.3 },
  { id: "CHAM-08-03A", base: 48.9 },
  { id: "CHAM-08-08A", base: 38.7 },
  { id: "MTH-22S", base: 67.9 },
];
const FARMS = [
  { id: "Farm A", kc: 1.15, acres: 120 },
  { id: "Farm B", kc: 1.05, acres: 90 },
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
    const u = Math.max(rng(), 1e-9);
    const v = rng();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}

const DATES = (() => {
  const out = [];
  const end = new Date(TODAY + "T00:00:00");
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
})();

// IMPORTANT: same call order as the module — wells, then weather, then meters.
const rng = mulberry32(42);
const norm = makeNormal(rng);

const wellSeries = WELLS.map((w) => {
  let drift = 0;
  const depth = DATES.map((_, i) => {
    drift += norm(0.004, 0.05);
    const seasonal = 0.7 * Math.sin((Math.PI * i) / DAYS);
    return +(w.base + seasonal + drift).toFixed(2);
  });
  return { id: w.id, depth };
});

const weather = (() => {
  const tmax = [], tmin = [], rain = [], et0 = [];
  for (let i = 0; i < DAYS; i++) {
    const tx = 84 + 6 * Math.sin((2 * Math.PI * i) / DAYS) + norm(0, 3);
    const tn = tx - (14 + norm(0, 2));
    const tmean = (tx + tn) / 2;
    const r = Math.max(Math.abs(norm(0.3, 0.4)) - 0.25, 0);
    const Ra = 0.4;
    const e = Math.min(
      Math.max(0.0023 * Ra * (tmean + 17.8) * Math.sqrt(Math.max(tx - tn, 0.1)) * 10, 0.05),
      0.3
    );
    tmax.push(+tx.toFixed(1)); tmin.push(+tn.toFixed(1));
    rain.push(+r.toFixed(2)); et0.push(+e.toFixed(3));
  }
  return { tmax, tmin, rain, et0 };
})();

const meterSeries = FARMS.map((f) => {
  const base = 4600 + rng() * 800;
  const gallons = DATES.map(() => Math.max(Math.round(norm(base, 650)), 0));
  for (let k = 0; k < 2; k++) {
    const idx = Math.floor(rng() * DAYS);
    gallons[idx] = Math.round(gallons[idx] * (rng() < 0.5 ? 0.05 : 2.6));
  }
  const anomaly = gallons.map((g, i) => {
    const s = gallons.slice(Math.max(0, i - 13), i + 1);
    if (s.length < 5) return false;
    const m = s.reduce((a, b) => a + b, 0) / s.length;
    const sd = Math.sqrt(s.reduce((a, b) => a + (b - m) ** 2, 0) / s.length);
    return Math.abs(g - m) > 2 * sd;
  });
  return { farm: f.id, gallons, anomaly };
});

// ── run ──────────────────────────────────────────────────────────────────────
async function applySqlFile(name) {
  const text = await readFile(join(root, "db", name), "utf8");
  await sql.unsafe(text);
  console.log(`applied ${name}`);
}

async function main() {
  await applySqlFile("001_schema.sql");
  await applySqlFile("002_seed.sql");

  // well_readings
  let wr = 0;
  for (const w of wellSeries) {
    for (let i = 0; i < DAYS; i++) {
      await sql`
        insert into well_readings (well_id, reading_date, depth_ft, source, tag)
        values (${w.id}, ${DATES[i]}, ${w.depth[i]}, 'simulated', 'M')
        on conflict (well_id, reading_date) do update set depth_ft = excluded.depth_ft
      `;
      wr++;
    }
  }
  console.log(`well_readings: ${wr}`);

  // weather_daily (rain simulated here; NOAA cron overwrites rain_in later)
  for (let i = 0; i < DAYS; i++) {
    await sql`
      insert into weather_daily (station, obs_date, tmax_f, tmin_f, rain_in, et0_in, rain_source)
      values (${NOAA_STATION}, ${DATES[i]}, ${weather.tmax[i]}, ${weather.tmin[i]},
              ${weather.rain[i]}, ${weather.et0[i]}, 'simulated')
      on conflict (station, obs_date) do update
        set tmax_f = excluded.tmax_f, tmin_f = excluded.tmin_f, et0_in = excluded.et0_in
    `;
  }
  console.log(`weather_daily: ${DAYS}`);

  // meter_readings
  let mr = 0;
  for (const m of meterSeries) {
    for (let i = 0; i < DAYS; i++) {
      await sql`
        insert into meter_readings (farm_id, reading_date, gallons, anomaly, source)
        values (${m.farm}, ${DATES[i]}, ${m.gallons[i]}, ${m.anomaly[i]}, 'manual')
        on conflict (farm_id, reading_date) do update
          set gallons = excluded.gallons, anomaly = excluded.anomaly
      `;
      mr++;
    }
  }
  console.log(`meter_readings: ${mr}`);

  // genesis ledger entry (only if the ledger is empty).
  // NOTE: hash uses the SAME canonical (sorted-key) serialization as
  // src/lib/ledger.ts, or verifyChain() would reject this entry.
  const canonical = (value) => {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  };
  const [{ count }] = await sql`select count(*)::int as count from ledger`;
  if (count === 0) {
    const GENESIS = "0".repeat(64);
    const [{ entry_id, ts }] = await sql`select gen_random_uuid() as entry_id, now()::text as ts`;
    const payload = { note: "genesis — DB seeded from deterministic series", days: DAYS, today: TODAY };
    // ts is metadata — excluded from the hash (matches src/lib/ledger.ts).
    const body = canonical({
      entry_id, entry_type: "observation", tag: "M",
      subject: "genesis", payload, actor: "seed", references_hash: null,
    });
    const hash = createHash("sha256").update(GENESIS + body).digest("hex");
    await sql`
      insert into ledger (entry_id, ts, entry_type, tag, subject, payload, actor, references_hash, prev_hash, hash)
      values (${entry_id}, ${ts}, 'observation', 'M', 'genesis', ${sql.json(payload)}, 'seed', null, ${GENESIS}, ${hash})
    `;
    console.log("ledger: genesis entry written");
  } else {
    console.log(`ledger: ${count} entries already present, skipped genesis`);
  }

  await sql.end();
  console.log("\nDone. UNC_ETC=" + UNC_ETC + ", GAL_PER_ACRE_INCH=" + GAL_PER_ACRE_INCH);
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
