"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LineChart, BarChart } from "./Charts";
import {
  NOAA_STATION, TODAY, TAG_COLORS, TAG_MEANING,
  consensusForFarm, recommendation, cropRequirement, gwTrend, today, sha256,
  waterAccount, pumpingEnergy, DEFAULT_ENERGY, KWH_PER_ACFT_FT, GAL_PER_ACRE_INCH,
  type Tag as TagT, type Consensus, type WaterData, type WaterAccount,
} from "@/lib/waterbank";

export const PILOT_NAME = "Illinois Farm Water & Energy Pilot";
export const PILOT_TAGLINE = "Measuring irrigation water and energy, field by field.";

/* What a figure rests on: measured, modeled, or an assumption nobody has verified yet. */
type BasisT = "measured" | "simulated" | "modeled" | "assumption" | "physics";
const BASIS: Record<BasisT, { label: string; cls: string }> = {
  measured: { label: "Measured", cls: "bg-blue-50 text-blue-700 ring-blue-200" },
  simulated: { label: "Measured in pilot · SIMULATED now", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  modeled: { label: "Modeled estimate", cls: "bg-teal-50 text-teal-700 ring-teal-200" },
  assumption: { label: "Unverified assumption", cls: "bg-rose-50 text-rose-700 ring-rose-200" },
  physics: { label: "Physical constant", cls: "bg-slate-100 text-slate-600 ring-slate-200" },
};
function Basis({ b }: { b: BasisT }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset align-middle ${BASIS[b].cls}`}>{BASIS[b].label}</span>;
}
type GateT = "go" | "nogo" | "inconclusive" | "pending";
const GATE: Record<GateT, { label: string; cls: string }> = {
  go: { label: "GO", cls: "bg-emerald-600 text-white" },
  nogo: { label: "NO-GO", cls: "bg-rose-600 text-white" },
  inconclusive: { label: "INCONCLUSIVE", cls: "bg-amber-500 text-white" },
  pending: { label: "NOT YET EVALUABLE", cls: "bg-slate-200 text-slate-700" },
};
function Gate({ g }: { g: GateT }) {
  return <span className={`inline-block rounded-md px-2.5 py-1 text-[11px] font-bold tracking-wide ${GATE[g].cls}`}>{GATE[g].label}</span>;
}

/* ---------- atoms ---------- */
function Tag({ t }: { t: TagT }) {
  return <span title={TAG_MEANING[t]} className="inline-block rounded px-1.5 py-0.5 text-[11px] font-bold text-white align-middle" style={{ background: TAG_COLORS[t] }}>[{t}]</span>;
}
function Counter({ value, decimals = 0, suffix = "", prefix = "" }: { value: number; decimals?: number; suffix?: string; prefix?: string }) {
  // Seed with the real value so the server-rendered / pre-hydration HTML shows
  // the true number (a scraper or slow hydrate never sees a "0" placeholder);
  // the count-up animation is a client-only enhancement that runs after mount.
  const [v, setV] = useState(value);
  useEffect(() => {
    let raf = 0; const start = performance.now(), dur = 700;
    setV(0);
    const tick = (t: number) => { const p = Math.min((t - start) / dur, 1); setV(value * (1 - Math.pow(1 - p, 3))); if (p < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [value]);
  const shown = decimals > 0 ? v.toFixed(decimals) : Math.round(v).toLocaleString();
  return <>{prefix}{shown}{suffix}</>;
}
function Card({ label, tag, accent, sub, children }: { label: string; tag?: TagT; accent: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md" style={{ borderTop: `3px solid ${accent}` }}>
      <div className="flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">{label} {tag && <Tag t={tag} />}</div>
      <div className="mt-1.5 text-2xl font-extrabold text-slate-900">{children}</div>
      {sub && <div className="mt-0.5 text-[11px] font-medium text-slate-400">{sub}</div>}
    </div>
  );
}

/* ---------- icons (inline SVG, single consistent line set) ---------- */
const ICONS: Record<string, React.ReactNode> = {
  overview: <><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>,
  farms: <><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M12 11h4M12 16h4M8 11h.01M8 16h.01" /></>,
  evidence: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></>,
  whatif: <><line x1="4" x2="4" y1="21" y2="14" /><line x1="4" x2="4" y1="10" y2="3" /><line x1="12" x2="12" y1="21" y2="12" /><line x1="12" x2="12" y1="8" y2="3" /><line x1="20" x2="20" y1="21" y2="16" /><line x1="20" x2="20" y1="12" y2="3" /><line x1="1" x2="7" y1="14" y2="14" /><line x1="9" x2="15" y1="8" y2="8" /><line x1="17" x2="23" y1="16" y2="16" /></>,
  policy: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" /></>,
  ledger: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>,
  export: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></>,
  reset: <><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></>,
  droplet: <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />,
  warning: <><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" x2="12" y1="9" y2="13" /><line x1="12" x2="12.01" y1="17" y2="17" /></>,
  check: <polyline points="20 6 9 17 4 12" />,
  play: <><circle cx="12" cy="12" r="10" /><polygon points="10 8 16 12 10 16 10 8" /></>,
  close: <><line x1="18" x2="6" y1="6" y2="18" /><line x1="6" x2="18" y1="6" y2="18" /></>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></>,
  accounting: <><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" /><path d="M8 14h8" /></>,
  gate: <><path d="M4 21V4" /><path d="M4 4h12l-2 4 2 4H4" /></>,
};
function Icon({ name, className = "h-5 w-5" }: { name: keyof typeof ICONS | string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {ICONS[name]}
    </svg>
  );
}
// small colored status dot for stream corroborate/conflict/silent
function Dot({ color }: { color: string }) {
  return <span className="inline-block h-2 w-2 shrink-0 rounded-full align-middle" style={{ background: color }} />;
}

interface LedgerRow { version: number; timestamp: string; actor: string; source: string; action: string; ev: string; value: string; decision: string; prev: string; hash: string; }

// DB ledger entry (from /api/ledger) → the display row the table renders.
const GENESIS_HASH = "0".repeat(64);
interface DbEntry { seq: string | number; ts: string; entry_type: string; tag: string; subject: string; payload: Record<string, unknown> | null; actor: string; prev_hash: string; hash: string; }
function mapEntry(e: DbEntry): LedgerRow {
  const p = e.payload ?? {};
  const ts = typeof e.ts === "string" ? e.ts : "";
  const str = (v: unknown) => (v == null ? "" : String(v));
  return {
    version: Number(e.seq),
    timestamp: ts ? `${ts.slice(0, 10)} ${ts.slice(11, 16)}` : "",
    actor: e.actor,
    source: str(p.source) || e.subject,
    action: str(p.action) || e.entry_type,
    ev: e.tag,
    value: str(p.value ?? p.note),
    decision: str(p.decision),
    prev: e.prev_hash === GENESIS_HASH ? "GENESIS" : String(e.prev_hash).slice(0, 14) + "…",
    hash: e.hash,
  };
}
const NAV = [
  { id: "Overview", icon: "overview" }, { id: "Farms & Decisions", icon: "farms" },
  { id: "Water Accounting", icon: "accounting" }, { id: "Go / No-Go", icon: "gate" }, { id: "Evidence", icon: "evidence" },
  { id: "What-if", icon: "whatif" }, { id: "Policy", icon: "policy" }, { id: "Audit Ledger", icon: "ledger" }, { id: "Export", icon: "export" },
] as const;
type TabId = (typeof NAV)[number]["id"];
const DECISION_STYLE: Record<string, string> = {
  Approve: "bg-emerald-600 hover:bg-emerald-500", Modify: "bg-blue-600 hover:bg-blue-500",
  Delay: "bg-amber-500 hover:bg-amber-400", Reject: "bg-rose-600 hover:bg-rose-500",
};

export default function Dashboard({ data }: { data: WaterData }) {
  const { dates: DATES, farms: FARMS, wells: WELLS, wellSeries, weather, meterSeries, policyRules: POLICY_RULES } = data;

  const [tab, setTab] = useState<TabId>("Overview");
  const [decisions, setDecisions] = useState<Record<string, string>>({});
  const [verified, setVerified] = useState<Record<string, { reviewer: string; org: string; note: string; date: string; hash: string }>>({});
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [dcM, setDcM] = useState(1);
  const [selFarm, setSelFarm] = useState(FARMS[0].id);
  const [rev, setRev] = useState({ reviewer: "", org: "", note: "" });
  // "How to read this dashboard" explainer video (public/how-to-read.mp4).
  const [showVideo, setShowVideo] = useState(false);
  useEffect(() => {
    if (!showVideo) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowVideo(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showVideo]);

  const consByFarm = useMemo(() => { const o: Record<string, Consensus> = {}; FARMS.forEach((f) => (o[f.id] = consensusForFarm(f, data))); return o; }, [FARMS, data]);
  const acctByFarm = useMemo(() => { const o: Record<string, WaterAccount> = {}; FARMS.forEach((f) => (o[f.id] = waterAccount(f, data))); return o; }, [FARMS, data]);

  // The ledger is authoritative in the DB (append-only, SHA-256 chained). Load
  // it on mount and after every write — it persists across refreshes now.
  const refetchLedger = useCallback(async () => {
    try {
      const r = await fetch("/api/ledger", { cache: "no-store" });
      const j = await r.json();
      const rows: LedgerRow[] = (j.entries ?? []).map(mapEntry).sort((a: LedgerRow, b: LedgerRow) => a.version - b.version);
      setLedger(rows);
    } catch { /* keep prior rows on transient failure */ }
  }, []);
  useEffect(() => { refetchLedger(); }, [refetchLedger]);

  async function postEntry(body: Record<string, unknown>) {
    await fetch("/api/ledger", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    await refetchLedger();
  }
  async function decide(farm: string, choice: string, recText: string) {
    setDecisions((d) => ({ ...d, [farm]: choice }));
    await postEntry({ entry_type: "recommendation", tag: "R", subject: farm, actor: "Farmer", payload: { source: farm, action: `Decision: ${choice}`, value: recText, decision: choice } });
  }
  async function verify(farm: string) {
    if (!rev.reviewer || !rev.org) return;
    const hash = (await sha256(`REVIEW|${farm}|${rev.reviewer}|${rev.org}|${rev.note}`)).slice(0, 16);
    setVerified((v) => ({ ...v, [farm]: { ...rev, date: TODAY, hash } }));
    await postEntry({ entry_type: "review", tag: "V", subject: farm, actor: `${rev.reviewer} (${rev.org})`, payload: { source: farm, action: "Independent review", value: "claim verified", decision: rev.note || "—" } });
    setRev({ reviewer: "", org: "", note: "" });
  }
  // The chain is immutable in the DB — "reset" only clears the local decision
  // UI and reloads the true chain (it cannot delete history).
  function resetDemo() { setDecisions({}); setVerified({}); refetchLedger(); }

  const gwNow = wellSeries.reduce((a, w) => a + today(w.depth), 0) / wellSeries.length;
  const gwChg = gwTrend(wellSeries);
  const pumpToday = meterSeries.reduce((a, m) => a + today(m.gallons), 0);
  const totalReq = FARMS.reduce((a, f) => a + cropRequirement(f, weather).gal, 0);
  const totalReqPm = FARMS.reduce((a, f) => a + cropRequirement(f, weather).galPm, 0);
  const alerts = meterSeries.filter((m) => today(m.anomaly)).length;
  const conflictsFlagged = FARMS.filter((f) => consByFarm[f.id].conflict).length;
  const noaaDays = weather.rainSource.filter((s) => s === "noaa").length;
  const rainIsNoaa = today(weather.rainSource) === "noaa";

  // Period totals for water accounting and the modeled energy estimate.
  const acctDays = Math.min(...FARMS.map((f) => acctByFarm[f.id].days));
  const totAppliedGal = FARMS.reduce((a, f) => a + acctByFarm[f.id].appliedGal, 0);
  const totIrrigEtGal = FARMS.reduce((a, f) => a + acctByFarm[f.id].irrigEtGal, 0);
  const energy = pumpingEnergy(totAppliedGal, gwNow);
  const periodRain = weather.rain.slice(-acctDays).reduce((a, b) => a + b, 0);
  const periodEt0 = weather.et0.slice(-acctDays).reduce((a, b) => a + b, 0);
  // Cumulative applied vs irrigation-supplied crop ET, all farms (gallons).
  const cum = useMemo(() => {
    const n = acctDays; const applied: number[] = []; const used: number[] = [];
    let a = 0, u = 0;
    for (let k = 0; k < n; k++) {
      const i = weather.et0.length - n + k;
      FARMS.forEach((f) => {
        const g = meterSeries.find((m) => m.farm === f.id)!.gallons; a += g[g.length - n + k];
        const etc = weather.et0[i] * f.kc; u += Math.max(etc - Math.min(weather.rain[i] * 0.8, etc), 0) * f.acres * GAL_PER_ACRE_INCH;
      });
      applied.push(Math.round(a)); used.push(Math.round(u));
    }
    return { labels: DATES.slice(-n), applied, used };
  }, [acctDays, FARMS, meterSeries, weather, DATES]);

  function download(name: string, text: string, type = "text/plain") {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
  }
  const panel = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";

  return (
    <div className="flex min-h-screen bg-slate-100 text-slate-700">
      {/* sidebar */}
      <aside className="sticky top-0 flex h-screen w-16 shrink-0 flex-col border-r border-slate-200 bg-white md:w-64">
        <div className="flex items-center gap-2.5 border-b border-slate-200 px-4 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white"><Icon name="droplet" className="h-5 w-5" /></div>
          <div className="hidden md:block">
            <div className="text-sm font-bold leading-tight text-slate-900">{PILOT_NAME}</div>
            <div className="text-[11px] text-slate-500">Phase 1: Mahomet Aquifer</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-2">
          {NAV.map((it) => (
            <button key={it.id} onClick={() => setTab(it.id)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${tab === it.id ? "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"}`}>
              <Icon name={it.icon} className="h-[18px] w-[18px] shrink-0" /><span className="hidden md:inline">{it.id}</span>
            </button>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-2">
          <button onClick={resetDemo} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-500 transition hover:bg-rose-50 hover:text-rose-600">
            <Icon name="reset" className="h-[18px] w-[18px] shrink-0" /><span className="hidden md:inline">Reset demo</span>
          </button>
        </div>
      </aside>

      {/* content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* topbar */}
        <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-6 py-3 backdrop-blur">
          <div>
            <h1 className="text-lg font-bold text-slate-900">{tab}</h1>
            <p className="text-xs text-slate-500">{PILOT_TAGLINE} <b className="text-slate-700">Phase 1: Mahomet Aquifer.</b></p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <button onClick={() => setShowVideo(true)} className="flex items-center gap-1.5 rounded-full bg-blue-600 px-3 py-1.5 font-semibold text-white shadow-sm transition hover:bg-blue-500">
              <Icon name="play" className="h-4 w-4" />How to read this · 5 min
            </button>
            <span className="flex items-center gap-1.5 text-slate-500"><span className="pulse-dot inline-block h-2 w-2 rounded-full bg-emerald-500" /> Live · synced {TODAY} 08:45</span>
            <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 font-bold tracking-wide text-amber-700">RESEARCH PROTOTYPE</span>
          </div>
        </header>

        <div className="mx-auto w-full max-w-7xl px-6">
          {/* tag legend */}
          <div className="flex flex-wrap items-center gap-2 pt-4 text-xs text-slate-500">
            Evidence tags:{(["M", "C", "E", "R", "V"] as TagT[]).map((t) => <Tag key={t} t={t} />)}
            <span className="text-slate-400">— one tag per figure, never blended.</span>
          </div>
          <p className="pt-2 text-xs text-slate-500">An independent, evidence-based agricultural research pilot testing whether measurable gains in irrigation efficiency produce verifiable water and energy benefits, and what they are worth. <b className="text-slate-700">Not a water banking or water trading program.</b></p>

          {/* cards */}
          <div className="grid grid-cols-2 gap-3 py-4 sm:grid-cols-4 lg:grid-cols-7">
            <Card label="Groundwater" tag="M" accent="#2563eb"><Counter value={gwNow} decimals={1} suffix=" ft" /></Card>
            <Card label="7-day change" tag="M" accent="#2563eb"><Counter value={gwChg} decimals={2} suffix=" ft" prefix={gwChg >= 0 ? "+" : ""} /></Card>
            <Card label="Pumping today" tag="M" accent="#2563eb"><Counter value={pumpToday} suffix=" gal" /></Card>
            <Card label="Est. crop need" tag="C" accent="#0d9488" sub={`± ${totalReqPm.toLocaleString()} gal · from ETc ±12%`}><Counter value={totalReq} suffix=" gal" /></Card>
            <Card label="Rainfall 24h" tag="M" accent="#2563eb" sub={rainIsNoaa ? "live from NOAA" : "simulated"}><Counter value={today(weather.rain)} decimals={2} suffix=" in" /></Card>
            <Card label="Conflicts to review" accent={conflictsFlagged ? "#d97706" : "#16a34a"} sub="claims where streams disagree"><Counter value={conflictsFlagged} /></Card>
            <Card label="Active alerts" accent={alerts ? "#e11d48" : "#16a34a"}><Counter value={alerts} /></Card>
          </div>

          <main key={tab} className="fade-up pb-10">
            {tab === "Overview" && (
              <section className="space-y-5">
                <div className={panel}>
                  <h2 className="mb-1 font-semibold text-slate-900">Groundwater — ISWS monitoring wells (real IDs) <Tag t="M" /></h2>
                  <p className="mb-3 text-xs text-slate-500">NOAA station: {NOAA_STATION} · hover the chart for values</p>
                  <LineChart invertBand height={210} labels={DATES} unit=" ft" series={wellSeries.map((w, i) => ({ name: w.id + (w.qaqc ? " ⚠QA/QC" : ""), data: w.depth, color: ["#2563eb", "#0d9488", "#d97706", "#db2777", "#7c3aed", "#0891b2"][i % 6] }))} />
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className={panel}>
                    <h3 className="mb-2 text-sm font-semibold text-slate-900">Daily pumping — all farms <Tag t="M" /> <span className="text-[11px] text-amber-600">SIMULATED — DEMO ONLY</span></h3>
                    <BarChart height={180} unit=" gal" series={meterSeries.map((m, i) => ({ name: m.farm, data: m.gallons, color: ["#2563eb", "#0d9488", "#d97706"][i] }))} />
                  </div>
                  <div className={panel}>
                    <h3 className="mb-1 text-sm font-semibold text-slate-900">Rainfall <Tag t="M" /> &amp; ET₀ <Tag t="C" /></h3>
                    <p className="mb-2 text-[11px] text-slate-500">{noaaDays > 0
                      ? <><span className="font-semibold text-blue-600">{noaaDays} recent day{noaaDays !== 1 ? "s" : ""} live from NOAA</span> · {NOAA_STATION} · earlier days simulated</>
                      : <>simulated · NOAA feed pending</>}</p>
                    <LineChart height={180} area labels={DATES} unit=" in" series={[{ name: "Rain (in)", data: weather.rain, color: "#2563eb" }, { name: "ET₀ (in)", data: weather.et0, color: "#f59e0b" }]} />
                  </div>
                </div>
                <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800"><Icon name="warning" className="mt-0.5 h-4 w-4 shrink-0" /><span>MTH-22S data are under ISWS QA/QC — shown with a provenance warning and <b>never marked [V]</b> in this prototype.</span></div>
              </section>
            )}

            {tab === "Farms & Decisions" && (
              <section className="space-y-4">
                <p className="text-sm text-slate-500">Recommend, but the farmer decides. Each response is written to the audit ledger. <span className="text-amber-600">SIMULATED DATA — DEMO ONLY.</span></p>
                {FARMS.map((f) => {
                  const c = consByFarm[f.id]; const rec = recommendation(c);
                  return (
                    <div key={f.id} className={`${panel} transition hover:border-slate-300`}>
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-[280px] flex-1">
                          <h3 className="text-lg font-bold text-slate-900">{f.id} — {f.crop} ({f.stage}), {f.acres} ac</h3>
                          <p className="mt-1 text-sm text-slate-600">Meter today <Tag t="M" /> <b className="text-slate-900">{c.applied.toLocaleString()} gal</b> · Crop need <Tag t="C" /> <b className="text-slate-900">{c.req.toLocaleString()} ± {c.reqPm.toLocaleString()} gal</b> · ETc <Tag t="C" /> {c.etc} ± {c.etcPm} in</p>
                          {(() => { const a = acctByFarm[f.id]; return (
                            <p className="mt-1 text-sm text-slate-600">Last {a.days} days: applied <Tag t="M" /> <b className="text-slate-900">{a.appliedIn} in</b> · consumed by crop (ET) <Tag t="C" /> <b className="text-slate-900">{a.cropEtIn} ± {a.cropEtPm} in</b>, of which irrigation supplied <b className="text-slate-900">{a.irrigEtIn} in</b> <span className="text-slate-400">(difference not counted as groundwater savings)</span></p>
                          ); })()}
                          {c.conflict ? (
                            <p className="mt-2 flex items-center gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700"><Icon name="warning" className="h-4 w-4 shrink-0" />CONFLICT DETECTED — HUMAN REVIEW REQUIRED (independent streams disagree)</p>
                          ) : (
                            <p className="mt-2 text-sm text-slate-600">Evidence: <b className="text-slate-900">{c.corroborate} corroborate</b> · {c.conflictN} conflict · {c.silent} silent <span className="text-slate-400">(of {c.total} independent streams)</span></p>
                          )}
                          <p className="mt-2 text-sm"><Tag t="R" /> <b className="text-purple-700">{rec.text}</b> <span className="text-slate-400">(DEMO POLICY RULE / TEST SCENARIO — not scientific truth)</span></p>
                        </div>
                        <div>
                          <p className="mb-1.5 text-xs font-semibold uppercase text-slate-500">Farmer decision</p>
                          <div className="flex gap-2">
                            {["Approve", "Modify", "Delay", "Reject"].map((ch) => (
                              <button key={ch} onClick={() => decide(f.id, ch, rec.text)} className={`rounded-lg px-3.5 py-2 text-sm font-semibold text-white transition ${decisions[f.id] === ch ? DECISION_STYLE[ch] + " ring-2 ring-slate-900/30" : DECISION_STYLE[ch] + " opacity-80 hover:opacity-100 hover:-translate-y-0.5"}`}>{ch}</button>
                            ))}
                          </div>
                          {decisions[f.id] && <p className="mt-2 flex items-center gap-1 text-xs font-medium text-emerald-600"><Icon name="check" className="h-3.5 w-3.5" />Logged: {decisions[f.id]} → ledger</p>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </section>
            )}

            {tab === "Water Accounting" && (
              <section className="space-y-5">
                <div className={panel}>
                  <h2 className="font-semibold text-slate-900">Applied water vs. ET consumptive use — last {acctDays} days</h2>
                  <p className="mt-1 text-sm text-slate-600">Water <b>applied</b> to a field and water the crop actually <b>consumed</b> (evapotranspiration, ET) are reported side by side. The difference between them is <b>not</b> assumed to be groundwater savings.</p>
                  <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-xs text-slate-500"><tr>
                        <th className="px-3 py-2">Farm</th>
                        <th className="px-3 py-2">Applied <Tag t="M" /><div className="mt-1"><Basis b="simulated" /></div></th>
                        <th className="px-3 py-2">Crop ET (total consumed) <Tag t="C" /><div className="mt-1"><Basis b="modeled" /></div></th>
                        <th className="px-3 py-2">Effective rain <Tag t="C" /></th>
                        <th className="px-3 py-2">ET supplied by irrigation <Tag t="C" /></th>
                        <th className="px-3 py-2">Applied but not consumed<div className="mt-1 font-normal text-slate-400">fate unknown</div></th>
                      </tr></thead>
                      <tbody>{FARMS.map((f) => { const a = acctByFarm[f.id]; return (
                        <tr key={f.id} className="border-t border-slate-100 hover:bg-slate-50">
                          <td className="px-3 py-2 font-semibold text-slate-900">{f.id} <span className="font-normal text-slate-500">· {f.crop}, {f.acres} ac</span></td>
                          <td className="px-3 py-2"><b className="text-slate-900">{a.appliedIn} in</b><div className="text-[11px] text-slate-400">{a.appliedGal.toLocaleString()} gal</div></td>
                          <td className="px-3 py-2"><b className="text-slate-900">{a.cropEtIn} in</b><div className="text-[11px] text-slate-400">± {a.cropEtPm} in (ETc method)</div></td>
                          <td className="px-3 py-2">{a.effRainIn} in</td>
                          <td className="px-3 py-2"><b className="text-slate-900">{a.irrigEtIn} in</b><div className="text-[11px] text-slate-400">{a.irrigEtGal.toLocaleString()} gal</div></td>
                          <td className="px-3 py-2 text-slate-600">{a.notConsumedIn >= 0 ? `${a.notConsumedIn} in` : <span className="text-amber-700">none — applied is below ET supplied by irrigation</span>}</td>
                        </tr>); })}</tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400">Depth over the field (in) = gallons ÷ (acres × 27,150). Crop ET = ET₀ (Hargreaves-Samani) × Kc (FAO-56). Effective rain = 80% of daily rain, capped at that day&apos;s crop ET.</p>
                  {FARMS.some((f) => acctByFarm[f.id].notConsumedIn < 0) && (
                    <p className="mt-2 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800"><Icon name="warning" className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span><b>Demo data limitation, not a finding:</b> the simulated farm meters record far less water than the crops consumed from irrigation. Real metered pumping replaces them when the pilot begins; until then the applied column shows how the accounting works, not real farm use.</span></p>
                  )}
                </div>
                <div className={panel}>
                  <h3 className="mb-2 text-sm font-semibold text-slate-900">Cumulative, all farms: applied <Tag t="M" /> vs. ET supplied by irrigation <Tag t="C" /> <span className="text-[11px] text-amber-600">APPLIED IS SIMULATED — DEMO ONLY</span></h3>
                  <LineChart height={200} area labels={cum.labels} unit=" M gal" series={[{ name: "Applied", data: cum.applied.map((v) => +(v / 1e6).toFixed(2)), color: "#2563eb" }, { name: "ET supplied by irrigation", data: cum.used.map((v) => +(v / 1e6).toFixed(2)), color: "#0d9488" }]} />
                </div>
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                  <p className="flex items-center gap-2 font-semibold"><Icon name="warning" className="h-4 w-4 shrink-0" />Why &quot;applied but not consumed&quot; is not reported as water saved</p>
                  <ul className="mt-2 list-disc space-y-1 pl-6">
                    <li>On the sandy, unconfined soils of the Mahomet outcrop, much of the water applied beyond crop use drains back down to the aquifer.</li>
                    <li>Near the Illinois and Sangamon rivers, groundwater left in place largely leaves as river baseflow within months, so the benefit is better described as reduced streamflow depletion in summer than as stored water.</li>
                    <li>The measurable benefits of using less water may be pumping energy and reduced nitrate leaching. Deep percolation and nitrate need below-root-zone soil moisture or soil nitrate measurements before they can be reported.</li>
                  </ul>
                </div>
              </section>
            )}

            {tab === "Go / No-Go" && (() => {
              const assumptions: { name: string; value: string; b: BasisT; note: string }[] = [
                { name: "Depth to water", value: `${gwNow.toFixed(1)} ft`, b: "measured", note: "Mean of the ISWS monitoring wells on the Overview." },
                { name: "Pumping drawdown", value: `${DEFAULT_ENERGY.drawdownFt} ft`, b: "assumption", note: "Replace with each well's pump test." },
                { name: "System pressure head", value: `${DEFAULT_ENERGY.pressureFt} ft (≈30 psi)`, b: "assumption", note: "Replace with each pivot's operating pressure." },
                { name: "Pumping plant efficiency", value: `${Math.round(DEFAULT_ENERGY.plantEfficiency * 100)}%`, b: "assumption", note: "Replace with a pump efficiency test." },
                { name: "Electricity price", value: `$${DEFAULT_ENERGY.pricePerKwh.toFixed(2)}/kWh`, b: "assumption", note: "Replace with each farm's tariff." },
                { name: "Energy to lift water", value: `${KWH_PER_ACFT_FT} kWh per acre-ft per ft`, b: "physics", note: "At 100% efficiency." },
              ];
              return (
                <section className="space-y-5">
                  <div className={panel}>
                    <h2 className="font-semibold text-slate-900">Go / No-Go framework</h2>
                    <p className="mt-1 text-sm text-slate-600">Water and energy are assessed <b>separately</b>, then combined into one economic feasibility decision. Pass or fail rests only on what can be measured: <b>applied water</b> and <b>pumping energy</b>. Yield is reported with its uncertainty but is <b>never used for pass/fail</b>, because a plausible yield effect is smaller than yield-monitor error and the normal difference between paired fields.</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">Possible outcomes: <Gate g="go" /> <Gate g="nogo" /> <Gate g="inconclusive" /> <Gate g="pending" /></div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">Every input is labeled: <Basis b="measured" /> <Basis b="simulated" /> <Basis b="modeled" /> <Basis b="assumption" /></div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className={panel}>
                      <div className="flex items-start justify-between gap-3"><h3 className="font-semibold text-slate-900">1. Water assessment</h3><Gate g="pending" /></div>
                      <p className="mt-2 text-sm text-slate-600"><b>Measures:</b> change in applied water on treatment fields vs. their paired control fields (difference-in-differences, weather-normalized), reported next to ET consumptive use.</p>
                      <p className="mt-2 text-sm text-slate-600"><b>Passes when:</b> treatment fields apply less water than their controls by at least the agreed threshold. A lower applied total is reported as water applied, not as groundwater saved.</p>
                      <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
                        <div className="text-xs font-semibold uppercase text-slate-500">Prototype reading · last {acctDays} days, all farms</div>
                        <div className="mt-1">Applied <Tag t="M" /> <b className="text-slate-900">{totAppliedGal.toLocaleString()} gal</b> <Basis b="simulated" /></div>
                        <div className="mt-1">ET supplied by irrigation <Tag t="C" /> <b className="text-slate-900">{totIrrigEtGal.toLocaleString()} gal</b> <Basis b="modeled" /></div>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">Not yet evaluable: farm meters are simulated and there are no paired control fields yet. Evaluation starts with metered pilot data.</p>
                    </div>

                    <div className={panel}>
                      <div className="flex items-start justify-between gap-3"><h3 className="font-semibold text-slate-900">2. Energy assessment</h3><Gate g="pending" /></div>
                      <p className="mt-2 text-sm text-slate-600"><b>Measures:</b> pumping electricity (kWh) from pump meters or utility bills on treatment vs. control fields.</p>
                      <p className="mt-2 text-sm text-slate-600"><b>Passes when:</b> treatment fields use less pumping energy than their controls by at least the agreed threshold.</p>
                      <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
                        <div className="text-xs font-semibold uppercase text-slate-500">Prototype estimate · last {acctDays} days, all farms</div>
                        <div className="mt-1">Pumping energy <Tag t="E" /> <b className="text-slate-900">{energy.kwh.toLocaleString()} kWh</b> ≈ <b className="text-slate-900">${energy.cost.toLocaleString()}</b> <Basis b="modeled" /></div>
                        <div className="mt-1 text-[11px] text-slate-500">{energy.acFt} acre-ft × {energy.liftFt} ft total lift × {KWH_PER_ACFT_FT} ÷ {DEFAULT_ENERGY.plantEfficiency} efficiency</div>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">Not yet evaluable: no metered energy data. The estimate rests on simulated pumping and the assumptions below.</p>
                    </div>
                  </div>

                  <div className={panel}>
                    <h4 className="mb-2 text-sm font-semibold text-slate-900">Energy estimate inputs</h4>
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-xs text-slate-500"><tr>{["Input", "Value", "Basis", "To replace it"].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
                        <tbody>{assumptions.map((a) => (<tr key={a.name} className="border-t border-slate-100"><td className="px-3 py-2 font-medium text-slate-900">{a.name}</td><td className="px-3 py-2">{a.value}</td><td className="px-3 py-2"><Basis b={a.b} /></td><td className="px-3 py-2 text-xs text-slate-500">{a.note}</td></tr>))}</tbody>
                      </table>
                    </div>
                  </div>

                  <div className={panel}>
                    <div className="flex items-start justify-between gap-3"><h3 className="font-semibold text-slate-900">3. Combined economic feasibility decision</h3><Gate g="pending" /></div>
                    <ul className="mt-2 list-disc space-y-1 pl-6 text-sm text-slate-600">
                      <li><b>Go</b> requires both the water and the energy assessments to pass on measured data.</li>
                      <li><b>Economic value</b> is then calculated from measured savings: energy saved × each farm&apos;s tariff, against the documented program cost.</li>
                      <li><b>Yield:</b> reported with its uncertainty, excluded from the decision.</li>
                      <li><b>Water:</b> reported in physical units (applied, consumed). It is not given a dollar value as stored groundwater.</li>
                      <li><b>Thresholds</b> for each assessment will be agreed with independent reviewers before the season starts.</li>
                    </ul>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                      <p className="font-semibold">Wet season rule (set in advance)</p>
                      <p className="mt-1">If rain covers most of the crop&apos;s water need, both fields in a pair irrigate very little and no treatment effect can show. That season is reported as <b>Inconclusive</b>, not No-Go.</p>
                      <p className="mt-2 text-xs">Last {acctDays} days: rain <Tag t="M" /> {periodRain.toFixed(1)} in vs. reference ET₀ <Tag t="C" /> {periodEt0.toFixed(1)} in.</p>
                    </div>
                    <div className="rounded-lg border border-slate-300 bg-slate-50 p-4 text-sm text-slate-700">
                      <p className="font-semibold">Where results apply</p>
                      <p className="mt-1">Phase 1 covers the sandy, unconfined Mahomet outcrop. Results are not extended to confined settings or bedrock-aquifer areas, and no statewide figure is reported until there is at least one dry season of data. Scaling across Illinois is evaluated by soil and aquifer setting.</p>
                    </div>
                  </div>
                </section>
              );
            })()}

            {tab === "Evidence" && (() => {
              const c = consByFarm[selFarm];
              return (
                <section className="space-y-4">
                  <p className="text-sm text-slate-500">Sources are kept SEPARATE, with agreement/conflict shown per claim. Different measurements are NOT averaged together.</p>
                  <select value={selFarm} onChange={(e) => setSelFarm(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900">{FARMS.map((f) => <option key={f.id}>{f.id}</option>)}</select>
                  <div className={panel}>
                    <h3 className="text-lg font-semibold text-slate-900">Claim: <i>reduce next irrigation for {selFarm}?</i></h3>
                    <p className="mt-1 text-sm text-slate-600">
                      {c.corroborate > 0
                        ? <>Evidence supports this recommendation — <b className="text-slate-900">{c.corroborate} independent stream{c.corroborate > 1 ? "s" : ""} corroborate</b>, {c.conflictN} conflict, {c.silent} silent.</>
                        : c.conflictN > 0
                          ? <>No stream corroborates a reduction, and <b className="text-slate-900">{c.conflictN} actively contradict{c.conflictN > 1 ? "" : "s"} it</b> — recommendation is to hold. {c.silent} silent.</>
                          : <>No independent stream corroborates a reduction — the streams are <b className="text-slate-900">silent</b> on this claim (not voting against it).</>}
                      {" "}{c.conflict
                        ? <span className="font-semibold text-red-600"><Dot color="#dc2626" /> CONFLICT — human review</span>
                        : c.conflictN > 0
                          ? <span className="font-semibold text-amber-600"><Dot color="#d97706" /> {c.conflictN} stream{c.conflictN > 1 ? "s" : ""} contradict — reduction not supported</span>
                          : <span className="text-emerald-600"><Dot color="#16a34a" /> no conflict</span>}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">Streams are not averaged and do not tally votes — each stream corroborates, conflicts, or stays silent on this specific claim.</p>
                    <div className="mt-3 space-y-2">
                      {c.streams.map((s) => (
                        <details key={s.name} className="group rounded-lg border border-slate-200 bg-slate-50 p-3 transition hover:border-slate-300">
                          <summary className="cursor-pointer text-sm text-slate-700"><Dot color={s.status === "corroborate" ? "#16a34a" : s.status === "conflict" ? "#dc2626" : "#94a3b8"} /> <span className="font-medium">{s.status === "corroborate" ? "corroborates" : s.status === "conflict" ? "conflicts" : "silent"}</span> · <b>{s.name}</b> [{s.tag}] — {s.value}</summary>
                          <div className="mt-2 text-xs text-slate-500"><b>Where did this come from?</b>{" "}
                            {s.name.includes("Groundwater") && `ISWS Groundwater Monitoring Network (real well IDs). 7-day mean change: ${c.trend >= 0 ? "+" : ""}${c.trend} ft. Class: [M].`}
                            {s.name.includes("meter") && "Farm flow meter — SIMULATED, DEMO ONLY. Applied vs calculated need (ETc × acres × 27,150). [M]/[C]."}
                            {s.name.includes("precip") && `NOAA ${NOAA_STATION}. Station data — not a farm-specific measurement. [M].`}
                            {s.name.includes("Crop") && "FAO-56 crop coefficient × Hargreaves-Samani ET₀ × acreage. Inputs & formula visible. [C]; recharge terms [E]."}
                          </div>
                        </details>
                      ))}
                    </div>
                  </div>
                  <div className={panel}>
                    <h4 className="font-semibold text-slate-900">Independent verification → earns <Tag t="V" /></h4>
                    <p className="mb-3 text-xs text-slate-500">[V] is NOT a &quot;make-this-true&quot; button. It records who verified, when, against what evidence. Default: NOT VERIFIED.</p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <input placeholder="Reviewer name" value={rev.reviewer} onChange={(e) => setRev({ ...rev, reviewer: e.target.value })} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none" />
                      <input placeholder="Organization" value={rev.org} onChange={(e) => setRev({ ...rev, org: e.target.value })} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none" />
                      <input placeholder="Evidence reviewed / note" value={rev.note} onChange={(e) => setRev({ ...rev, note: e.target.value })} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none" />
                    </div>
                    <button onClick={() => verify(selFarm)} className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500">Record independent review → [V]</button>
                    {verified[selFarm] && <p className="mt-3 rounded-md border border-emerald-300 bg-emerald-50 p-2 text-sm text-emerald-700"><Tag t="V" /> Verified by <b>{verified[selFarm].reviewer}</b> ({verified[selFarm].org}) on {verified[selFarm].date} · hash {verified[selFarm].hash}</p>}
                  </div>
                </section>
              );
            })()}

            {tab === "What-if" && (() => {
              const dc = dcM * 1_000_000; const total = pumpToday + dc;
              return (
                <section className="space-y-4">
                  <h3 className="text-lg font-semibold text-slate-900">Scenario simulator — SCENARIO, NOT A FORECAST</h3>
                  <div className={panel}>
                    <label className="block text-sm text-slate-600">New high-demand user (M gal/day): <b className="text-slate-900">{dcM.toFixed(2)}</b>
                      <input type="range" min={0} max={5} step={0.25} value={dcM} onChange={(e) => setDcM(+e.target.value)} className="mt-2 w-full max-w-md accent-blue-600" />
                    </label>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Basin today <Tag t="M" /></div><div className="text-lg font-bold text-slate-900">{pumpToday.toLocaleString()}</div></div>
                      <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">+ New user <Tag t="E" /></div><div className="text-lg font-bold text-slate-900">{dc.toLocaleString()}</div><div className="text-[11px] text-slate-400">± {Math.round(dc * 0.2).toLocaleString()} (±20%)</div></div>
                      <div className="rounded-lg bg-blue-50 p-3 ring-1 ring-inset ring-blue-200"><div className="text-xs text-blue-700">= Cumulative</div><div className="text-lg font-bold text-slate-900">{total.toLocaleString()}</div><div className="text-[11px] text-blue-700/70">± {Math.round(dc * 0.2).toLocaleString()}</div></div>
                    </div>
                    <div className="mt-3"><LineChart height={160} area unit=" gal" series={[{ name: "baseline", data: Array(30).fill(pumpToday), color: "#2563eb" }, { name: "with new user", data: Array(30).fill(total), color: "#db2777" }]} /></div>
                  </div>
                  <div className="flex items-start gap-2 rounded-lg border border-orange-300 bg-orange-50 p-3 text-sm text-orange-800"><Icon name="warning" className="mt-0.5 h-4 w-4 shrink-0" /><span>SCENARIO — NOT A FORECAST. Illustrative cumulative demand only; aquifer response requires the hydrogeologic model + uncertainty.</span></div>
                </section>
              );
            })()}

            {tab === "Policy" && (
              <section className="space-y-3">
                <h3 className="text-lg font-semibold text-slate-900">Configurable policy rules — each with provenance</h3>
                <p className="text-sm text-slate-500">The Mahomet is NOT labeled &quot;Sole Source&quot; generically without exact legal basis. Every rule shows its source.</p>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500"><tr>{["Rule", "Type", "Trigger", "Source", "Effective", "Applies to"].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
                    <tbody>{POLICY_RULES.map((r) => (<tr key={r.rule} className="border-t border-slate-100 hover:bg-slate-50"><td className="px-3 py-2 font-mono text-blue-600">{r.rule}</td><td className="px-3 py-2">{r.type}</td><td className="px-3 py-2 text-slate-600">{r.trigger}</td><td className="px-3 py-2 text-slate-500">{r.source}</td><td className="px-3 py-2">{r.effective}</td><td className="px-3 py-2">{r.appliesTo}</td></tr>))}</tbody>
                  </table>
                </div>
              </section>
            )}

            {tab === "Audit Ledger" && (
              <section className="space-y-3">
                <h3 className="text-lg font-semibold text-slate-900">Tamper-evident audit ledger (SHA-256 chain)</h3>
                <p className="text-sm text-slate-500">Each record hashes the previous record. Historical values are never overwritten — a change creates a new version.</p>
                {ledger.length === 0 ? (
                  <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">No events yet — go to <b>Farms &amp; Decisions</b> and click Approve/Modify/Delay/Reject, or record a verification, then they appear here as an immutable chain.</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500"><tr>{["v", "time", "actor", "source", "action", "class", "value", "decision", "prev_hash", "hash"].map((h) => <th key={h} className="px-2 py-2">{h}</th>)}</tr></thead>
                      <tbody>{ledger.map((r) => (<tr key={r.version} className="border-t border-slate-100 font-mono hover:bg-slate-50"><td className="px-2 py-1">{r.version}</td><td className="px-2 py-1">{r.timestamp}</td><td className="px-2 py-1">{r.actor}</td><td className="px-2 py-1">{r.source}</td><td className="px-2 py-1">{r.action}</td><td className="px-2 py-1">[{r.ev}]</td><td className="px-2 py-1 max-w-[160px] truncate">{r.value}</td><td className="px-2 py-1">{r.decision}</td><td className="px-2 py-1 text-slate-400">{r.prev}</td><td className="px-2 py-1 text-emerald-600">{r.hash.slice(0, 14)}…</td></tr>))}</tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {tab === "Export" && (() => {
              const rows = FARMS.map((f) => { const c = consByFarm[f.id]; const rec = recommendation(c); const a = acctByFarm[f.id]; return { farm: f.id, crop: f.crop, acres: f.acres, period_days: a.days, period_applied_in_M_simulated: a.appliedIn, period_crop_et_in_C: a.cropEtIn, period_crop_et_pm_in: a.cropEtPm, period_irrigation_et_in_C: a.irrigEtIn, period_applied_not_consumed_in: a.notConsumedIn, applied_gal_M: c.applied, crop_need_gal_C: c.req, crop_need_pm_gal: c.reqPm, etc_in_C: c.etc, etc_pm_in: c.etcPm, consensus: `${c.corroborate} corroborate / ${c.conflictN} conflict / ${c.silent} silent`, conflict: c.conflict, recommendation_R: rec.text, farmer_decision: decisions[f.id] ?? "—", verified_V: verified[f.id] ? "yes" : "NOT VERIFIED" }; });
              const csv = [Object.keys(rows[0]).join(","), ...rows.map((r) => Object.values(r).map((v) => `"${v}"`).join(","))].join("\n");
              const report = `${PILOT_NAME.toUpperCase()} — RESEARCH PROTOTYPE\n${PILOT_TAGLINE}\n${"=".repeat(60)}\nGenerated: ${TODAY} 08:45  ·  Phase 1: Mahomet Aquifer, E-Central IL\nAn independent, evidence-based agricultural research pilot. Not a water banking or water trading program.\nData sources: ISWS Groundwater Monitoring Network (wells ${WELLS.map((w) => w.id).join(", ")}); NOAA ${NOAA_STATION}; SIMULATED farm meters (DEMO ONLY).\nFormulas: ETc = ET0(Hargreaves-Samani)[C] × Kc(FAO-56); gal = net_in × acres × 27,150.\n\nWATER ACCOUNTING (last ${acctDays} days) — applied vs ET consumptive use. The difference is NOT counted as groundwater savings.\n${rows.map((r) => `${r.farm}: applied ${r.period_applied_in_M_simulated} in [M, simulated] | crop ET ${r.period_crop_et_in_C} ± ${r.period_crop_et_pm_in} in [C] | irrigation-supplied ET ${r.period_irrigation_et_in_C} in [C] | applied not consumed ${r.period_applied_not_consumed_in} in (fate unknown)`).join("\n")}\n\nGO / NO-GO: Water assessment NOT YET EVALUABLE · Energy assessment NOT YET EVALUABLE · Economic feasibility NOT YET EVALUABLE.\nModeled pumping energy (last ${acctDays} days, all farms): ${energy.kwh} kWh ≈ $${energy.cost} [E] — rests on simulated pumping and unverified assumptions (drawdown ${DEFAULT_ENERGY.drawdownFt} ft, pressure ${DEFAULT_ENERGY.pressureFt} ft, efficiency ${DEFAULT_ENERGY.plantEfficiency}, $${DEFAULT_ENERGY.pricePerKwh}/kWh).\nYield is reported with uncertainty and excluded from pass/fail. A wet season is reported as Inconclusive, not No-Go.\n\nDAILY RECOMMENDATIONS\n${rows.map((r) => `${r.farm}: applied ${r.applied_gal_M} [M] | need ${r.crop_need_gal_C} [C] | consensus ${r.consensus} | ${r.recommendation_R} [R] | decision ${r.farmer_decision} | ${r.verified_V}`).join("\n")}\n\nAudit chain records: ${ledger.length} (SHA-256, versioned).\nFor demonstration and scientific review only. No operational, regulatory, hydrologic, agricultural, or legal conclusion is asserted by this prototype.`;
              return (
                <section className="space-y-4">
                  <h3 className="text-lg font-semibold text-slate-900">Evidence package export</h3>
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500"><tr>{Object.keys(rows[0]).map((h) => <th key={h} className="px-2 py-2">{h}</th>)}</tr></thead>
                      <tbody>{rows.map((r) => (<tr key={r.farm} className="border-t border-slate-100">{Object.values(r).map((v, i) => <td key={i} className="px-2 py-1">{String(v)}</td>)}</tr>))}</tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button onClick={() => download("farm_water_energy_pilot_evidence.csv", csv, "text/csv")} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500"><Icon name="download" className="h-4 w-4" />Evidence package (CSV)</button>
                    <button onClick={() => download("farm_water_energy_pilot_report.txt", report)} className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"><Icon name="download" className="h-4 w-4" />Evidence report (TXT)</button>
                  </div>
                  <p className="text-xs text-slate-400">PDF hook: swap the TXT writer for a server route + a PDF lib in production for a branded, signed package.</p>
                </section>
              );
            })()}
          </main>
        </div>

        {showVideo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm" onClick={() => setShowVideo(false)} role="dialog" aria-modal="true" aria-label="How to read this dashboard">
            <div className="w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <p className="text-sm font-semibold text-slate-900">How to read this dashboard</p>
                <button onClick={() => setShowVideo(false)} aria-label="Close video" className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"><Icon name="close" className="h-5 w-5" /></button>
              </div>
              <video src="/how-to-read.mp4" controls autoPlay playsInline className="aspect-video w-full bg-black" />
            </div>
          </div>
        )}

        <footer className="border-t border-slate-200 px-6 py-4 text-center text-xs text-slate-400">{PILOT_NAME} · Phase 1: Mahomet Aquifer · RESEARCH PROTOTYPE · {PILOT_TAGLINE} · Independent agricultural research pilot, not a water banking or trading program · For demonstration &amp; scientific review only.</footer>
      </div>
    </div>
  );
}
