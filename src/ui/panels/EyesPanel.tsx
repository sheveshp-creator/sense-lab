import { useState } from 'react';
import { faceAnalysis, live } from '../../core/pipeline';
import { useFaceSnapshot } from '../hooks/useFaceSnapshot';
import { GazeCalibrationOverlay, GazePointer } from '../components/GazeCalibrationOverlay';
import type { GazeLabel } from '../../features/face/eyes/gaze';

const LABEL_TEXT: Record<GazeLabel, string> = {
  centre: 'Looking at the centre',
  left: 'Looking left',
  right: 'Looking right',
  up: 'Looking up',
  down: 'Looking down',
};

/** Blink counter, eye state, gaze arrow and the optional 9-point calibration. */
export function EyesPanel() {
  const snap = useFaceSnapshot();
  const [calibrating, setCalibrating] = useState(false);
  const [showPointer, setShowPointer] = useState(false);
  const result = faceAnalysis.calibration.result;

  // Arrow: 2 px per degree, kept inside the circle. Gaze x is + toward the user's right (screen right).
  const R = 40;
  const g = snap?.gaze;
  const len = g ? Math.min(R - 4, Math.hypot(g.x, g.y) * 2) : 0;
  const ang = g ? Math.atan2(g.y, g.x) : 0;

  return (
    <section aria-label="Eyes" className="w-80 space-y-3 panel">
      <h2 className="label">Eyes</h2>
      {!snap ? (
        <p className="text-sm text-neutral-500">No face in view.</p>
      ) : (
        <>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-3xl font-semibold tabular-nums" data-testid="blink-count">
                {snap.blinks}
              </p>
              <p className="text-xs text-neutral-400">blinks</p>
            </div>
            <div className="text-right">
              <p className="text-xl tabular-nums" data-testid="blink-rate">
                {snap.blinksPerMinute > 0 ? snap.blinksPerMinute.toFixed(0) : '-'}
              </p>
              <p className="text-xs text-neutral-400">per minute (after 10 s)</p>
            </div>
            <button
              className="rounded bg-neutral-800 px-2 py-1 text-xs hover:bg-neutral-700"
              onClick={() => live.analysis?.primary?.blink.reset()}
            >
              Reset
            </button>
          </div>
          <p className="text-xs text-neutral-400" data-testid="eye-state">
            Eyes {snap.heldShut ? 'held shut' : snap.eyesClosed ? 'closed' : 'open'} · signal from{' '}
            {snap.signal === 'blendshape' ? 'blink scores' : 'landmarks (fallback)'}
          </p>

          <div className="flex items-center gap-3">
            <svg
              width={96}
              height={96}
              viewBox="-48 -48 96 96"
              role="img"
              aria-label={`Gaze direction: ${LABEL_TEXT[snap.gaze.label]}`}
            >
              <circle r={R} fill="none" stroke="#2e2e2c" strokeWidth={1} />
              <line x1={-R} x2={R} y1={0} y2={0} stroke="#2e2e2c" strokeWidth={1} />
              <line y1={-R} y2={R} x1={0} x2={0} stroke="#2e2e2c" strokeWidth={1} />
              {snap.gaze.valid && (
                <>
                  <line
                    x1={0}
                    y1={0}
                    x2={Math.cos(ang) * len}
                    y2={Math.sin(ang) * len}
                    stroke={snap.eyesClosed ? '#6b7280' : '#facc15'}
                    strokeWidth={3}
                    strokeLinecap="round"
                  />
                  <circle
                    cx={Math.cos(ang) * len}
                    cy={Math.sin(ang) * len}
                    r={4}
                    fill={snap.eyesClosed ? '#6b7280' : '#facc15'}
                    stroke="#171717"
                    strokeWidth={2}
                  />
                </>
              )}
            </svg>
            <div className="text-sm">
              <p className="font-medium" data-testid="gaze-label">
                {snap.gaze.valid ? LABEL_TEXT[snap.gaze.label] : 'waiting for eyes'}
              </p>
              <p className="font-mono text-xs text-neutral-400" data-testid="gaze-values">
                x {snap.gaze.x.toFixed(0)}° · y {snap.gaze.y.toFixed(0)}°
              </p>
              <p className="text-xs text-neutral-500">
                +x right, +y down, relative to the camera. Eyes plus head turn.
              </p>
            </div>
          </div>
        </>
      )}

      <div className="space-y-2 border-t border-neutral-800 pt-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button
            className="btn !px-2 !py-1 disabled:opacity-40"
            disabled={!snap}
            onClick={() => setCalibrating(true)}
          >
            Calibrate gaze (9 dots)
          </button>
          {result?.ok && (
            <label className="flex items-center gap-1.5 text-xs text-neutral-300">
              <input
                type="checkbox"
                checked={showPointer}
                onChange={(e) => setShowPointer(e.target.checked)}
              />
              Show gaze point
            </label>
          )}
        </div>
        {result && (
          <p className="text-xs text-neutral-400" data-testid="calibration-result">
            {result.ok
              ? `Calibrated. Error about ${(result.leaveOneOutError * 100).toFixed(0)}% of the screen on dots it had not seen.`
              : `Calibration failed: ${result.reason}.`}
          </p>
        )}
        <p className="text-xs text-neutral-500">
          Optional. Follow nine dots with your eyes and a simple map from gaze to screen position is
          fitted.
        </p>
      </div>
      {calibrating && <GazeCalibrationOverlay onClose={() => setCalibrating(false)} />}
      {showPointer && result?.ok && <GazePointer />}
    </section>
  );
}
