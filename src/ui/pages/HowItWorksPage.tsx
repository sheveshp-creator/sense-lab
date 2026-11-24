import type { ReactNode } from 'react';
import { ArchitectureDiagram } from '../components/ArchitectureDiagram';
import { LiveTimings } from '../components/LiveTimings';

const Section = ({ id, title, children }: { id: string; title: string; children: ReactNode }) => (
  <section aria-labelledby={id} className="space-y-3">
    <h2 id={id} className="font-serif text-2xl tracking-tight">
      {title}
    </h2>
    {children}
  </section>
);

const Card = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="border-t border-line pt-3">
    <h3 className="text-sm font-medium text-neutral-100">{title}</h3>
    <div className="mt-1 text-sm leading-relaxed text-neutral-400">{children}</div>
  </div>
);

/** Architecture, the frame pipeline with live timings, privacy and limitations. Works with or without the camera. */
export default function HowItWorksPage({ onBack }: { onBack?: () => void }) {
  return (
    <article className="mx-auto max-w-4xl space-y-10 pb-24" data-testid="how-it-works">
      <header className="space-y-3">
        {onBack && (
          <button
            className="text-sm text-neutral-400 underline hover:text-neutral-200"
            onClick={onBack}
          >
            Back
          </button>
        )}
        <h1 className="font-serif text-4xl tracking-tight">How it works</h1>
        <p className="max-w-2xl text-neutral-300">
          SenseLab finds faces and hands in your camera feed and reads what they are doing, all on
          your device. There is no server and no upload: the models are static files, and the page
          runs them itself.
        </p>
      </header>

      <Section id="architecture" title="Architecture">
        <ArchitectureDiagram />
        <p className="text-sm text-neutral-400">
          The models run in a Web Worker so the page never waits for inference. Only numbers cross
          back (landmarks and scores in typed arrays, never images). The page tracks, smooths and
          interprets them, then publishes the result two ways: discrete things that happen (a swipe,
          a blink) go on a typed event bus, and the live state (where the hands are, what the faces
          show) goes into a store. The demos only read those two.
        </p>
      </Section>

      <Section id="pipeline" title="The frame pipeline">
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-neutral-300">
          <li>
            <strong>A new camera frame arrives</strong> (<code>requestVideoFrameCallback</code>, so
            a frame is never processed twice; <code>requestAnimationFrame</code> where that is
            missing). Nothing runs while the tab is hidden.
          </li>
          <li>
            <strong>The scheduler picks the models for this frame:</strong> face and hands every
            frame, the gesture recogniser every 8th frame and only with a hand in view, face
            recognition only for new faces and about every 500 ms per face, never every frame.
          </li>
          <li>
            <strong>The frame is turned into an ImageBitmap and transferred</strong> to the worker.
            One frame is in flight at a time: if the worker is busy the new frame is dropped, so
            latency cannot pile up.
          </li>
          <li>
            <strong>The worker runs the models</strong> and sends back flat arrays of numbers.
          </li>
          <li>
            <strong>Trackers match faces and hands to the previous frame</strong> (overlap and
            distance), keep stable IDs for half a second after something disappears, and smooth
            every landmark with a One-Euro filter (steady when still, quick when moving).
          </li>
          <li>
            <strong>Recognisers read the smoothed landmarks:</strong> finger states and gestures,
            expression, blinks, gaze, and who a face is.
          </li>
          <li>
            <strong>The result is published</strong> to the event bus and the store, and the canvas
            overlay is drawn straight from it, without re-rendering the page per frame.
          </li>
        </ol>
        <h3 className="pt-2 text-sm font-semibold text-neutral-200">Where the time goes (live)</h3>
        <LiveTimings />
      </Section>

      <Section id="fast" title="Staying fast, loading light">
        <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
          <Card title="Automatic quality">
            If a processed frame takes longer than the time it is allowed (33 ms at full rate), the
            app steps down one level: first it drops the gesture cross-check and the heaviest
            overlays, then it runs the models on every other frame and pauses face recognition. It
            tries one level up again after a few calm seconds, and waits twice as long each time
            that attempt fails. The current level is in the Stats panel, where you can also pin it.
          </Card>
          <Card title="Models load when needed">
            Each model is fetched the first time its feature is used: face tracking first, then
            hands, the gesture cross-check when a hand first appears, and face recognition when a
            face first appears. A model that fails to load shows a plain message and a Retry button,
            and the others keep working.
          </Card>
          <Card title="Cached after the first visit">
            A service worker keeps the app and the models in your browser, so later visits start
            without downloading them and keep working offline. It only ever stores this site's own
            files.
          </Card>
          <Card title="Where it runs">
            In a Web Worker. If a browser cannot do that, the models run on the page itself and the
            Welcome page says so; so does the Stats panel ("Runs in").
          </Card>
        </div>
      </Section>

      <Section id="privacy" title="Privacy">
        <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
          <Card title="Consent first">
            The camera starts only after you tick the box on the welcome page. Stopping it releases
            the camera.
          </Card>
          <Card title="Nothing is uploaded">
            There is no backend. After the models have loaded, the page makes no network requests
            except for its own static files, and this is checked by an automated test.
          </Card>
          <Card title="Only names and numbers are saved">
            Face recognition stores a name and a short list of numbers (an embedding) per person, in
            your browser's IndexedDB. Never photos, never video frames.
          </Card>
          <Card title="You stay in control">
            Delete one person or everything with one click, or export and import your people as a
            JSON file. An embedding is still biometric data in many places, so treat exported files
            with care.
          </Card>
        </div>
      </Section>

      <Section id="limits" title="Known limitations">
        <ul className="space-y-2 text-sm text-neutral-300">
          <li>
            <strong>Lighting and camera.</strong> Dim light, strong backlight, motion blur and very
            low-resolution cameras hurt every model. Registration rejects frames that are too dark
            or blurry, but recognition quality still depends on a decent picture.
          </li>
          <li>
            <strong>No liveness check.</strong> Face recognition cannot tell a real face from a
            photo or a screen: holding up a picture of a registered person will be recognised as
            them (the project's own tests do exactly that, with photos). It is a demo, not an access
            control.
          </li>
          <li>
            <strong>Uneven accuracy across people.</strong> Face recognition and expression reading
            are not equally accurate for everyone. Age, skin tone, glasses, head coverings, facial
            hair, and how a person's face tends to move all matter, and the tests here used a small
            set of public photos that is not demographically balanced. Do not assume the measured
            numbers hold for you, and do not use this to judge people.
          </li>
          <li>
            <strong>Expressions are not emotions.</strong> The app reads facial movement. On
            ordinary photos its five-way label is right about half the time; happy and surprised are
            reliable, sad and angry are weak. On exaggerated, on-purpose expressions it does much
            better.
          </li>
          <li>
            <strong>Gaze is rough.</strong> Sideways direction is decent; up and down is the least
            reliable part; the angle in degrees is approximate. The optional calibration gives a
            coarse screen position, not an eye tracker.
          </li>
          <li>
            <strong>Hands.</strong> Pose thresholds were calibrated on a handful of photos. The
            heart and frame two-hand gestures have only been tested on synthetic hands, and hands
            that overlap are often reported as one.
          </li>
          <li>
            <strong>Speed on other devices is unmeasured.</strong> The speed targets have not been
            measured on mid-range laptops or phones, and nothing has been tried on a real iPhone.
            The numbers above are from the device you are using now.
          </li>
        </ul>
      </Section>
    </article>
  );
}
