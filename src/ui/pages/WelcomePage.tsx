import { useState } from 'react';
import { blockers, chooseThread, degradations, detectCapabilities } from '../../core/capabilities';

/** A 24x24 line icon from one path. Decorative: the text next to it carries the meaning. */
const Icon = ({ d }: { d: string }) => (
  <svg
    viewBox="0 0 24 24"
    width="22"
    height="22"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d={d} />
  </svg>
);

const FEATURES = [
  {
    title: 'Faces',
    text: 'Landmarks, expressions, blinks, gaze, and recognition of people you register.',
    icon: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9 10h.01M15 10h.01M8.5 14.5c.9 1 2 1.5 3.5 1.5s2.6-.5 3.5-1.5',
    tone: 'from-emerald-400/20 text-emerald-300',
  },
  {
    title: 'Hands',
    text: 'Finger states, poses, swipes, pinches, and two-hand zoom, rotate and clap.',
    icon: 'M8 12V5.5a1.5 1.5 0 0 1 3 0V11m0-1V4a1.5 1.5 0 0 1 3 0v6m0-4.5a1.5 1.5 0 0 1 3 0V14c0 4-2.5 7-6 7-2.6 0-4-1.4-5.4-3.6L4 13.4a1.5 1.5 0 0 1 2.5-1.6L8 13.5',
    tone: 'from-sky-400/20 text-sky-300',
  },
  {
    title: 'Six demos',
    text: 'Air Draw, Slide Remote, 3D Object, Mirror Avatar, Blink Battle and Mood Meter.',
    icon: 'M6 4l14 8-14 8V4Z',
    tone: 'from-violet-400/20 text-violet-300',
  },
  {
    title: 'Private',
    text: 'Everything runs on this device. No server, no upload, no photos saved.',
    icon: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3ZM9 12l2 2 4-4',
    tone: 'from-amber-400/20 text-amber-300',
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
  const blocked = env.stop.length > 0;

  return (
    <div className="relative isolate min-h-screen overflow-hidden">
      {/* Soft colour glows and a faint grid behind everything. Decorative only. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="absolute -right-40 top-40 h-[30rem] w-[30rem] rounded-full bg-sky-500/15 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
            backgroundSize: '56px 56px',
            maskImage: 'radial-gradient(ellipse at 50% 20%, black, transparent 70%)',
            WebkitMaskImage: 'radial-gradient(ellipse at 50% 20%, black, transparent 70%)',
          }}
        />
      </div>

      <main className="animate-fade-in mx-auto flex max-w-6xl flex-col gap-16 px-6 py-12 sm:py-16">
        <section className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
          <div className="space-y-7">
            <p className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
              Runs 100% on your device
            </p>
            <header className="space-y-4">
              <h1 className="bg-gradient-to-r from-emerald-300 via-sky-300 to-violet-300 bg-clip-text text-6xl font-semibold tracking-tight text-transparent sm:text-7xl">
                SenseLab
              </h1>
              <p className="max-w-xl text-lg leading-relaxed text-neutral-300">
                Real-time face and hand recognition that runs entirely in your browser. Point your
                webcam at it and play: nothing is uploaded.
              </p>
            </header>

            <section
              aria-label="Consent"
              className="space-y-4 rounded-2xl border border-neutral-700/70 bg-neutral-900/70 p-5 shadow-xl shadow-black/30 backdrop-blur"
            >
              <ul className="space-y-1.5 text-sm text-neutral-300">
                {[
                  'Your video never leaves this device. There is no backend and no upload.',
                  'Photos and video frames are never stored.',
                  'Only face embeddings and names you register are saved, locally, and you can delete them anytime.',
                ].map((t) => (
                  <li key={t} className="flex gap-2.5">
                    <span className="mt-0.5 text-emerald-400" aria-hidden>
                      ✓
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
              {blocked && (
                <div
                  role="alert"
                  className="space-y-1 rounded-lg bg-red-950 p-3 text-sm text-red-200"
                >
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
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-neutral-800 bg-neutral-950/60 p-3 transition hover:border-neutral-600">
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-400"
                  checked={agreed}
                  onChange={(e) => {
                    setAgreed(e.target.checked);
                    if (e.target.checked) onWarm?.();
                  }}
                />
                <span className="text-sm leading-snug text-neutral-100">
                  I understand and agree to let SenseLab use my camera on this device.
                </span>
              </label>
              <div className="flex flex-wrap items-center gap-4">
                <button
                  className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-400 to-sky-400 px-6 py-2.5 font-semibold text-neutral-950 shadow-lg shadow-emerald-500/20 transition hover:brightness-110 active:scale-95 disabled:from-neutral-700 disabled:to-neutral-700 disabled:text-neutral-400 disabled:shadow-none disabled:hover:brightness-100"
                  disabled={!agreed || blocked}
                  onClick={onConsent}
                >
                  Start camera
                  <span
                    aria-hidden
                    className="transition group-enabled:group-hover:translate-x-0.5"
                  >
                    →
                  </span>
                </button>
                <button
                  className="text-sm text-neutral-400 underline decoration-neutral-600 underline-offset-4 hover:text-neutral-100"
                  onClick={onHow}
                >
                  How it works (no camera needed)
                </button>
              </div>
            </section>
          </div>

          <figure className="space-y-3">
            <div className="overflow-hidden rounded-2xl border border-neutral-700/70 bg-neutral-900 shadow-2xl shadow-emerald-500/10 ring-1 ring-white/5">
              <div className="flex items-center gap-1.5 border-b border-neutral-800 bg-neutral-900 px-4 py-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" aria-hidden />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" aria-hidden />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" aria-hidden />
                <span className="ml-3 text-xs text-neutral-500">SenseLab · Live Studio</span>
              </div>
              <img
                src={`${import.meta.env.BASE_URL}preview.jpg`}
                alt="The Live Studio page: a face and a hand tracked with landmarks, and per-model timings"
                width={1100}
                height={688}
                className="block w-full"
              />
            </div>
            <figcaption className="text-center text-sm text-neutral-500">
              Face and hand tracking with live per-model timings, all on-device.
            </figcaption>
          </figure>
        </section>

        <section aria-label="What it does" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5 transition hover:-translate-y-0.5 hover:border-neutral-600"
            >
              <span
                className={`mb-3 inline-grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br to-transparent ${f.tone}`}
              >
                <Icon d={f.icon} />
              </span>
              <p className="font-medium text-neutral-100">{f.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-neutral-400">{f.text}</p>
            </div>
          ))}
        </section>

        <footer className="mx-auto w-full max-w-2xl">
          <div className="flex items-center gap-6 rounded-3xl bg-gradient-to-br from-emerald-400/50 via-sky-400/40 to-violet-400/50 p-px">
            <div className="flex w-full items-center gap-6 rounded-3xl bg-neutral-950 p-5">
              {/* The whole photo, uncropped: the frame has its shape (1050 x 1600). */}
              <img
                src={`${import.meta.env.BASE_URL}author.jpg`}
                alt="Shevesh Pandey holding a School of Engineering KMITL bag"
                width={118}
                height={180}
                className="h-[180px] w-[118px] shrink-0 rounded-xl object-contain ring-2 ring-emerald-400/50"
              />
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">
                  Made by
                </p>
                <p className="bg-gradient-to-r from-emerald-300 via-sky-300 to-violet-300 bg-clip-text text-3xl font-semibold tracking-tight text-transparent">
                  Shevesh Pandey
                </p>
              </div>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
