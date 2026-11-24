import { useEffect, useState } from 'react';
import { live } from '../../core/pipeline';
import { DEFAULT_THRESHOLD, identityService } from '../../features/face/identityService';
import { ACTIVE_IDENTITY_MODEL } from '../../features/face/identityModel';

interface Row {
  id: number;
  text: string;
  state: string;
}

/** Threshold slider and the live recognition result for every tracked face. */
export function RecognitionPanel() {
  const [threshold, setThreshold] = useState(identityService.threshold);
  const [rows, setRows] = useState<Row[]>([]);
  const status = identityService.status;

  useEffect(() => {
    const id = setInterval(() => {
      const faces = live.faces?.alive ?? [];
      setRows(
        faces
          .filter((f) => f.visible)
          .map((f) => {
            const l = identityService.labelFor(f.id);
            const q = identityService.quality.get(f.id);
            let text = 'no one registered';
            if (l?.state === 'known') text = `${l.name} (${l.confidence.toFixed(2)})`;
            else if (l?.state === 'unknown') text = `Unknown (${l.confidence.toFixed(2)})`;
            else if (l) text = 'identifying...';
            const quality = q
              ? ` · sharp ${q.sharpness.toFixed(0)} · light ${q.brightness.toFixed(0)}`
              : '';
            return { id: f.id, state: l?.state ?? 'off', text: text + quality };
          }),
      );
    }, 200);
    return () => clearInterval(id);
  }, []);

  return (
    <section aria-label="Recognition" className="w-80 space-y-3 panel">
      <h2 className="label">Recognition</h2>
      <label className="block text-sm">
        Match threshold: <span data-testid="threshold-value">{threshold.toFixed(2)}</span>
        <input
          type="range"
          min={0.2}
          max={0.8}
          step={0.01}
          value={threshold}
          aria-label="Match threshold"
          className="mt-1 w-full"
          onChange={(e) => {
            const v = Number(e.target.value);
            setThreshold(v);
            identityService.setThreshold(v);
          }}
        />
      </label>
      <p className="text-xs text-neutral-500">
        Below this cosine similarity a face shows as Unknown. Lower accepts more look-alikes; higher
        turns away more real matches. Default {DEFAULT_THRESHOLD}; the model authors suggest{' '}
        {ACTIVE_IDENTITY_MODEL.authorsThreshold}.
      </p>
      <ul className="space-y-0.5 text-sm" data-testid="faces">
        {rows.length === 0 && <li className="text-neutral-500">No face in view.</li>}
        {rows.map((r) => (
          <li key={r.id} data-testid="face-row" data-state={r.state}>
            <span className="text-neutral-500">#{r.id}</span> {r.text}
          </li>
        ))}
      </ul>
      {status.state === 'ready' && (
        <p className="text-xs text-neutral-500">
          {status.modelId} · {status.dim}-d · {status.provider}
        </p>
      )}
    </section>
  );
}
