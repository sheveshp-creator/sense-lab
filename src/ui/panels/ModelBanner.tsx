import { live } from '../../core/pipeline';
import { useLive } from '../../core/liveStore';
import { MODEL_LABEL, friendlyModelError, friendlyRuntimeError } from '../../core/errors';
import type { ModelName } from '../../core/worker/protocol';

const ORDER: ModelName[] = ['face', 'hand', 'gesture', 'identity'];

/**
 * Says what is loading and what failed, in plain words, with a Retry per failed model.
 * Models load on first use, so on a slow connection this is what tells the user why nothing is drawn yet.
 */
export function ModelBanner() {
  const load = useLive((s) => s.modelLoad);
  const runtimeError = useLive((s) => s.runtimeError);
  const failed = ORDER.filter((m) => load[m].state === 'error');
  const loading = ORDER.filter((m) => load[m].state === 'loading');

  return (
    <div className="space-y-2 empty:hidden" aria-live="polite">
      {failed.map((m) => {
        const f = friendlyModelError(m, load[m].message ?? '');
        return (
          <div key={m} role="alert" className="rounded-sm bg-red-950 p-3 text-sm text-red-200">
            <p className="font-medium">{f.title}</p>
            <p className="mt-1 text-red-300">{f.hint}</p>
            {load[m].message && (
              <p className="mt-1 break-words font-mono text-xs text-red-400/80">
                {load[m].message}
              </p>
            )}
            <button
              className="mt-2 rounded bg-red-900 px-3 py-1 hover:bg-red-800"
              onClick={() => live.retry?.(m)}
            >
              Retry {MODEL_LABEL[m]}
            </button>
          </div>
        );
      })}
      {runtimeError && (
        <p role="alert" className="rounded-sm bg-red-950 p-3 text-sm text-red-200">
          {friendlyRuntimeError(runtimeError)}
        </p>
      )}
      {loading.length > 0 && failed.length === 0 && (
        <p className="text-sm text-neutral-400" data-testid="models-loading">
          Loading {loading.map((m) => MODEL_LABEL[m]).join(', ')}…
        </p>
      )}
    </div>
  );
}
