import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { frameStore, simulate } from './core/frameStore';
import { bus } from './events/bus';
import { liveStore } from './core/liveStore';
import { registerServiceWorker } from './registerSW';

// Development only: lets the end-to-end tests drive the demos' own logic with simulated input.
if (import.meta.env.DEV)
  (window as unknown as Record<string, unknown>).__senselab = {
    bus,
    frameStore,
    liveStore,
    simulate,
  };

registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
