import { useState } from 'react';
import { blockers, chooseThread, degradations, detectCapabilities } from '../../core/capabilities';

const FEATURES = [
  {
    title: 'Faces',
    text: 'Landmarks, expressions, blinks, gaze, and recognition of people you register.',
  },
  {
    title: 'Hands',
    text: 'Finger states, poses, swipes, pinches, and two-hand zoom, rotate and clap.',
  },
  {
    title: 'Private',
    text: 'Everything runs on this device. No server, no upload, no photos saved.',
  },
];

export function WelcomePage({
  onConsent,
  onHow,
  onWarm,
}: {
  onConsent: () => void;
  onHow: () => void;
  /** Called when the user ticks the box: a good moment to start fetching the next page's code. */
  onWarm?: () => void;
}) {
  const [agreed, setAgreed] = useState(false);
  // Probed once. What this browser lacks is said up front instead of failing after the camera starts.
  const [env] = useState(() => {
    const caps = detectCapabilities();
    return { stop: blockers(caps), notes: degradations(caps, chooseThread(caps)) };
  });
  return (
    <main className="animate-fade-in mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 p-6">
      <header className="space-y-3">
        <h1 className="bg-gradient-to-r from-emerald-300 via-sky-300 to-violet-300 bg-clip-text text-5xl font-semibold tracking-tight text-transparent">
          SenseLab
        </h1>
        <p className="max-w-xl text-lg text-neutral-300">
          Real-time face and hand recognition that runs entirely in your browser.
        </p>
      </header>
      <ul className="grid gap-3 sm:grid-cols-3">
        {FEATURES.map((f) => (
          <li key={f.title} className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
            <p className="font-medium">{f.title}</p>
            <p className="mt-1 text-sm text-neutral-400">{f.text}</p>
          </li>
        ))}
      </ul>
      <section
        aria-label="Consent"
        className="space-y-4 rounded-xl border border-neutral-800 bg-neutral-900/60 p-5"
      >
        <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-300">
          <li>Your video never leaves this device. There is no backend and no upload.</li>
          <li>Photos and video frames are never stored.</li>
          <li>
            Only face embeddings and names you register are saved, locally, and you can delete them
            anytime.
          </li>
        </ul>
        {env.stop.length > 0 && (
          <div role="alert" className="space-y-1 rounded-lg bg-red-950 p-3 text-sm text-red-200">
            {env.stop.map((m) => (
              <p key={m}>{m}</p>
            ))}
          </div>
        )}
        {env.notes.length > 0 && (
          <ul
            aria-label="About this browser"
            className="list-disc space-y-1 pl-5 text-sm text-amber-200/90"
          >
            {env.notes.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-1"
            checked={agreed}
            onChange={(e) => {
              setAgreed(e.target.checked);
              if (e.target.checked) onWarm?.();
            }}
          />
          <span>I understand and agree to let SenseLab use my camera on this device.</span>
        </label>
        <div className="flex flex-wrap items-center gap-4">
          <button
            className="rounded-full bg-emerald-400 px-5 py-2 font-medium text-neutral-950 transition hover:bg-emerald-300 active:scale-95 disabled:opacity-40 disabled:hover:bg-emerald-400"
            disabled={!agreed || env.stop.length > 0}
            onClick={onConsent}
          >
            Start camera
          </button>
          <button
            className="text-sm text-neutral-400 underline hover:text-neutral-200"
            onClick={onHow}
          >
            How it works (no camera needed)
          </button>
        </div>
      </section>
    </main>
  );
}
