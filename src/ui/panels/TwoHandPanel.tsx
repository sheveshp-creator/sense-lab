import { useEffect, useState } from 'react';
import { live } from '../../core/pipeline';

interface Snap {
  pair: boolean;
  engaged: boolean;
  scale: number;
  deg: number;
  gap: number;
  active: string[];
}

/** Live two-hand state: is the grip engaged, current zoom and rotation, held shapes. */
export function TwoHandPanel() {
  const [s, setS] = useState<Snap | null>(null);
  useEffect(() => {
    const id = setInterval(() => {
      const t = live.hands?.twoHand;
      setS(
        t
          ? {
              pair: t.pair,
              engaged: t.engaged,
              scale: t.scale,
              deg: t.deg,
              gap: t.gapPalms,
              active: [...t.active],
            }
          : null,
      );
    }, 125);
    return () => clearInterval(id);
  }, []);
  return (
    <section aria-label="Two hands" className="w-80 rounded-lg bg-neutral-900 p-4">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-400">
        Two hands
      </h2>
      {!s?.pair ? (
        <p className="text-sm text-neutral-500">
          Show both hands. Open palms to start zoom / rotate.
        </p>
      ) : (
        <dl className="space-y-1 font-mono text-sm">
          <Row k="Grip" v={s.engaged ? 'engaged' : 'open both palms'} />
          <Row k="Zoom" v={s.engaged ? `${s.scale.toFixed(2)}x` : '-'} testId="th-scale" />
          <Row k="Rotate" v={s.engaged ? `${s.deg.toFixed(0)}°` : '-'} testId="th-deg" />
          <Row k="Gap" v={`${s.gap.toFixed(1)} palms`} />
          <Row k="Held" v={s.active.length ? s.active.join(', ') : '-'} />
        </dl>
      )}
    </section>
  );
}

function Row({ k, v, testId }: { k: string; v: string; testId?: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-neutral-400">{k}</dt>
      <dd data-testid={testId}>{v}</dd>
    </div>
  );
}
