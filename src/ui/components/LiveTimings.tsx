import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { frameStore } from '../../core/frameStore';
import { useLive } from '../../core/liveStore';
import { stats } from '../../core/stats/collector';
import type { StatsSnapshot } from '../../core/stats/collector';

interface Row {
  id: string;
  stage: string;
  what: string;
  value: (s: StatsSnapshot) => string;
}

const ms = (v: number, digits = 1) => `${v.toFixed(digits)} ms`;

const ROWS: Row[] = [
  {
    id: 'fps',
    stage: 'Video loop',
    what: 'Camera frames the page sees per second',
    value: (s) => `${s.fps.toFixed(1)} fps`,
  },
  {
    id: 'infer',
    stage: 'Inference rate',
    what: 'Frames per second that came back from the models',
    value: (s) => `${s.inferFps.toFixed(1)} per s`,
  },
  {
    id: 'capture',
    stage: 'Capture',
    what: 'Turning the video frame into an ImageBitmap',
    value: (s) => ms(s.capture),
  },
  {
    id: 'worker',
    stage: 'Worker round trip',
    what: 'Send the frame, run the models, get the numbers back',
    value: (s) => ms(s.worker),
  },
  {
    id: 'face',
    stage: 'Face model',
    what: 'Landmarks and blendshapes, inside the worker',
    value: (s) => ms(s.face),
  },
  {
    id: 'hand',
    stage: 'Hand model',
    what: 'Hand landmarks, inside the worker',
    value: (s) => ms(s.hand),
  },
  {
    id: 'gesture',
    stage: 'Gesture recogniser',
    what: 'Cross-check, every 8th frame, only with a hand in view',
    value: (s) => ms(s.gesture),
  },
  {
    id: 'identity',
    stage: 'Face recognition',
    what: 'Alignment and embedding for new faces and about every 500 ms',
    value: (s) => ms(s.identity),
  },
  {
    id: 'draw',
    stage: 'Draw',
    what: 'The canvas overlay, on the page',
    value: (s) => ms(s.draw, 2),
  },
];

/** Per-stage timings straight from the stats collector the Live Studio panel uses. Polled 4x a second. */
export function LiveTimings() {
  const [snap, setSnap] = useState<StatsSnapshot>(() => stats.snapshot());
  const running = useStore(frameStore, (s) => s.running);
  const delegate = useLive((s) => s.delegate);
  useEffect(() => {
    const id = setInterval(() => setSnap(stats.snapshot()), 250);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="space-y-2" data-testid="live-timings" data-running={running}>
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="py-1 font-medium">Stage</th>
            <th className="font-medium">What it is</th>
            <th className="text-right font-medium">Now</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.id} className="border-t border-neutral-800" data-testid={`timing-${r.id}`}>
              <td className="py-1.5 pr-3 font-medium text-neutral-200">{r.stage}</td>
              <td className="pr-3 text-neutral-400">{r.what}</td>
              <td className="text-right font-mono tabular-nums text-neutral-100">
                {running ? r.value(snap) : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-neutral-500">
        {running
          ? `Live numbers from this session${delegate ? ` (models on the ${delegate})` : ''}, averaged over the last 60 frames.`
          : 'Start the camera to see live numbers. They are measured on your device, in this session.'}
      </p>
    </div>
  );
}
