import { useId, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';

/**
 * A small multi-series line chart over a sliding window, in SVG. Same rules as LineChart (2 px lines, hairline
 * grid, one axis, text in text colours, ringed end dots, crosshair and keyboard, table view) plus a legend,
 * since there are several series: identity never rests on colour alone. Gaps (NaN) break the lines.
 */
export interface Series {
  name: string;
  color: string;
  v: number[];
}

export interface MultiLineChartProps {
  title: string;
  /** Sample times (ms), oldest first, shared by every series. */
  t: number[];
  series: Series[];
  now: number;
  windowMs: number;
  windowLabel: string;
  domain: [number, number];
  ticks: number[];
  format: (v: number) => string;
}

const W = 520;
const H = 170;
const PAD = { l: 36, r: 10, t: 10, b: 20 };

export function MultiLineChart(p: MultiLineChartProps) {
  const uid = useId();
  const [cursor, setCursor] = useState<number | null>(null);
  const [lo, hi] = p.domain;
  const x = (t: number) => PAD.l + ((t - (p.now - p.windowMs)) / p.windowMs) * (W - PAD.l - PAD.r);
  const y = (v: number) =>
    PAD.t + (1 - (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  const n = p.t.length;

  // One polyline per run of real numbers, so a gap with nobody in view is a gap in the line.
  const runs = (s: Series) => {
    const out: string[] = [];
    let cur: string[] = [];
    s.v.forEach((v, i) => {
      if (Number.isNaN(v)) {
        if (cur.length > 1) out.push(cur.join(' '));
        cur = [];
      } else cur.push(`${x(p.t[i]!).toFixed(1)},${y(v).toFixed(1)}`);
    });
    if (cur.length > 1) out.push(cur.join(' '));
    return out;
  };

  const nearest = (clientX: number, rect: DOMRect): number | null => {
    if (n === 0) return null;
    const px = ((clientX - rect.left) / rect.width) * W;
    let best = 0;
    for (let i = 1; i < n; i++)
      if (Math.abs(x(p.t[i]!) - px) < Math.abs(x(p.t[best]!) - px)) best = i;
    return best;
  };
  const onMove = (e: PointerEvent<SVGSVGElement>) =>
    setCursor(nearest(e.clientX, e.currentTarget.getBoundingClientRect()));
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (n === 0) return;
    if (e.key === 'ArrowLeft') setCursor((c) => Math.max(0, (c ?? n - 1) - 1));
    else if (e.key === 'ArrowRight') setCursor((c) => Math.min(n - 1, (c ?? n - 1) + 1));
    else if (e.key === 'Escape') setCursor(null);
    else return;
    e.preventDefault();
  };
  const c = cursor !== null && cursor < n ? cursor : null;

  // Table view: the window sampled every 5 seconds.
  const rows: { ago: string; values: string[] }[] = [];
  for (let s = 0; s * 5000 <= p.windowMs && n > 0; s++) {
    const target = p.now - s * 5000;
    let best = 0;
    for (let i = 1; i < n; i++)
      if (Math.abs(p.t[i]! - target) < Math.abs(p.t[best]! - target)) best = i;
    if (Math.abs(p.t[best]! - target) < 1500)
      rows.push({
        ago: `${s * 5} s ago`,
        values: p.series.map((s2) => (Number.isNaN(s2.v[best]!) ? '-' : p.format(s2.v[best]!))),
      });
  }

  return (
    <figure className="viz-root space-y-2" aria-labelledby={`${uid}-t`}>
      <figcaption
        id={`${uid}-t`}
        className="text-xs font-medium"
        style={{ color: 'var(--text-primary)' }}
      >
        {p.title}
      </figcaption>
      <ul
        className="flex flex-wrap gap-x-4 gap-y-1 text-xs"
        style={{ color: 'var(--text-secondary)' }}
        aria-label="Legend"
      >
        {p.series.map((s) => (
          <li key={s.name} className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded" style={{ background: s.color }} />
            {s.name}
          </li>
        ))}
      </ul>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full touch-none rounded"
          tabIndex={0}
          role="img"
          aria-label={`${p.title}, last ${p.windowLabel}. Arrow keys move through the values.`}
          onPointerMove={onMove}
          onPointerLeave={() => setCursor(null)}
          onKeyDown={onKey}
          onBlur={() => setCursor(null)}
          data-testid="mood-chart"
        >
          <rect width={W} height={H} fill="var(--surface-1)" />
          {p.ticks.map((tk) => (
            <g key={tk}>
              <line
                x1={PAD.l}
                x2={W - PAD.r}
                y1={y(tk)}
                y2={y(tk)}
                stroke="var(--grid)"
                strokeWidth={1}
              />
              <text
                x={PAD.l - 5}
                y={y(tk) + 3}
                textAnchor="end"
                fontSize={10}
                fill="var(--text-muted)"
              >
                {p.format(tk)}
              </text>
            </g>
          ))}
          <text x={PAD.l} y={H - 5} fontSize={10} fill="var(--text-muted)">
            {p.windowLabel} ago
          </text>
          <text x={W - PAD.r} y={H - 5} textAnchor="end" fontSize={10} fill="var(--text-muted)">
            now
          </text>
          {p.series.map((s) =>
            runs(s).map((pts, i) => (
              <polyline
                key={`${s.name}${i}`}
                points={pts}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )),
          )}
          {n > 0 &&
            p.series.map((s) => {
              const v = s.v[n - 1]!;
              return Number.isNaN(v) ? null : (
                <circle
                  key={s.name}
                  cx={x(p.t[n - 1]!)}
                  cy={y(v)}
                  r={4}
                  fill={s.color}
                  stroke="var(--surface-1)"
                  strokeWidth={2}
                />
              );
            })}
          {c !== null && (
            <g pointerEvents="none">
              <line
                x1={x(p.t[c]!)}
                x2={x(p.t[c]!)}
                y1={PAD.t}
                y2={H - PAD.b}
                stroke="var(--text-secondary)"
                strokeWidth={1}
              />
              {p.series.map((s) =>
                Number.isNaN(s.v[c]!) ? null : (
                  <circle
                    key={s.name}
                    cx={x(p.t[c]!)}
                    cy={y(s.v[c]!)}
                    r={4}
                    fill={s.color}
                    stroke="var(--surface-1)"
                    strokeWidth={2}
                  />
                ),
              )}
            </g>
          )}
        </svg>
        {c !== null && (
          <div
            role="status"
            className="pointer-events-none absolute top-1 rounded px-2 py-1 text-xs shadow"
            style={{
              left: `${Math.min(62, Math.max(0, (x(p.t[c]!) / W) * 100 - 8))}%`,
              background: 'var(--surface-2)',
              color: 'var(--text-primary)',
            }}
            data-testid="mood-tooltip"
          >
            {p.series.map((s) => (
              <div key={s.name} className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-3 rounded" style={{ background: s.color }} />
                <strong className="w-9 text-right font-semibold tabular-nums">
                  {Number.isNaN(s.v[c]!) ? '-' : p.format(s.v[c]!)}
                </strong>
                <span style={{ color: 'var(--text-secondary)' }}>{s.name}</span>
              </div>
            ))}
            <div style={{ color: 'var(--text-secondary)' }}>
              {((p.now - p.t[c]!) / 1000).toFixed(0)} s ago
            </div>
          </div>
        )}
      </div>
      <details className="text-xs" style={{ color: 'var(--text-secondary)' }}>
        <summary className="cursor-pointer select-none">Table view</summary>
        <table className="mt-1 w-full">
          <thead>
            <tr style={{ color: 'var(--text-muted)' }}>
              <th className="text-left font-normal">When</th>
              {p.series.map((s) => (
                <th key={s.name} className="text-right font-normal">
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.ago}>
                <td>{r.ago}</td>
                {r.values.map((v, i) => (
                  <td key={i} className="text-right tabular-nums">
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
