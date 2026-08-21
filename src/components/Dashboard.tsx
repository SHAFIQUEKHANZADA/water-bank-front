"use client";
import { useEffect, useMemo, useState } from "react";
import { LineChart, BarChart } from "./Charts";
import {
  DATES, FARMS, WELLS, NOAA_STATION, TODAY, TAG_COLORS, TAG_MEANING, POLICY_RULES,
  wellSeries, weather, meterSeries, consensusForFarm, recommendation, cropRequirement,
  gwTrend, today, sha256, type Tag as TagT, type Consensus,
} from "@/lib/waterbank";

/* ---------- atoms ---------- */
function Tag({ t }: { t: TagT }) {
  return <span title={TAG_MEANING[t]} className="inline-block rounded px-1.5 py-0.5 text-[11px] font-bold text-white align-middle" style={{ background: TAG_COLORS[t] }}>[{t}]</span>;
}
function Counter({ value, decimals = 0, suffix = "", prefix = "" }: { value: number; decimals?: number; suffix?: string; prefix?: string }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0; const start = performance.now(), dur = 700;
    const tick = (t: number) => { const p = Math.min((t - start) / dur, 1); setV(value * (1 - Math.pow(1 - p, 3))); if (p < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [value]);
  const shown = decimals > 0 ? v.toFixed(decimals) : Math.round(v).toLocaleString();
  return <>{prefix}{shown}{suffix}</>;
}
function Card({ label, tag, accent, children }: { label: string; tag?: TagT; accent: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md" style={{ borderTop: `3px solid ${accent}` }}>
      <div className="flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">{label} {tag && <Tag t={tag} />}</div>
      <div className="mt-1.5 text-2xl font-extrabold text-slate-900">{children}</div>
    </div>
  );
}

interface LedgerRow { version: number; timestamp: string; actor: string; source: string; action: string; ev: string; value: string; decision: string; prev: string; hash: string; }
const NAV = [
  { id: "Overview", icon: "📊" }, { id: "Farms & Decisions", icon: "🚜" }, { id: "Guardian Evidence", icon: "🧠" },
  { id: "What-if", icon: "🧪" }, { id: "Policy", icon: "📜" }, { id: "Audit Ledger", icon: "🔗" }, { id: "Export", icon: "📤" },
] as const;
type TabId = (typeof NAV)[number]["id"];
const DECISION_STYLE: Record<string, string> = {
  Approve: "bg-emerald-600 hover:bg-emerald-500", Modify: "bg-blue-600 hover:bg-blue-500",
  Delay: "bg-amber-500 hover:bg-amber-400", Reject: "bg-rose-600 hover:bg-rose-500",
};

export default function Dashboard() {
  const [tab, setTab] = useState<TabId>("Overview");
  const [decisions, setDecisions] = useState<Record<string, string>>({});
  const [verified, setVerified] = useState<Record<string, { reviewer: string; org: string; note: string; date: string; hash: string }>>({});
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [dcM, setDcM] = useState(1);
  const [selFarm, setSelFarm] = useState(FARMS[0].id);
  const [rev, setRev] = useState({ reviewer: "", org: "", note: "" });

  const consByFarm = useMemo(() => { const o: Record<string, Consensus> = {}; FARMS.forEach((f) => (o[f.id] = consensusForFarm(f))); return o; }, []);

  async function addLedger(actor: string, source: string, action: string, ev: string, value: string, decision = "") {
    const prev = ledger.length ? ledger[ledger.length - 1].hash : "GENESIS";
    const hash = await sha256(`${prev}|${actor}|${source}|${action}|${ev}|${value}|${decision}`);
    setLedger((L) => [...L, { version: L.length + 1, timestamp: `${TODAY} 08:45`, actor, source, action, ev, value, decision, prev: prev === "GENESIS" ? "GENESIS" : prev.slice(0, 14) + "…", hash }]);
  }
  async function decide(farm: string, choice: string, recText: string) { setDecisions((d) => ({ ...d, [farm]: choice })); await addLedger("Farmer", farm, `Decision: ${choice}`, "R", recText, choice); }
  async function verify(farm: string) {
    if (!rev.reviewer || !rev.org) return;
    const hash = (await sha256(`REVIEW|${farm}|${rev.reviewer}|${rev.org}|${rev.note}`)).slice(0, 16);
    setVerified((v) => ({ ...v, [farm]: { ...rev, date: TODAY, hash } }));
    await addLedger(`${rev.reviewer} (${rev.org})`, farm, "Independent review", "V", "claim verified", rev.note || "—");
    setRev({ reviewer: "", org: "", note: "" });
  }
  function resetDemo() { setDecisions({}); setVerified({}); setLedger([]); }

  const gwNow = wellSeries.reduce((a, w) => a + today(w.depth), 0) / wellSeries.length;
  const gwChg = gwTrend();
  const pumpToday = meterSeries.reduce((a, m) => a + today(m.gallons), 0);
  const totalReq = FARMS.reduce((a, f) => a + cropRequirement(f).gal, 0);
  const alerts = meterSeries.filter((m) => today(m.anomaly)).length;
  const avgSupport = FARMS.reduce((a, f) => a + consByFarm[f.id].supporting, 0) / FARMS.length;

  function download(name: string, text: string, type = "text/plain") {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
  }
  const panel = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";

  return (
    <div className="flex min-h-screen bg-slate-100 text-slate-700">
      {/* sidebar */}
      <aside className="sticky top-0 flex h-screen w-16 shrink-0 flex-col border-r border-slate-200 bg-white md:w-64">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-4">
          <span className="text-2xl">💧</span>
          <div className="hidden md:block">
            <div className="text-sm font-bold leading-tight text-slate-900">Guardian Water Bank</div>
            <div className="text-[11px] text-slate-500">Mahomet Aquifer</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-2">
          {NAV.map((it) => (
            <button key={it.id} onClick={() => setTab(it.id)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${tab === it.id ? "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"}`}>
              <span className="text-lg">{it.icon}</span><span className="hidden md:inline">{it.id}</span>
            </button>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-2">
          <button onClick={resetDemo} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-500 transition hover:bg-rose-50 hover:text-rose-600">
            <span className="text-lg">↺</span><span className="hidden md:inline">Reset demo</span>
          </button>
        </div>
      </aside>

      {/* content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* topbar */}
        <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-6 py-3 backdrop-blur">
          <div>
            <h1 className="text-lg font-bold text-slate-900">{tab}</h1>
            <p className="text-xs text-slate-500">Every drop has a reason. <b className="text-slate-700">Every decision has a record.</b></p>
          </div>
          <div className="flex items-center gap-3 text-xs">
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

          {/* cards */}
          <div className="grid grid-cols-2 gap-3 py-4 sm:grid-cols-4 lg:grid-cols-7">
            <Card label="Groundwater" tag="M" accent="#2563eb"><Counter value={gwNow} decimals={1} suffix=" ft" /></Card>
            <Card label="7-day change" tag="M" accent="#2563eb"><Counter value={gwChg} decimals={2} suffix=" ft" prefix={gwChg >= 0 ? "+" : ""} /></Card>
            <Card label="Pumping today" tag="M" accent="#2563eb"><Counter value={pumpToday} suffix=" gal" /></Card>
            <Card label="Est. crop need" tag="C" accent="#0d9488"><Counter value={totalReq} suffix=" gal" /></Card>
            <Card label="Rainfall 24h" tag="M" accent="#2563eb"><Counter value={today(weather.rain)} decimals={2} suffix=" in" /></Card>
            <Card label="Evidence agreement" accent="#7c3aed"><Counter value={avgSupport} decimals={1} suffix="/4" /></Card>
            <Card label="Active alerts" accent={alerts ? "#e11d48" : "#16a34a"}><Counter value={alerts} /></Card>
          </div>

          <main key={tab} className="fade-up pb-10">
            {tab === "Overview" && (
              <section className="space-y-5">
                <div className={panel}>
                  <h2 className="mb-1 font-semibold text-slate-900">Groundwater — ISWS monitoring wells (real IDs) <Tag t="M" /></h2>
                  <p className="mb-3 text-xs text-slate-500">NOAA station: {NOAA_STATION} · hover the chart for values</p>
                  <LineChart invertBand height={210} labels={DATES} unit=" ft" series={wellSeries.map((w, i) => ({ name: w.id + (w.qaqc ? " ⚠QA/QC" : ""), data: w.depth, color: ["#2563eb", "#0d9488", "#d97706", "#db2777", "#7c3aed"][i % 5] }))} />
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className={panel}>
                    <h3 className="mb-2 text-sm font-semibold text-slate-900">Daily pumping — all farms <Tag t="M" /> <span className="text-[11px] text-amber-600">SIMULATED — DEMO ONLY</span></h3>
                    <BarChart height={180} unit=" gal" series={meterSeries.map((m, i) => ({ name: m.farm, data: m.gallons, color: ["#2563eb", "#0d9488", "#d97706"][i] }))} />
                  </div>
                  <div className={panel}>
                    <h3 className="mb-2 text-sm font-semibold text-slate-900">Rainfall <Tag t="M" /> &amp; ET₀ <Tag t="C" /></h3>
                    <LineChart height={180} area labels={DATES} unit=" in" series={[{ name: "Rain (in)", data: weather.rain, color: "#2563eb" }, { name: "ET₀ (in)", data: weather.et0, color: "#f59e0b" }]} />
                  </div>
                </div>
                <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">⚠️ MTH-22S data are under ISWS QA/QC — shown with a provenance warning and <b>never marked [V]</b> in this prototype.</p>
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
                          <p className="mt-1 text-sm text-slate-600">Meter today <Tag t="M" /> <b className="text-slate-900">{c.applied.toLocaleString()} gal</b> · Crop need <Tag t="C" /> <b className="text-slate-900">{c.req.toLocaleString()} gal</b> · ETc <Tag t="C" /> {c.etc} in</p>
                          {c.conflict ? (
                            <p className="mt-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">🟥 CONFLICT DETECTED — HUMAN REVIEW REQUIRED (meter high but recent rain wets soil)</p>
                          ) : (
                            <p className="mt-2 text-sm text-slate-600">Evidence agreement: <b className="text-slate-900">{c.supporting} of {c.total} sources</b> support the claim</p>
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
                          {decisions[f.id] && <p className="mt-2 text-xs font-medium text-emerald-600">✓ Logged: {decisions[f.id]} → ledger</p>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </section>
            )}

            {tab === "Guardian Evidence" && (() => {
              const c = consByFarm[selFarm];
              return (
                <section className="space-y-4">
                  <p className="text-sm text-slate-500">Guardian keeps sources SEPARATE and shows agreement/conflict per claim — it does NOT average different measurements together.</p>
                  <select value={selFarm} onChange={(e) => setSelFarm(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900">{FARMS.map((f) => <option key={f.id}>{f.id}</option>)}</select>
                  <div className={panel}>
                    <h3 className="text-lg font-semibold text-slate-900">Claim: <i>reduce next irrigation for {selFarm}?</i></h3>
                    <p className="mt-1 text-sm text-slate-600">Consensus: <b className="text-slate-900">{c.supporting} of {c.total} independent streams support</b> — {c.conflict ? <span className="font-semibold text-red-600">🟥 CONFLICT — human review</span> : <span className="text-emerald-600">🟩 no conflict</span>}</p>
                    <div className="mt-3 space-y-2">
                      {c.streams.map((s) => (
                        <details key={s.name} className="group rounded-lg border border-slate-200 bg-slate-50 p-3 transition hover:border-slate-300">
                          <summary className="cursor-pointer text-sm text-slate-700">{s.support ? "✅" : "⬜"} <b>{s.name}</b> [{s.tag}] — {s.value}</summary>
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
                      <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">+ New user <Tag t="E" /></div><div className="text-lg font-bold text-slate-900">{dc.toLocaleString()}</div></div>
                      <div className="rounded-lg bg-blue-50 p-3 ring-1 ring-inset ring-blue-200"><div className="text-xs text-blue-700">= Cumulative</div><div className="text-lg font-bold text-slate-900">{total.toLocaleString()}</div></div>
                    </div>
                    <div className="mt-3"><LineChart height={160} area unit=" gal" series={[{ name: "baseline", data: Array(30).fill(pumpToday), color: "#2563eb" }, { name: "with new user", data: Array(30).fill(total), color: "#db2777" }]} /></div>
                  </div>
                  <p className="rounded-lg border border-orange-300 bg-orange-50 p-3 text-sm text-orange-800">🟧 SCENARIO — NOT A FORECAST. Illustrative cumulative demand only; aquifer response requires the hydrogeologic model + uncertainty.</p>
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
                <h3 className="text-lg font-semibold text-slate-900">Tamper-evident audit ledger 🔗 (SHA-256 chain)</h3>
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
              const rows = FARMS.map((f) => { const c = consByFarm[f.id]; const rec = recommendation(c); return { farm: f.id, crop: f.crop, acres: f.acres, applied_gal_M: c.applied, crop_need_gal_C: c.req, etc_in_C: c.etc, consensus: `${c.supporting}/${c.total}`, conflict: c.conflict, recommendation_R: rec.text, farmer_decision: decisions[f.id] ?? "—", verified_V: verified[f.id] ? "yes" : "NOT VERIFIED" }; });
              const csv = [Object.keys(rows[0]).join(","), ...rows.map((r) => Object.values(r).map((v) => `"${v}"`).join(","))].join("\n");
              const report = `GUARDIAN WATER BANK — RESEARCH PROTOTYPE\n${"=".repeat(60)}\nGenerated: ${TODAY} 08:45  ·  Mahomet Aquifer, E-Central IL\nData sources: ISWS Groundwater Monitoring Network (wells ${WELLS.map((w) => w.id).join(", ")}); NOAA ${NOAA_STATION}; SIMULATED farm meters (DEMO ONLY).\nFormulas: ETc = ET0(Hargreaves-Samani)[C] × Kc(FAO-56); gal = net_in × acres × 27,150.\n\n${rows.map((r) => `${r.farm}: applied ${r.applied_gal_M} [M] | need ${r.crop_need_gal_C} [C] | consensus ${r.consensus} | ${r.recommendation_R} [R] | decision ${r.farmer_decision} | ${r.verified_V}`).join("\n")}\n\nAudit chain records: ${ledger.length} (SHA-256, versioned).\nFor demonstration and scientific review only. No operational, regulatory, hydrologic, agricultural, or legal conclusion is asserted by this prototype.`;
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
                    <button onClick={() => download("guardian_water_bank_evidence.csv", csv, "text/csv")} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500">⬇️ Evidence package (CSV)</button>
                    <button onClick={() => download("guardian_water_bank_report.txt", report)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">⬇️ Evidence report (TXT)</button>
                  </div>
                  <p className="text-xs text-slate-400">PDF hook: swap the TXT writer for a server route + a PDF lib in production for a branded, signed package.</p>
                </section>
              );
            })()}
          </main>
        </div>

        <footer className="border-t border-slate-200 px-6 py-4 text-center text-xs text-slate-400">Guardian Water Bank · RESEARCH PROTOTYPE · Every drop has a reason. Every decision has a record. · For demonstration &amp; scientific review only.</footer>
      </div>
    </div>
  );
}
