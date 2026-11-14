import { useEffect, useState } from 'react';
import { live } from '../../core/pipeline';
import { FINGER_NAMES, FINGER_STATE_NAMES } from '../../features/hand/fingers';
import { builtinName } from '../../features/hand/builtinLabels';

interface HandRow {
  id: number;
  hand: string;
  gesture: string | null;
  cross: string;
  builtin: string;
  curl: number[];
  state: number[];
  speed: number[];
}

const CHIP = ['bg-emerald-600', 'bg-amber-600', 'bg-red-600'];

/** Polls the live hands 8x/second (never per frame) and shows each finger's state. */
export function FingerPanel() {
  const [rows, setRows] = useState<HandRow[]>([]);
  useEffect(() => {
    const id = setInterval(() => {
      const views = live.hands?.views ?? [];
      setRows(
        views.map((v) => ({
          id: v.track.id,
          hand: v.track.handedness,
          gesture: v.gesture,
          cross: v.cross,
          builtin: builtinName(v.track.builtinLabel),
          curl: Array.from(v.frame.curl),
          state: Array.from(v.frame.state),
          speed: Array.from(v.frame.tipSpeed),
        })),
      );
    }, 125);
    return () => clearInterval(id);
  }, []);

  return (
    <section aria-label="Finger states" className="w-80 space-y-3 rounded-lg bg-neutral-900 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
        Finger states
      </h2>
      {rows.length === 0 && <p className="text-sm text-neutral-500">No hand in view.</p>}
      {rows.map((r) => (
        <div key={r.id} data-testid={`hand-${r.id}`} className="space-y-1">
          <div className="flex items-baseline justify-between">
            <span className="font-medium">
              Hand #{r.id} · {r.hand}
            </span>
            <span data-testid="gesture-tag" className="font-mono text-sm text-emerald-300">
              {r.gesture ?? '-'}
            </span>
          </div>
          <p className="text-xs text-neutral-500">
            MediaPipe says {r.builtin} · cross-check: {r.cross}
          </p>
          <table className="w-full font-mono text-xs">
            <tbody>
              {FINGER_NAMES.map((name, i) => (
                <tr key={name}>
                  <td className="w-16 py-0.5 text-neutral-400">{name}</td>
                  <td className="w-16">
                    <span
                      data-testid={`finger-${name}`}
                      className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${CHIP[r.state[i]!]}`}
                    >
                      {FINGER_STATE_NAMES[r.state[i]!]}
                    </span>
                  </td>
                  <td className="pr-2">
                    <div className="h-1.5 rounded bg-neutral-800">
                      <div
                        className="h-1.5 rounded bg-neutral-300"
                        style={{ width: `${r.curl[i]! * 100}%` }}
                      />
                    </div>
                  </td>
                  <td className="w-14 text-right text-neutral-400">{r.speed[i]!.toFixed(1)}/s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  );
}
