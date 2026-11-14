import { useFaceSnapshot } from '../hooks/useFaceSnapshot';
import { EXPRESSIONS } from '../../features/face/expression';

/** Live meter: how strongly each of the five expressions shows, and the label that has held steady. */
export function ExpressionPanel() {
  const snap = useFaceSnapshot();
  return (
    <section aria-label="Expression" className="w-80 space-y-2 rounded-lg bg-neutral-900 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Expression</h2>
      {!snap ? (
        <p className="text-sm text-neutral-500">No face in view.</p>
      ) : (
        <>
          <p className="text-2xl font-semibold capitalize" data-testid="expression-label">
            {snap.expression}
          </p>
          <ul className="space-y-1" aria-label="Expression scores">
            {EXPRESSIONS.map((e, i) => {
              const pct = Math.round((snap.scores[i] ?? 0) * 100);
              const on = e === snap.expression;
              return (
                <li
                  key={e}
                  className="flex items-center gap-2 text-xs"
                  data-testid={`expr-${e}`}
                  data-active={on}
                >
                  <span
                    className={`w-16 capitalize ${on ? 'font-semibold text-neutral-100' : 'text-neutral-400'}`}
                  >
                    {e}
                  </span>
                  <div
                    className="h-2 flex-1 rounded bg-neutral-800"
                    role="meter"
                    aria-label={e}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={pct}
                  >
                    <div
                      className={`h-2 rounded ${on ? 'bg-emerald-400' : 'bg-neutral-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-8 text-right tabular-nums text-neutral-300">{pct}%</span>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-neutral-500">
            Rule-based v1 on the 52 face blendshape scores. It describes what the face is doing, not
            how you feel. Happy and surprised are reliable; sad and angry are the weakest.
          </p>
        </>
      )}
    </section>
  );
}
