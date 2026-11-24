import { useEffect, useMemo, useState } from 'react';
import { frameStore } from '../../core/frameStore';
import { EXPRESSIONS } from '../../features/face/expression';
import type { Expression } from '../../features/face/expression';
import { MultiLineChart } from '../../ui/components/MultiLineChart';
import type { MoodSeries } from './model';
import { ActionBar, ControlsTable } from '../ActionBar';
import { MOOD_ACTIONS } from './actions';
import type { MoodAction } from './actions';
import { MoodModel } from './model';

/** One fixed colour per expression: the first five slots of the categorical palette, dark steps, validated. */
const COLORS: Record<Expression, string> = {
  happy: '#3987e5',
  sad: '#d95926',
  angry: '#199e70',
  surprised: '#c98500',
  neutral: '#d55181',
};

interface View {
  now: number;
  series: MoodSeries;
  faces: { id: number; expression: Expression }[];
  room: Expression | null;
  paused: boolean;
}

// One model for the session: the history carries on when you look at another demo and come back.
const model = new MoodModel();

/** Mood Meter: the average of every visible face's expression scores over the last minute. */
export default function MoodMeter() {
  const [view, setView] = useState<View>({
    now: 0, // set on the first tick (performance.now() must not be called during render)
    series: { t: [], values: EXPRESSIONS.map(() => []) },
    faces: [],
    room: null,
    paused: false,
  });

  useEffect(() => {
    const sampler = setInterval(
      () => model.sample(performance.now(), frameStore.getState().faces),
      100,
    );
    const render = setInterval(() => {
      const now = performance.now();
      setView({
        now,
        series: model.read(now),
        faces: frameStore.getState().faces.map((f) => ({ id: f.id, expression: f.expression })),
        room: model.room(),
        paused: model.paused,
      });
    }, 250);
    return () => {
      clearInterval(sampler);
      clearInterval(render);
    };
  }, []);

  const handlers: Record<MoodAction, () => void> = useMemo(
    () => ({
      pause: () => {
        model.paused = !model.paused;
      },
      reset: () => model.reset(),
    }),
    [],
  );

  return (
    <div className="space-y-4">
      <div className="viz-root rounded-sm p-4" style={{ background: 'var(--surface-1)' }}>
        <MultiLineChart
          title="Expressions across all faces, average score"
          t={view.series.t}
          series={EXPRESSIONS.map((e, i) => ({
            name: e[0]!.toUpperCase() + e.slice(1),
            color: COLORS[e],
            v: view.series.values[i]!,
          }))}
          now={view.now}
          windowMs={60_000}
          windowLabel="60 s"
          domain={[0, 1]}
          ticks={[0, 0.5, 1]}
          format={(v) => `${Math.round(v * 100)}%`}
        />
      </div>
      <div
        className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm"
        data-testid="mood-summary"
      >
        <p>
          Room mood:{' '}
          <strong className="capitalize" data-testid="room-mood">
            {view.room ?? 'no one in view'}
          </strong>
          {view.paused && <span className="ml-2 text-accent">(paused)</span>}
        </p>
        <ul className="flex flex-wrap gap-2 text-xs text-neutral-300" aria-label="Faces now">
          {view.faces.map((f) => (
            <li
              key={f.id}
              className="rounded-sm border border-line px-2 py-1"
              data-testid="mood-face"
            >
              Face {f.id}: <span className="capitalize">{f.expression}</span>
            </li>
          ))}
        </ul>
      </div>
      <ActionBar actions={MOOD_ACTIONS} handlers={handlers} />
      <ControlsTable actions={MOOD_ACTIONS} />
      <p className="text-xs text-neutral-500">
        This is the app's reading of what faces are doing, not of how people feel. Happy and
        surprised are reliable; sad and angry are weak.
      </p>
    </div>
  );
}
