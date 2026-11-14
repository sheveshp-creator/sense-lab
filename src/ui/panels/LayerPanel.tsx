import { FACE_LAYER_KEYS, HAND_LAYER_KEYS, LAYER_LABELS, useLive } from '../../core/liveStore';
import type { LayerToggles, ModelToggles } from '../../core/liveStore';

function Group({ title, keys }: { title: string; keys: readonly (keyof LayerToggles)[] }) {
  const layers = useLive((s) => s.layers);
  const setLayer = useLive((s) => s.setLayer);
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {title}
      </h3>
      <div className="grid grid-cols-2 gap-1">
        {keys.map((k) => (
          <label key={k} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={layers[k]}
              onChange={(e) => setLayer(k, e.target.checked)}
            />
            {LAYER_LABELS[k]}
          </label>
        ))}
      </div>
    </div>
  );
}

const MODEL_LABELS: Record<keyof ModelToggles, string> = {
  face: 'Face model',
  hands: 'Hand models',
  identity: 'Face recognition',
};

export function LayerPanel() {
  const models = useLive((s) => s.models);
  const setModel = useLive((s) => s.setModel);
  return (
    <section aria-label="Layers" className="w-64 space-y-3 rounded-lg bg-neutral-900 p-4">
      <div>
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-neutral-400">
          Models
        </h2>
        <div className="grid grid-cols-2 gap-1">
          {(Object.keys(MODEL_LABELS) as (keyof ModelToggles)[]).map((k) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={models[k]}
                onChange={(e) => setModel(k, e.target.checked)}
              />
              {MODEL_LABELS[k]}
            </label>
          ))}
        </div>
      </div>
      <Group title="Face layers" keys={FACE_LAYER_KEYS} />
      <Group title="Hand layers" keys={HAND_LAYER_KEYS} />
    </section>
  );
}
