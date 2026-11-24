import { useEffect, useState } from 'react';
import { bus } from '../../events/bus';
import type { GestureEvent } from '../../features/hand/types';

const MAX_EVENTS = 40;

/** Recent gesture start/end events from the event bus, newest first. */
export function GestureTimeline() {
  const [events, setEvents] = useState<GestureEvent[]>([]);
  const [now, setNow] = useState(() => performance.now());

  useEffect(() => {
    // Face events (blinks, expression changes) share the bus but are not gestures.
    const off = bus.onAny((name, e) => {
      if (String(name).startsWith('gesture:'))
        setEvents((prev) => [e as GestureEvent, ...prev].slice(0, MAX_EVENTS));
    });
    const tick = setInterval(() => setNow(performance.now()), 500);
    return () => {
      off();
      clearInterval(tick);
    };
  }, []);

  return (
    <section aria-label="Gesture timeline" className="w-80 panel">
      <h2 className="label">Gesture timeline</h2>
      {events.length === 0 && (
        <p className="text-sm text-neutral-500">Show a gesture to see events.</p>
      )}
      <ul className="max-h-64 space-y-0.5 overflow-y-auto font-mono text-xs">
        {events.map((e, i) => (
          <li
            key={`${e.t}-${e.id}-${e.kind}-${i}`}
            className="flex gap-2"
            data-testid="timeline-item"
          >
            <span className="w-12 text-neutral-500">{((now - e.t) / 1000).toFixed(1)}s</span>
            <span
              className={
                e.kind === 'end'
                  ? 'text-neutral-500'
                  : e.kind === 'fire'
                    ? 'text-accent'
                    : 'text-ok'
              }
            >
              {e.kind === 'start' ? '▶' : e.kind === 'fire' ? '●' : '■'}
            </span>
            <span className="flex-1">{e.id}</span>
            <span className="text-neutral-500">
              {e.handId < 0 ? 'both' : `${e.hand[0]}#${e.handId}`}
              {e.kind !== 'end' ? ` ${(e.confidence * 100).toFixed(0)}%` : ''}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
