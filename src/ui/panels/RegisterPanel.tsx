import { useEffect, useState } from 'react';
import { useLive } from '../../core/liveStore';
import { identityService } from '../../features/face/identityService';
import { STEPS } from '../../features/face/registration';
import type { Progress } from '../../features/face/registration';

/** Guided capture: front, left, right, up, down. Bad frames are skipped with a hint; then save. */
export function RegisterPanel() {
  const [name, setName] = useState('');
  const [relax, setRelax] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const faceOn = useLive((s) => s.models.face && s.models.identity);

  useEffect(() => {
    const id = setInterval(() => setProgress(identityService.registrationProgress()), 100);
    return () => clearInterval(id);
  }, []);
  // Leaving the page cancels an unfinished capture.
  useEffect(() => () => identityService.cancelRegistration(), []);

  const status = identityService.status;
  const ready = status.state === 'ready';

  const start = () => {
    setSaved(null);
    setError(null);
    identityService.startRegistration({ relaxPose: relax });
  };
  const save = async () => {
    try {
      const p = await identityService.finishRegistration(name);
      setSaved(`Saved ${p.name} (${p.embeddings.length} frames).`);
      setName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    }
  };

  return (
    <section
      aria-label="Register a person"
      className="w-80 space-y-3 rounded-lg bg-neutral-900 p-4"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
        Register a person
      </h2>
      {status.state === 'missing' && (
        <p role="alert" className="rounded bg-amber-950 p-2 text-xs text-amber-300">
          The face-recognition model is not installed. Run <code>./scripts/fetch-models.sh</code>,
          then reload. Faces and hands still work without it.
        </p>
      )}
      {status.state === 'error' && (
        <p role="alert" className="rounded bg-red-950 p-2 text-xs text-red-300">
          The face-recognition model failed to load: {status.message}
        </p>
      )}
      {!faceOn && ready && (
        <p className="text-xs text-amber-300">
          Turn on "Face model" and "Face recognition" in Live Studio first.
        </p>
      )}

      {!progress ? (
        <>
          <label className="block text-sm">
            Name
            <input
              className="mt-1 block w-full rounded bg-neutral-800 px-2 py-1"
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Alex"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-neutral-400">
            <input type="checkbox" checked={relax} onChange={(e) => setRelax(e.target.checked)} />
            Skip the head-turn guidance (any clear front-facing frame counts)
          </label>
          <button
            className="rounded bg-emerald-500 px-3 py-1.5 text-sm font-medium text-black disabled:opacity-40"
            disabled={!ready || !name.trim() || !faceOn}
            onClick={start}
          >
            Start guided capture
          </button>
        </>
      ) : (
        <div className="space-y-2">
          <ol className="flex gap-1 text-xs">
            {STEPS.map((s, i) => (
              <li
                key={s.id}
                className={`rounded px-1.5 py-0.5 ${
                  progress.done || i < progress.step
                    ? 'bg-emerald-700'
                    : i === progress.step
                      ? 'bg-neutral-100 text-black'
                      : 'bg-neutral-800'
                }`}
              >
                {s.id}
              </li>
            ))}
          </ol>
          <p aria-live="polite" data-testid="reg-hint" className="text-sm text-neutral-100">
            {progress.hint}
          </p>
          <p className="text-xs text-neutral-500" data-testid="reg-count">
            {progress.collected} / {progress.total} good frames · skipped:{' '}
            {progress.rejected.blurry} blurry, {progress.rejected.dark} dark,{' '}
            {progress.rejected.pose} wrong pose
          </p>
          <div className="flex gap-2 text-sm">
            {progress.done ? (
              <button
                className="rounded bg-emerald-500 px-3 py-1.5 font-medium text-black"
                onClick={() => void save()}
              >
                Save {name.trim() || 'person'}
              </button>
            ) : (
              <button
                className="rounded bg-neutral-800 px-2 py-1 hover:bg-neutral-700"
                onClick={() => identityService.skipRegistrationStep()}
              >
                Skip this pose
              </button>
            )}
            <button
              className="rounded bg-neutral-800 px-2 py-1 hover:bg-neutral-700"
              onClick={() => identityService.cancelRegistration()}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {saved && (
        <p role="status" data-testid="reg-saved" className="text-sm text-emerald-300">
          {saved}
        </p>
      )}
      {error && <p className="text-sm text-red-300">{error}</p>}
      {!progress && !saved && (
        <p className="text-xs text-neutral-500">One person in front of the camera, good light.</p>
      )}
    </section>
  );
}
