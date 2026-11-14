import { useId, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';

/**
 * A small single-series line chart over a sliding time window, drawn in SVG.
 * Follows the data-viz rules: 2 px line, hairline recessive grid, one axis, text in text colours (never the
 * series colour), the end of the line marked with a ringed dot, a crosshair + tooltip that also works from the
 * keyboard, and a table view so every value is reachable without hovering. One series, so no legend: the title
 * names it.
 */
export interface LineChartProps {
  title: string;
  /** What the numbers mean, for the table and the tooltip, e.g. "degrees". */
  unit: string;
  /** Sample times (ms, performance.now clock) and values, oldest first. */
  t: number[];
  v: number[];
  now: number;
  windowMs?: number;
  domain: [number, number];
  ticks: number[];
  format: (value: number) => string;
  /** Horizontal guide lines, each directly labelled (e.g. the blink thresholds). */
  guides?: { value: number; label: string }[];
  /** Event times to mark along the top edge (e.g. counted blinks). */
  events?: number[];
  eventsLabel?: string;
  /** CSS colour for the series, normally a categorical slot variable. */
  color: string;
}

const W = 288;
const H = 112;
const PAD = { l: 34, r: 8, t: 12, b: 18 };

export function LineChart(p: LineChartProps) {
  const windowMs = p.windowMs ?? 10_000;
  const uid = useId();
  const [cursor, setCursor] = useState<number | null>(null);
  const [lo, hi] = p.domain;
  const x = (t: number) => PAD.l + ((t - (p.now - windowMs)) / windowMs) * (W - PAD.l - PAD.r);
  const y = (v: number) =>
    PAD.t + (1 - (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (H - PAD.t - PAD.b);

  const n = p.t.length;
  const points = p.t.map((t, i) => `${x(t).toFixed(1)},${y(p.v[i]!).toFixed(1)}`).join(' ');
  const last = n > 0 ? { x: x(p.t[n - 1]!), y: y(p.v[n - 1]!) } : null;

  // The crosshair snaps to the nearest sample in time, so the reader aims at a moment, not at the line.
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

  // Table view: the last 10 s sampled every 0.5 s (nearest sample), so nothing needs hovering.
  const rows: { ago: string; value: string }[] = [];
  for (let s = 0; s <= 20 && n > 0; s++) {
    const target = p.now - s * 500;
    let best = 0;
    for (let i = 1; i < n; i++)
      if (Math.abs(p.t[i]! - target) < Math.abs(p.t[best]! - target)) best = i;
    if (Math.abs(p.t[best]! - target) < 400)
      rows.push({ ago: `${(s * 0.5).toFixed(1)} s ago`, value: p.format(p.v[best]!) });
  }

  return (
    <figure className="viz-root space-y-1" aria-labelledby={`${uid}-t`}>
      <figcaption
        id={`${uid}-t`}
        className="text-xs font-medium"
        style={{ color: 'var(--text-primary)' }}
      >
        {p.title}
        {p.eventsLabel && <span style={{ color: 'var(--text-muted)' }}> · {p.eventsLabel}</span>}
      </figcaption>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full touch-none rounded"
          tabIndex={0}
          role="img"
          aria-label={`${p.title}, last 10 seconds. Arrow keys move through the values.`}
          onPointerMove={onMove}
          onPointerLeave={() => setCursor(null)}
          onKeyDown={onKey}
          onBlur={() => setCursor(null)}
          data-testid="line-chart"
        >
          <rect x={0} y={0} width={W} height={H} fill="var(--surface-1)" />
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
                x={PAD.l - 4}
                y={y(tk) + 3}
                textAnchor="end"
                fontSize={9}
                fill="var(--text-muted)"
              >
                {p.format(tk)}
              </text>
            </g>
          ))}
          {p.guides?.map((g) => (
            <g key={g.label}>
              <line
                x1={PAD.l}
                x2={W - PAD.r}
                y1={y(g.value)}
                y2={y(g.value)}
                stroke="var(--text-muted)"
                strokeWidth={1}
              />
              <text
                x={W - PAD.r - 2}
                y={y(g.value) - 3}
                textAnchor="end"
                fontSize={9}
                fill="var(--text-secondary)"
              >
                {g.label}
              </text>
            </g>
          ))}
          <text x={PAD.l} y={H - 4} fontSize={9} fill="var(--text-muted)">
            10 s ago
          </text>
          <text x={W - PAD.r} y={H - 4} textAnchor="end" fontSize={9} fill="var(--text-muted)">
            now
          </text>
          {p.events?.map((t) => (
            <line
              key={t}
              x1={x(t)}
              x2={x(t)}
              y1={PAD.t - 8}
              y2={PAD.t - 1}
              stroke="var(--text-secondary)"
              strokeWidth={2}
              strokeLinecap="round"
            />
          ))}
          {n > 1 && (
            <polyline
              points={points}
              fill="none"
              stroke={p.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
          {last && (
            <circle
              cx={last.x}
              cy={last.y}
              r={4}
              fill={p.color}
              stroke="var(--surface-1)"
              strokeWidth={2}
            />
          )}
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
              <circle
                cx={x(p.t[c]!)}
                cy={y(p.v[c]!)}
                r={4}
                fill={p.color}
                stroke="var(--surface-1)"
                strokeWidth={2}
              />
            </g>
          )}
        </svg>
        {c !== null && (
          <div
            role="status"
            className="pointer-events-none absolute top-1 rounded px-2 py-1 text-xs shadow"
            style={{
              left: `${Math.min(70, Math.max(0, (x(p.t[c]!) / W) * 100 - 12))}%`,
              background: 'var(--surface-2)',
              color: 'var(--text-primary)',
            }}
            data-testid="chart-tooltip"
          >
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-3 rounded" style={{ background: p.color }} />
              <strong className="font-semibold">{p.format(p.v[c]!)}</strong>
              <span style={{ color: 'var(--text-secondary)' }}>{p.unit}</span>
            </div>
            <div style={{ color: 'var(--text-secondary)' }}>
              {((p.now - p.t[c]!) / 1000).toFixed(1)} s ago
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
              <th className="text-right font-normal">{p.unit}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.ago}>
                <td>{r.ago}</td>
                <td className="text-right tabular-nums">{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
