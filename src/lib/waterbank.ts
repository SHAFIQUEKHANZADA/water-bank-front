// Guardian Water Bank — types + deterministic COMPUTE logic.
// The data itself now comes from the database (see lib/data.ts); this file no
// longer generates it. Every figure still carries ONE evidence tag: M|C|E|R|V.

export type Tag = "M" | "C" | "E" | "R" | "V";

export const TAG_COLORS: Record<Tag, string> = {
  M: "#2563eb", // Measured  - blue
  C: "#0d9488", // Calculated - teal
  E: "#f59e0b", // Estimated - amber
  R: "#7c3aed", // Recommended - purple
  V: "#16a34a", // Verified  - green
};

export const TAG_MEANING: Record<Tag, string> = {
  M: "Measured — direct sensor/meter/lab/authoritative observation",
  C: "Calculated — deterministic math from identified inputs + documented formula",
  E: "Estimated — model-derived / inferred where direct measurement is absent",
  R: "Recommended — proposed action based on the available evidence",
  V: "Independently Verified — earned via independent review, never a toggle",
};

export const GAL_PER_ACRE_INCH = 27150; // IWIP approved constant
export const NOAA_STATION = "GHCND:USC00111436";
export const TODAY = "2026-08-20";

// ---- shapes (mirror the DB rows, assembled in lib/data.ts) ------------------
export interface Well { id: string; name: string; base: number; qaqc: boolean; }
export interface Farm { id: string; crop: string; stage: string; acres: number; kc: number; }
export interface WellSeries { id: string; name: string; qaqc: boolean; depth: number[]; }
export interface Weather { tmax: number[]; tmin: number[]; rain: number[]; et0: number[]; rainSource: string[]; }
export interface MeterSeries { farm: string; gallons: number[]; anomaly: boolean[]; }
export interface PolicyRule {
  rule: string; type: string; trigger: string; source: string; effective: string; appliesTo: string;
}

// Everything the dashboard needs for one render, loaded server-side from the DB.
export interface WaterData {
  dates: string[];
  wells: Well[];
  farms: Farm[];
  policyRules: PolicyRule[];
  wellSeries: WellSeries[];
  weather: Weather;
  meterSeries: MeterSeries[];
}

// ---- helpers ----
export const today = <T,>(arr: T[]): T => arr[arr.length - 1];

// ---- uncertainty (demo): every [C]/[E] figure carries a visible ± band ----
// NOT a flat rate — the crop-need band is PROPAGATED from the ETc error below.
export const UNC_ETC = 0.12;      // ET0 method (Hargreaves-Samani) + Kc (FAO-56)
export const UNC_SCENARIO = 0.20; // new high-demand user estimate

export function cropRequirement(farm: Farm, weather: Weather) {
  const et0 = today(weather.et0);
  const etc = +(et0 * farm.kc).toFixed(3);
  const etcPm = +(etc * UNC_ETC).toFixed(3);
  const effRain = +Math.min(today(weather.rain) * 0.8, etc).toFixed(3);
  const netIn = Math.max(etc - effRain, 0);
  const gal = Math.round(netIn * farm.acres * GAL_PER_ACRE_INCH);
  // Uncertainty propagated from the ETc error (etcPm), carried through the same
  // acre-inch conversion — so the crop-need band is CONSISTENT with ETc's ±12%.
  const galPm = Math.round(etcPm * farm.acres * GAL_PER_ACRE_INCH);
  return { etc, etcPm, effRain, gal, galPm };
}

export function gwTrend(wellSeries: WellSeries[], days = 7) {
  // mean depth change over last N days across wells (+ve = deepening / stress)
  const deltas = wellSeries.map((w) => {
    const n = w.depth.length;
    return w.depth[n - 1] - w.depth[n - 1 - days];
  });
  return +(deltas.reduce((a, b) => a + b, 0) / deltas.length).toFixed(2);
}

// Each stream either CORROBORATES a claim, CONFLICTS with it, or is SILENT.
// Streams do NOT vote on one question — they measure different things.
export type StreamStatus = "corroborate" | "conflict" | "silent";
export interface Stream { name: string; value: string; status: StreamStatus; tag: string; }
export interface Consensus {
  req: number; reqPm: number; etc: number; etcPm: number; effRain: number; applied: number; trend: number;
  streams: Stream[]; corroborate: number; conflictN: number; silent: number; total: number; conflict: boolean;
}

export function consensusForFarm(farm: Farm, data: WaterData): Consensus {
  const { etc, etcPm, effRain, gal: req, galPm } = cropRequirement(farm, data.weather);
  const applied = today(data.meterSeries.find((m) => m.farm === farm.id)!.gallons);
  const trend = gwTrend(data.wellSeries);
  const rain = today(data.weather.rain);
  // Claim under test: "reduce the next irrigation cycle for this farm."
  const streams: Stream[] = [
    { name: "Groundwater trend", tag: "M",
      value: trend > 0.05 ? "Falling / stressed" : "Stable / recovering",
      status: trend > 0.05 ? "corroborate" : "silent" },
    { name: "Farm meter (applied)", tag: "M",
      value: `${applied.toLocaleString()} gal applied today`,
      status: applied > req * 1.05 ? "corroborate" : applied < req * 0.95 ? "conflict" : "silent" },
    { name: "Recent precipitation", tag: "M",
      value: `${rain.toFixed(2)} in (24h)`,
      status: rain > 0.15 ? "corroborate" : "silent" },
    { name: "Crop requirement", tag: "C",
      value: `${req.toLocaleString()} ± ${galPm.toLocaleString()} gal needed`,
      status: req < applied * 0.95 ? "corroborate" : req > applied * 1.05 ? "conflict" : "silent" },
  ];
  const corroborate = streams.filter((s) => s.status === "corroborate").length;
  const conflictN = streams.filter((s) => s.status === "conflict").length;
  const silent = streams.filter((s) => s.status === "silent").length;
  // Conflict surfaces only when independent streams DISAGREE (some corroborate, some contradict).
  const conflict = corroborate > 0 && conflictN > 0;
  return { req, reqPm: galPm, etc, etcPm, effRain, applied, trend, streams, corroborate, conflictN, silent, total: streams.length, conflict };
}

export function recommendation(c: Consensus): { text: string; pct: number | null } {
  if (c.conflict) return { text: "CONFLICT DETECTED — HUMAN REVIEW REQUIRED", pct: null };
  if (c.corroborate >= 2 && c.applied > c.req)
    return { text: "Consider reducing next application by ~15%", pct: 15 };
  return { text: "Hold — no independent stream corroborates a reduction", pct: 0 };
}

// SHA-256 hash chain via Web Crypto (async) — still used client-side for the
// live [V] verification hash preview; the authoritative chain lives server-side.
export async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
