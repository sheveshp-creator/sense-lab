import { useEffect, useRef, useState } from 'react';
import { faceAnalysis, live } from '../../core/pipeline';
import { CALIBRATION_GRID } from '../../features/face/eyes/calibration';

/** Time per dot: first the eyes get time to land on it, then gaze samples are collected. */
const SETTLE_MS = 600;
const COLLECT_MS = 1000;
const SAMPLE_EVERY_MS = 50;

/**
 * Full-screen 9-dot calibration. Shows each dot in turn, records the primary face's gaze while the user looks
 * at it (skipping blinks), then fits the gaze-to-screen map. Esc cancels.
 */
export function GazeCalibrationOverlay({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const cal = faceAnalysis.calibration;

  useEffect(() => {
    cal.clear();
  }, [cal]);

  useEffect(() => {
    if (done) return;
    let sampler: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => {
      sampler = setInterval(() => {
        const s = live.analysis?.primary;
        if (s?.gaze.valid && !s.blink.closed) cal.add(step, s.gaze.x, s.gaze.y);
      }, SAMPLE_EVERY_MS);
    }, SETTLE_MS);
    const next = setTimeout(() => {
      if (sampler) clearInterval(sampler);
      if (step + 1 < CALIBRATION_GRID.length) setStep(step + 1);
      else {
        cal.calibrate();
        setDone(true);
      }
    }, SETTLE_MS + COLLECT_MS);
    return () => {
      clearTimeout(start);
      clearTimeout(next);
      if (sampler) clearInterval(sampler);
    };
  }, [step, done, cal]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const [x, y] = CALIBRATION_GRID[Math.min(step, CALIBRATION_GRID.length - 1)]!;
  const r = cal.result;
  return (
    <div
      role="dialog"
      aria-label="Gaze calibration"
      className="fixed inset-0 z-50 bg-black/90"
      data-testid="calibration-overlay"
    >
      {!done ? (
        <>
          <p className="absolute left-1/2 top-4 -translate-x-1/2 text-sm text-neutral-300">
            Keep your head still and follow the dot with your eyes. Dot {step + 1} of{' '}
            {CALIBRATION_GRID.length}. Esc to cancel.
          </p>
          <div
            className="absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-yellow-400 ring-4 ring-yellow-400/30"
            style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
            data-testid="calibration-dot"
          />
        </>
      ) : (
        <div className="absolute left-1/2 top-1/2 w-80 -translate-x-1/2 -translate-y-1/2 space-y-3 rounded-lg bg-neutral-900 p-5 text-center">
          <p className="font-semibold">{r?.ok ? 'Calibrated' : 'Calibration failed'}</p>
          <p className="text-sm text-neutral-300" data-testid="calibration-summary">
            {r?.ok
              ? `Average error ${(r.rmsError * 100).toFixed(0)}% of the screen on the dots, ${(r.leaveOneOutError * 100).toFixed(0)}% on dots left out of the fit (the honest number).`
              : `${r?.reason ?? 'No result'}. Make sure your face stays in view, and look at each dot.`}
          </p>
          <button
            className="rounded bg-emerald-500 px-3 py-1.5 text-sm font-medium text-black"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}

/** A dot on the page showing where the calibrated gaze points. Updated outside React, once per animation frame. */
export function GazePointer() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    let sx = 0.5;
    let sy = 0.5;
    const out = { x: 0, y: 0 };
    const tick = () => {
      const g = live.analysis?.primary?.gaze;
      const p = g?.valid ? faceAnalysis.calibration.predict(g.x, g.y, out) : null;
      const el = ref.current;
      if (el) {
        if (p) {
          sx += 0.25 * (p.x - sx);
          sy += 0.25 * (p.y - sy);
          el.style.left = `${sx * 100}%`;
          el.style.top = `${sy * 100}%`;
        }
        el.style.opacity = p ? '1' : '0';
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed z-40 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-yellow-400/80 ring-2 ring-black"
      style={{ left: '50%', top: '50%', opacity: 0 }}
      data-testid="gaze-pointer"
    />
  );
}
