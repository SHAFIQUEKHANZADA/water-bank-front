// Guardian Water Bank — data + logic layer (deterministic, browser-side).
// Real public ISWS/NOAA identifiers for structure; SIMULATED farm meters (DEMO ONLY).
// Every figure carries ONE evidence tag: M | C | E | R | V.

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

export const DAYS = 90;
export const GAL_PER_ACRE_INCH = 27150; // IWIP approved constant
export const NOAA_STATION = "CHAMPAIGN 3 S, IL (GHCND: USC00111436)";
export const TODAY = "2026-08-20";

// ---- deterministic PRNG (mulberry32) so the demo is identical every load ----
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeNormal(rng: () => number) {
  return (mean: number, sd: number) => {
    const u = Math.max(rng(), 1e-9);
    const v = rng();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}

// ---- ISWS Mahomet monitoring wells (real IDs). MTH-22S is under QA/QC. ----
export interface Well { id: string; name: string; base: number; qaqc: boolean; }
export const WELLS: Well[] = [
  { id: "CHAM-07-04B", name: "Bondville (E. Mahomet)", base: 41.5, qaqc: false },
  { id: "CHAM-07-01A", name: "Zahnd Pond / Mahomet", base: 44.0, qaqc: false },
  { id: "CHAM-08-02A", name: "Middle Fork / Mahomet", base: 52.3, qaqc: false },
  { id: "CHAM-08-03A", name: "South of Ludlow / Mahomet", base: 48.9, qaqc: false },
  { id: "CHAM-08-08A", name: "Lake of the Woods / Mahomet", base: 38.7, qaqc: false },
  { id: "MTH-22S", name: "N. Mahomet (McLean–Tazewell)", base: 67.9, qaqc: true },
];

export interface Farm { id: string; crop: string; stage: string; acres: number; kc: number; }
export const FARMS: Farm[] = [
  { id: "Farm A", crop: "Corn", stage: "Tasseling", acres: 120, kc: 1.15 },
  { id: "Farm B", crop: "Soybean", stage: "Pod fill", acres: 90, kc: 1.05 },
  { id: "Farm C", crop: "Corn", stage: "Emergence", acres: 100, kc: 0.35 },
];

// ---- date labels (most recent last) ----
export const DATES: string[] = (() => {
  const out: string[] = [];
  const end = new Date(TODAY + "T00:00:00");
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
})();

// ---- generate all series once (seeded) ----
const rng = mulberry32(42);
const norm = makeNormal(rng);

export interface WellSeries { id: string; name: string; qaqc: boolean; depth: number[]; }
export const wellSeries: WellSeries[] = WELLS.map((w) => {
  let drift = 0;
  const depth = DATES.map((_, i) => {
    drift += norm(0.004, 0.05);
    const seasonal = 0.7 * Math.sin((Math.PI * i) / DAYS);
    return +(w.base + seasonal + drift).toFixed(2);
  });
  return { id: w.id, name: w.name, qaqc: w.qaqc, depth };
});

export interface Weather { tmax: number[]; tmin: number[]; rain: number[]; et0: number[]; }
export const weather: Weather = (() => {
  const tmax: number[] = [], tmin: number[] = [], rain: number[] = [], et0: number[] = [];
  for (let i = 0; i < DAYS; i++) {
    const tx = 84 + 6 * Math.sin((2 * Math.PI * i) / DAYS) + norm(0, 3);
    const tn = tx - (14 + norm(0, 2));
    const tmean = (tx + tn) / 2;
    const r = Math.max(Math.abs(norm(0.3, 0.4)) - 0.25, 0);
    const Ra = 0.4;
    const e = Math.min(Math.max(0.0023 * Ra * (tmean + 17.8) * Math.sqrt(Math.max(tx - tn, 0.1)) * 10, 0.05), 0.3);
    tmax.push(+tx.toFixed(1)); tmin.push(+tn.toFixed(1));
    rain.push(+r.toFixed(2)); et0.push(+e.toFixed(3));
  }
  return { tmax, tmin, rain, et0 };
})();

export interface MeterSeries { farm: string; gallons: number[]; anomaly: boolean[]; }
export const meterSeries: MeterSeries[] = FARMS.map((f) => {
  const base = 4600 + rng() * 800;
  const gallons = DATES.map(() => Math.max(Math.round(norm(base, 650)), 0));
  // inject 2 anomalies
  for (let k = 0; k < 2; k++) {
    const idx = Math.floor(rng() * DAYS);
    gallons[idx] = Math.round(gallons[idx] * (rng() < 0.5 ? 0.05 : 2.6));
  }
  // anomaly flag: |x - rolling mean| > 2*rolling std (window 14)
  const anomaly = gallons.map((g, i) => {
    const s = gallons.slice(Math.max(0, i - 13), i + 1);
    if (s.length < 5) return false;
    const m = s.reduce((a, b) => a + b, 0) / s.length;
    const sd = Math.sqrt(s.reduce((a, b) => a + (b - m) ** 2, 0) / s.length);
    return Math.abs(g - m) > 2 * sd;
  });
  return { farm: f.id, gallons, anomaly };
});

// ---- helpers ----
export const today = <T,>(arr: T[]): T => arr[arr.length - 1];

// ---- uncertainty (demo): every [C]/[E] figure carries a visible ± band ----
// NOT a flat rate — the crop-need band is PROPAGATED from the ETc error below.
export const UNC_ETC = 0.12;      // ET0 method (Hargreaves-Samani) + Kc (FAO-56)
export const UNC_SCENARIO = 0.20; // new high-demand user estimate

export function cropRequirement(farm: Farm) {
  const et0 = today(weather.et0);
  const etc = +(et0 * farm.kc).toFixed(3);
  const etcPm = +(etc * UNC_ETC).toFixed(3);
  const effRain = +Math.min(today(weather.rain) * 0.8, etc).toFixed(3);
  const netIn = Math.max(etc - effRain, 0);
  const gal = Math.round(netIn * farm.acres * GAL_PER_ACRE_INCH);
  // Uncertainty propagated from the ETc error (etcPm), carried through the same
  // acre-inch conversion — so the crop-need band is CONSISTENT with ETc's ±12%,
  // not an independent hardcoded rate. (Relative % rises where effective rain
  // is subtracted, which is the correct behaviour for a difference.)
  const galPm = Math.round(etcPm * farm.acres * GAL_PER_ACRE_INCH);
  return { etc, etcPm, effRain, gal, galPm };
}

export function gwTrend(days = 7) {
  // mean depth change over last N days across wells (+ve = deepening / stress)
  const deltas = wellSeries.map((w) => w.depth[DAYS - 1] - w.depth[DAYS - 1 - days]);
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

export function consensusForFarm(farm: Farm): Consensus {
  const { etc, etcPm, effRain, gal: req, galPm } = cropRequirement(farm);
  const applied = today(meterSeries.find((m) => m.farm === farm.id)!.gallons);
  const trend = gwTrend();
  const rain = today(weather.rain);
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

export interface PolicyRule {
  rule: string; type: string; trigger: string; source: string; effective: string; appliesTo: string;
}
export const POLICY_RULES: PolicyRule[] = [
  { rule: "RULE-014", type: "Declining groundwater trend", trigger: "7-day depth change > +0.15 ft", source: "[demo policy]", effective: "2026-08-01", appliesTo: "E-Central IL demo geography" },
  { rule: "RULE-021", type: "Withdrawal threshold", trigger: "farm pumping > 2× 14-day baseline", source: "[demo policy]", effective: "2026-08-01", appliesTo: "Simulated farms A/B/C" },
  { rule: "RULE-033", type: "Conservation trigger", trigger: "drought advisory active", source: "[agency doc — TBD]", effective: "TBD", appliesTo: "TBD" },
];

// SHA-256 hash chain via Web Crypto (async)
export async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
