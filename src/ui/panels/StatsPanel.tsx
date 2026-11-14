import { useEffect, useState } from 'react';
import { stats } from '../../core/stats/collector';
import { useLive } from '../../core/liveStore';
import type { StatsSnapshot } from '../../core/stats/collector';
import { QUALITY_LEVELS } from '../../core/scheduler/quality';
import type { QualityId } from '../../core/scheduler/quality';

/** Polls the collector 4x/second. It never re-renders per frame. */
export function StatsPanel() {
  const [s, setS] = useState<StatsSnapshot>(() => stats.snapshot());
  useEffect(() => {
    const id = setInterval(() => setS(stats.snapshot()), 250);
    return () => clearInterval(id);
  }, []);

  const delegate = useLive((st) => st.delegate);
  const thread = useLive((st) => st.thread);
  const level = useLive((st) => st.qualityLevel);
  const mode = useLive((st) => st.qualityMode);
  const setMode = useLive((st) => st.setQualityMode);
  const rows: [string, string][] = [
    ['Video FPS', s.fps.toFixed(1)],
    ['Inference FPS', s.inferFps.toFixed(1)],
    ['Frame time', `${s.frameMs.toFixed(1)} ms`],
    ['Capture', `${s.capture.toFixed(1)} ms`],
    ['Worker round trip', `${s.worker.toFixed(1)} ms`],
    ['Face model', `${s.face.toFixed(1)} ms`],
    ['Hand model', `${s.hand.toFixed(1)} ms`],
    ['Gesture rec.', `${s.gesture.toFixed(1)} ms`],
    ['Identity', `${s.identity.toFixed(1)} ms`],
    ['Draw', `${s.draw.toFixed(2)} ms`],
    ['Delegate', delegate ?? '-'],
    ['Runs in', thread === 'main' ? 'main thread' : thread === 'worker' ? 'Web Worker' : '-'],
    ['Quality', `${QUALITY_LEVELS[level]!.label}${mode === 'auto' ? ' (auto)' : ' (pinned)'}`],
  ];
  return (
    <section aria-label="Performance stats" className="w-64 rounded-lg bg-neutral-900 p-4">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-400">Stats</h2>
      <dl className="space-y-1 font-mono text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between">
            <dt className="text-neutral-400">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <label className="mt-3 flex items-center justify-between gap-2 text-sm text-neutral-400">
        Quality mode
        <select
          className="rounded bg-neutral-800 px-2 py-1 text-neutral-100"
          value={String(mode)}
          onChange={(e) =>
            setMode(e.target.value === 'auto' ? 'auto' : (Number(e.target.value) as QualityId))
          }
        >
          <option value="auto">Auto</option>
          {QUALITY_LEVELS.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}
