"use client";
import { useRef, useState } from "react";

interface Series { name: string; color: string; data: number[]; }

export function LineChart({ series, height = 200, invertBand, area, labels, unit = "" }: {
  series: Series[]; height?: number; invertBand?: boolean; area?: boolean; labels?: string[]; unit?: string;
}) {
  const [hi, setHi] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const n = series[0]?.data.length ?? 0;
  const all = series.flatMap((s) => s.data);
  const min = Math.min(...all), max = Math.max(...all);
  const pad = (max - min) * 0.1 || 1;
  const lo = min - pad, hiV = max + pad;
  const W = 800, H = height;
  const x = (i: number) => (i / Math.max(n - 1, 1)) * W;
  const y = (v: number) => H - ((v - lo) / (hiV - lo)) * H;

  function move(e: React.MouseEvent) {
    const r = svgRef.current!.getBoundingClientRect();
    const ratio = (e.clientX - r.left) / r.width;
    setHi(Math.max(0, Math.min(n - 1, Math.round(ratio * (n - 1)))));
  }

  return (
    <div className="relative w-full select-none">
      <div className="flex">
        <div className="flex flex-col justify-between pr-2 text-[10px] text-slate-400" style={{ height }}>
          <span>{hiV.toFixed(1)}</span><span>{((hiV + lo) / 2).toFixed(1)}</span><span>{lo.toFixed(1)}</span>
        </div>
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none"
          className="rounded" onMouseMove={move} onMouseLeave={() => setHi(null)}>
          {[0.25, 0.5, 0.75].map((g) => (
            <line key={g} x1={0} x2={W} y1={H * g} y2={H * g} stroke="#0f172a12" strokeWidth={1} />
          ))}
          {series.map((s) => {
            const line = s.data.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
            return (
              <g key={s.name}>
                {area && <path d={`${line} L${W},${H} L0,${H} Z`} fill={s.color} opacity={0.12} />}
                <path d={line} fill="none" stroke={s.color} strokeWidth={2.2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              </g>
            );
          })}
          {hi !== null && (
            <>
              <line x1={x(hi)} x2={x(hi)} y1={0} y2={H} stroke="#0f172a35" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              {series.map((s) => (
                <circle key={s.name} cx={x(hi)} cy={y(s.data[hi])} r={3.5} fill={s.color} stroke="#ffffff" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
              ))}
            </>
          )}
        </svg>
      </div>

      {hi !== null && (
        <div className="pointer-events-none absolute top-1 z-10 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 text-[11px] shadow-lg"
          style={{ left: `calc(2rem + ${(hi / Math.max(n - 1, 1)) * 100}% )`, transform: "translateX(-50%)" }}>
          {labels && <div className="mb-0.5 text-slate-500">{labels[hi]}</div>}
          {series.map((s) => (
            <div key={s.name} className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
              <span className="text-slate-600">{s.name}:</span>
              <b className="text-slate-900">{s.data[hi].toLocaleString()}{unit}</b>
            </div>
          ))}
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 pl-8 text-xs text-slate-500">
        {series.map((s) => (
          <span key={s.name} className="flex items-center gap-1.5">
            <span className="inline-block h-[3px] w-4 rounded" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
        {invertBand && <span className="text-slate-400">(higher line = deeper water table)</span>}
      </div>
    </div>
  );
}

export function BarChart({ series, height = 200, unit = "" }: { series: Series[]; height?: number; unit?: string; }) {
  const [hi, setHi] = useState<{ i: number; si: number } | null>(null);
  const n = series[0]?.data.length ?? 0;
  const all = series.flatMap((s) => s.data);
  const max = Math.max(...all, 1);
  const W = 800, H = height;
  const groupW = W / n;
  const barW = (groupW * 0.82) / series.length;
  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" className="rounded">
        {series.map((s, si) =>
          s.data.map((v, i) => {
            const h = (v / max) * H;
            const gx = i * groupW + groupW * 0.09 + si * barW;
            const active = hi?.i === i && hi?.si === si;
            return <rect key={`${s.name}-${i}`} x={gx} y={H - h} width={barW * 0.92} height={h} rx={1}
              fill={s.color} opacity={active ? 1 : 0.82}
              onMouseEnter={() => setHi({ i, si })} onMouseLeave={() => setHi(null)} />;
          })
        )}
      </svg>
      {hi && (
        <div className="pointer-events-none absolute top-1 left-1/2 -translate-x-1/2 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 text-[11px] shadow-lg">
          <span className="text-slate-600">{series[hi.si].name}:</span>{" "}
          <b className="text-slate-900">{series[hi.si].data[hi.i].toLocaleString()}{unit}</b>
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        {series.map((s) => (
          <span key={s.name} className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}
