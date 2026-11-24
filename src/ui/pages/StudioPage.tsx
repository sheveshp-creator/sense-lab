import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { CameraView } from '../../core/camera/CameraView';
import { useCamera } from '../../core/camera/useCamera';
import { startPipeline } from '../../core/pipeline';
import { LayerPanel } from '../panels/LayerPanel';
import { StatsPanel } from '../panels/StatsPanel';
import { FingerPanel } from '../panels/FingerPanel';
import { FalseTriggerPanel } from '../panels/FalseTriggerPanel';
import { TwoHandPanel } from '../panels/TwoHandPanel';
import { PeoplePanel } from '../panels/PeoplePanel';
import { RegisterPanel } from '../panels/RegisterPanel';
import { RecognitionPanel } from '../panels/RecognitionPanel';
import { ExpressionPanel } from '../panels/ExpressionPanel';
import { EyesPanel } from '../panels/EyesPanel';
import { EyeChartsPanel } from '../panels/EyeChartsPanel';
import { GestureTimeline } from '../panels/GestureTimeline';
import { RecordButton } from '../panels/RecordButton';
import { ModelBanner } from '../panels/ModelBanner';

// Loaded on first visit, so the studio itself starts fast (the demos carry Three.js and Framer Motion).
const PlaygroundPage = lazy(() => import('./PlaygroundPage'));
const HowItWorksPage = lazy(() => import('./HowItWorksPage'));

const TABS = [
  ['studio', 'Live Studio'],
  ['face', 'Face Lab'],
  ['hand', 'Hand Lab'],
  ['playground', 'Playground'],
  ['how', 'How it works'],
] as const;
type Tab = (typeof TABS)[number][0];

const Loading = () => <p className="py-10 text-center text-sm text-neutral-500">Loading...</p>;

export function StudioPage({ onLeave }: { onLeave: () => void }) {
  const camera = useCamera();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { start, stop, stream } = camera;
  const [tab, setTab] = useState<Tab>('studio');
  const [modelError, setModelError] = useState<string | null>(null);
  // Bumped by the Retry button to start the pipeline again.
  const [attempt, setAttempt] = useState(0);

  // Consent was given on the Welcome page, so starting here is safe.
  useEffect(() => {
    void start();
  }, [start]);

  // Run the pipeline only while a stream is attached.
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!stream || !video || !canvas) return;
    let cancelled = false;
    let stopPipeline: (() => void) | undefined;
    void startPipeline(video, canvas)
      .then((p) => {
        if (cancelled) p.stop();
        else stopPipeline = p.stop;
      })
      .catch((err: unknown) => {
        if (!cancelled) setModelError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
      stopPipeline?.();
    };
  }, [stream, attempt]);

  // The camera must keep running on every page (it feeds the models), so it is never unmounted: it just
  // changes size and place. On "How it works" it becomes a small floating preview.
  const videoClass =
    tab === 'how'
      ? 'fixed bottom-4 left-4 z-30 w-44 overflow-hidden rounded-sm border border-line'
      : tab === 'playground'
        ? 'w-full shrink-0 md:w-[400px]'
        : 'min-w-[320px] flex-1';

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-line bg-bg">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-end gap-x-8 px-6">
          <span className="pb-3 pt-3 font-serif text-xl tracking-tight">SenseLab</span>
          <nav className="flex flex-wrap gap-x-6" aria-label="Pages">
            {TABS.map(([id, label]) => (
              <button
                key={id}
                aria-current={tab === id ? 'page' : undefined}
                className={`-mb-px border-b-2 pb-3 pt-3 text-sm transition-colors ${tab === id ? 'border-accent text-ink' : 'border-transparent text-mute hover:text-ink'}`}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>
          <button
            className="btn mb-2 ml-auto"
            onClick={() => {
              stop();
              onLeave();
            }}
          >
            Stop camera
          </button>
        </div>
      </header>
      <main className="mx-auto flex max-w-[1400px] flex-wrap gap-6 p-6">
        <div className={videoClass}>
          {modelError && (
            <div
              role="alert"
              className="mb-3 border border-bad/50 bg-bad/10 p-3 text-sm text-neutral-100"
            >
              <p className="font-medium">Could not start tracking.</p>
              <p className="mt-1 text-red-300">
                The tracking engine did not start. Reload the page, or try again.
              </p>
              <p className="mt-1 break-words font-mono text-xs text-red-400/80">{modelError}</p>
              <button
                className="btn mt-2"
                onClick={() => {
                  setModelError(null);
                  setAttempt((a) => a + 1);
                }}
              >
                Try again
              </button>
            </div>
          )}
          <ModelBanner />
          <CameraView
            stream={stream}
            status={camera.status}
            errorKind={camera.errorKind}
            devices={camera.devices}
            deviceId={camera.deviceId}
            onSelectDevice={(id) => void start(id)}
            onRetry={() => void start(camera.deviceId)}
            videoRef={videoRef}
            canvasRef={canvasRef}
          />
        </div>
        <div
          key={tab}
          className={`animate-fade-in ${tab === 'how' || tab === 'playground' ? 'min-w-0 flex-1' : 'space-y-3'}`}
        >
          {tab === 'studio' ? (
            <div className="space-y-3">
              <LayerPanel />
              <StatsPanel />
              <FalseTriggerPanel />
            </div>
          ) : tab === 'face' ? (
            <div className="flex flex-wrap gap-3">
              <div className="space-y-3">
                <ExpressionPanel />
                <EyesPanel />
                <EyeChartsPanel />
              </div>
              <div className="space-y-3">
                <RegisterPanel />
                <RecognitionPanel />
                <PeoplePanel />
              </div>
            </div>
          ) : tab === 'hand' ? (
            <div className="space-y-3">
              <FingerPanel />
              <TwoHandPanel />
              <GestureTimeline />
              <RecordButton />
            </div>
          ) : tab === 'playground' ? (
            <Suspense fallback={<Loading />}>
              <PlaygroundPage />
            </Suspense>
          ) : (
            <Suspense fallback={<Loading />}>
              <HowItWorksPage />
            </Suspense>
          )}
        </div>
      </main>
    </div>
  );
}
