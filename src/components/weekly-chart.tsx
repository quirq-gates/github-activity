"use client";

import { useState } from "react";

function niceMax(v: number) {
  if (v <= 4) return 4;
  const mag = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * mag >= v) return m * mag;
  return 10 * mag;
}

const fmtWeek = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Commits per week across all public repos: one series, one axis, hover for exact values. */
export function WeeklyChart({ values, weekStarts }: { values: number[]; weekStarts: string[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 200;
  const pad = { l: 36, r: 8, t: 12, b: 24 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const top = niceMax(Math.max(...values, 1));
  const ticks = [0, top / 2, top];
  const slot = iw / values.length;
  const bw = Math.min(28, slot - 6);
  const y = (v: number) => pad.t + ih - (v / top) * ih;

  return (
    <figure className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Commits per week, last 12 weeks">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="stroke-grid" strokeWidth={1} />
            <text x={pad.l - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-3 text-[11px] tabular-nums">
              {t}
            </text>
          </g>
        ))}
        {values.map((v, i) => {
          const x = pad.l + i * slot + (slot - bw) / 2;
          const bh = Math.max(v > 0 ? 2 : 0, (v / top) * ih);
          const r = Math.min(4, bh / 2);
          const by = pad.t + ih - bh;
          const last = i === values.length - 1;
          return (
            <g key={i}>
              {bh > 0 && (
                // Rounded top, square baseline.
                <path
                  d={`M${x},${pad.t + ih} V${by + r} Q${x},${by} ${x + r},${by} H${x + bw - r} Q${x + bw},${by} ${x + bw},${by + r} V${pad.t + ih} Z`}
                  className={hover === i ? "fill-accent" : last ? "fill-accent" : "fill-accent/70"}
                />
              )}
              {(i % 2 === values.length % 2 || last) && (
                <text x={x + bw / 2} y={H - 6} textAnchor="middle" className="fill-ink-3 text-[11px]">
                  {fmtWeek(weekStarts[i])}
                </text>
              )}
              <rect
                x={pad.l + i * slot}
                y={pad.t}
                width={slot}
                height={ih}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-md border border-border bg-surface-1 px-2 py-1 text-xs shadow-sm"
          style={{
            left: `${((pad.l + hover * slot + slot / 2) / W) * 100}%`,
            top: `${(y(values[hover]) / H) * 100}%`,
          }}
        >
          <div className="text-ink-3">Week of {fmtWeek(weekStarts[hover])}</div>
          <div className="font-medium text-ink tabular-nums">
            {values[hover]} commit{values[hover] === 1 ? "" : "s"}
          </div>
        </div>
      )}
      <details className="mt-2 text-xs text-ink-3">
        <summary className="cursor-pointer select-none">Show as table</summary>
        <table className="mt-2 w-full max-w-xs tabular-nums">
          <thead>
            <tr className="text-left">
              <th className="font-medium">Week of</th>
              <th className="text-right font-medium">Commits</th>
            </tr>
          </thead>
          <tbody className="text-ink-2">
            {values.map((v, i) => (
              <tr key={i}>
                <td>{fmtWeek(weekStarts[i])}</td>
                <td className="text-right">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
