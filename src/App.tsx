import { Suspense, lazy, useState } from 'react';
import { WelcomePage } from './ui/pages/WelcomePage';
import { prefetchFaceStack } from './core/prefetch';

// Only the Welcome page is needed to paint. The studio (camera, pipeline, panels) is its own chunk, fetched
// while the user reads the consent text (see onWarm) so Start camera does not wait for it.
const loadStudio = () => import('./ui/pages/StudioPage');
const StudioPage = lazy(() => loadStudio().then((m) => ({ default: m.StudioPage })));
const HowItWorksPage = lazy(() => import('./ui/pages/HowItWorksPage'));

type View = 'welcome' | 'how' | 'studio';

/** Consent gates the camera. "How it works" can be read before consenting: it needs no camera. */
export default function App() {
  const [view, setView] = useState<View>('welcome');
  if (view === 'studio')
    return (
      <Suspense fallback={<p className="py-10 text-center text-sm text-neutral-500">Loading...</p>}>
        <StudioPage onLeave={() => setView('welcome')} />
      </Suspense>
    );
  if (view === 'how') {
    return (
      <main className="animate-fade-in mx-auto max-w-5xl p-6">
        <Suspense
          fallback={<p className="py-10 text-center text-sm text-neutral-500">Loading...</p>}
        >
          <HowItWorksPage onBack={() => setView('welcome')} />
        </Suspense>
      </main>
    );
  }
  return (
    <WelcomePage
      onConsent={() => setView('studio')}
      onHow={() => setView('how')}
      onWarm={() => {
        void loadStudio();
        prefetchFaceStack();
      }}
    />
  );
}
