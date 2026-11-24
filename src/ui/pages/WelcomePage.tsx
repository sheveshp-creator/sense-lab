import { useState } from 'react';
import { blockers, chooseThread, degradations, detectCapabilities } from '../../core/capabilities';

const IN_THE_BOX: [string, string][] = [
  [
    'Faces',
    '478 landmarks, up to four faces tracked with stable IDs, five expressions, blinks, gaze, and recognition of people you register.',
  ],
  [
    'Hands',
    '21 landmarks per hand, finger states, 13 poses, swipes, pinch, wave, and two-hand zoom, rotate and clap.',
  ],
  [
    'Demos',
    'Air Draw, Slide Remote, 3D Object, Mirror Avatar, Blink Battle and Mood Meter. Each also works with buttons and keys.',
  ],
  [
    'Privacy',
    'No server and no upload. Only names and face embeddings you register are saved, in this browser, and one click deletes them.',
  ],
];

const BEFORE_START = [
  'Video is processed on this device and is never uploaded.',
  'Photos and video frames are not stored.',
  'A registered person is saved as a name and a list of numbers, here, and you can delete it any time.',
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
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl items-baseline justify-between px-6 py-4">
          <span className="font-serif text-xl tracking-tight">SenseLab</span>
          <button className="link text-sm" onClick={onHow}>
            How it works (no camera needed)
          </button>
        </div>
      </header>

      <main className="animate-fade-in mx-auto max-w-6xl px-6">
        <section className="grid gap-x-14 gap-y-10 py-12 lg:grid-cols-12 lg:py-16">
          <div className="lg:col-span-7">
            <h1 className="max-w-[18ch] font-serif text-5xl leading-[1.05] tracking-tight sm:text-6xl">
              Face and hand tracking that stays in your browser.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-neutral-300">
              SenseLab runs its models on your device. Point a webcam at it to see landmarks,
              expressions, blinks, gaze and hand gestures, register people for it to recognise, and
              try six small demos you control with gestures.
            </p>
          </div>
          <div className="lg:col-span-5 lg:pt-3">
            <section aria-label="Consent" className="border border-line bg-surface p-6">
              <h2 className="label">Before the camera starts</h2>
              <ol className="mt-3 space-y-2 text-sm leading-relaxed text-neutral-300">
                {BEFORE_START.map((t, i) => (
                  <li key={t} className="flex gap-3">
                    <span className="num w-4 shrink-0 text-faint">{i + 1}</span>
                    {t}
                  </li>
                ))}
              </ol>
              {blocked && (
                <div
                  role="alert"
                  className="mt-4 space-y-1 border border-bad/50 bg-bad/10 p-3 text-sm text-neutral-100"
                >
                  {env.stop.map((m) => (
                    <p key={m}>{m}</p>
                  ))}
                </div>
              )}
              {env.notes.length > 0 && (
                <ul
                  aria-label="About this browser"
                  className="mt-4 list-disc space-y-1 pl-5 text-sm text-mute"
                >
                  {env.notes.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              )}
              <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm text-neutral-100">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[#e9a53b]"
                  checked={agreed}
                  onChange={(e) => {
                    setAgreed(e.target.checked);
                    if (e.target.checked) onWarm?.();
                  }}
                />
                I understand and agree to let SenseLab use my camera on this device.
              </label>
              <div className="mt-5">
                <button
                  className="btn btn-primary !px-5 !py-2"
                  disabled={!agreed || blocked}
                  onClick={onConsent}
                >
                  Start camera
                </button>
              </div>
            </section>
          </div>
        </section>

        <section aria-label="What is in it" className="border-t border-line py-10">
          <dl className="divide-y divide-line">
            {IN_THE_BOX.map(([name, text]) => (
              <div key={name} className="grid gap-1 py-4 sm:grid-cols-[9rem_1fr] sm:gap-8">
                <dt className="label pt-0.5">{name}</dt>
                <dd className="max-w-2xl text-neutral-300">{text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <footer className="flex items-center gap-5 border-t border-line py-8">
          {/* The whole photo, uncropped: the frame has its shape (1050 x 1600). */}
          <img
            src={`${import.meta.env.BASE_URL}author.jpg`}
            alt="Shevesh Pandey holding a School of Engineering KMITL bag"
            width={72}
            height={110}
            className="h-[110px] w-[72px] shrink-0 border border-line object-contain"
          />
          <div>
            <p className="label">Made by</p>
            <p className="mt-1 font-serif text-2xl tracking-tight">Shevesh Pandey</p>
          </div>
        </footer>
      </main>
    </div>
  );
}
