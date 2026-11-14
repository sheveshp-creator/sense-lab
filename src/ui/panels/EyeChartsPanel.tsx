import { DEFAULT_BLINK } from '../../features/face/eyes/blink';
import { useFaceSnapshot } from '../hooks/useFaceSnapshot';
import { LineChart } from '../components/LineChart';

/** Two small charts of the last 10 seconds: eye closure with the blink thresholds, and horizontal gaze. */
export function EyeChartsPanel() {
  const snap = useFaceSnapshot();
  return (
    <section
      aria-label="Eye charts"
      className="viz-root w-80 space-y-4 rounded-lg p-4"
      style={{ background: 'var(--surface-1)' }}
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
        Last 10 seconds
      </h2>
      {!snap ? (
        <p className="text-sm text-neutral-500">No face in view.</p>
      ) : (
        <>
          <LineChart
            title="Eye closure"
            eventsLabel="ticks mark counted blinks"
            unit="closure (0 open, 1 shut)"
            t={snap.history.t}
            v={snap.history.closure}
            events={snap.blinkTimes}
            now={snap.now}
            domain={[0, 1]}
            ticks={[0, 0.5, 1]}
            format={(x) => x.toFixed(2)}
            guides={[
              { value: DEFAULT_BLINK.down, label: 'closed above' },
              { value: DEFAULT_BLINK.up, label: 'open below' },
            ]}
            color="var(--series-1)"
          />
          <LineChart
            title="Gaze, left to right"
            unit="degrees (+ right)"
            t={snap.history.t}
            v={snap.history.gazeX}
            now={snap.now}
            domain={[-40, 40]}
            ticks={[-40, 0, 40]}
            format={(x) => `${x > 0 ? '+' : ''}${x.toFixed(0)}°`}
            color="var(--series-2)"
          />
        </>
      )}
    </section>
  );
}
