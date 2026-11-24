import { useEffect, useState } from 'react';
import { falseTriggers } from '../../core/falseTriggers';
import type { FalseTriggerSnapshot } from '../../core/falseTriggers';

/**
 * For tuning: press Start, then talk, type and move around for a minute WITHOUT making any
 * gesture. Whatever fires in that time is a false trigger.
 */
export function FalseTriggerPanel() {
  const [s, setS] = useState<FalseTriggerSnapshot>(() => falseTriggers.snapshot());
  useEffect(() => {
    const id = setInterval(() => setS(falseTriggers.snapshot()), 250);
    return () => clearInterval(id);
  }, []);
  const mins = Math.floor(s.elapsedSec / 60);
  const secs = Math.floor(s.elapsedSec % 60);
  const breakdown = Object.entries(s.byGesture).sort((a, b) => b[1] - a[1]);

  return (
    <section aria-label="False triggers" className="w-64 panel">
      <h2 className="label">False triggers</h2>
      <p className="mb-2 text-xs text-neutral-500">
        Press start, then talk and type for a minute without making a gesture.
      </p>
      <button
        className="mb-2 rounded bg-neutral-800 px-3 py-1 text-sm hover:bg-neutral-700"
        onClick={() => (s.running ? falseTriggers.stop() : falseTriggers.start())}
      >
        {s.running ? 'Stop test' : 'Start test'}
      </button>
      <dl className="space-y-1 font-mono text-sm">
        <div className="flex justify-between">
          <dt className="text-neutral-400">Elapsed</dt>
          <dd data-testid="ft-elapsed">
            {mins}:{String(secs).padStart(2, '0')}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-neutral-400">Triggers</dt>
          <dd data-testid="ft-count">{s.count}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-neutral-400">Per minute</dt>
          <dd data-testid="ft-rate">
            {s.perMinute > 0 || s.elapsedSec >= 5 ? s.perMinute.toFixed(1) : '-'}
          </dd>
        </div>
      </dl>
      {breakdown.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-neutral-400">
          {breakdown.map(([id, n]) => (
            <li key={id} className="flex justify-between">
              <span>{id}</span>
              <span>{n}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
