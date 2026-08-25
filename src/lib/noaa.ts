// NOAA CDO (Climate Data Online) rainfall feed — the first REAL [M] data stream.
// Station GHCND:USC00111436 (CHAMPAIGN 3 S, IL), which the dashboard already cites.
//
// Free token: https://www.ncdc.noaa.gov/cdo-web/token  →  env NOAA_TOKEN
// API v2 docs: https://www.ncdc.noaa.gov/cdo-web/webservices/v2
//
// GHCND data lags a few days, so the daily job pulls a rolling window and
// upserts — re-pulling recent days as they finalize.

import "server-only";
import { sql } from "./db";

export const NOAA_STATION = "GHCND:USC00111436";
const CDO_BASE = "https://www.ncei.noaa.gov/cdo-web/api/v2";

export interface NoaaDaily {
  date: string; // YYYY-MM-DD
  prcp_in: number;
}

// Fetch daily precipitation (inches) for [start, end]. Dates are YYYY-MM-DD.
export async function fetchNoaaPrecip(start: string, end: string): Promise<NoaaDaily[]> {
  const token = process.env.NOAA_TOKEN;
  if (!token) throw new Error("NOAA_TOKEN is not set");

  const url = new URL(`${CDO_BASE}/data`);
  url.searchParams.set("datasetid", "GHCND");
  url.searchParams.set("stationid", NOAA_STATION);
  url.searchParams.set("datatypeid", "PRCP");
  url.searchParams.set("startdate", start);
  url.searchParams.set("enddate", end);
  url.searchParams.set("units", "standard"); // inches
  url.searchParams.set("limit", "1000");

  const res = await fetch(url, { headers: { token }, cache: "no-store" });
  if (!res.ok) {
    throw new Error(`NOAA CDO ${res.status}: ${await res.text().catch(() => res.statusText)}`);
  }

  const json = (await res.json()) as { results?: { date: string; value: number }[] };
  const results = json.results ?? [];

  // One PRCP row per day. `date` comes back like "2026-08-20T00:00:00".
  return results.map((r) => ({ date: r.date.slice(0, 10), prcp_in: r.value }));
}

// Pull a rolling window (default last 10 days) and upsert into weather_daily,
// stamping rain_source='noaa'. Returns how many day-rows were written.
export async function syncNoaaPrecip(days = 10): Promise<{ written: number; from: string; to: string }> {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const [start, end] = [fmt(from), fmt(to)];

  const rows = await fetchNoaaPrecip(start, end);
  let written = 0;

  for (const row of rows) {
    await sql`
      insert into weather_daily (station, obs_date, rain_in, rain_source, updated_at)
      values (${NOAA_STATION}, ${row.date}, ${row.prcp_in}, 'noaa', now())
      on conflict (station, obs_date) do update
        set rain_in = excluded.rain_in,
            rain_source = 'noaa',
            updated_at = now()
    `;
    written++;
  }

  return { written, from: start, to: end };
}
