import type { FaceTrack } from '../core/tracking/faceTracker';
import type { LayerToggles } from '../core/liveStore';
import {
  JAWLINE,
  LEFT_BROW_LINES,
  LEFT_EYE_RING,
  LEFT_IRIS_CENTER,
  LEFT_IRIS_RING,
  LIPS_INNER_RING,
  LIPS_OUTER_RING,
  NOSE_LINES,
  RIGHT_BROW_LINES,
  RIGHT_EYE_RING,
  RIGHT_IRIS_CENTER,
  RIGHT_IRIS_RING,
} from '../features/face/landmarks';
import { LANDMARK_COUNT } from '../features/face/faceFormat';
import type { FaceLabel } from '../features/face/identityService';
import type { FaceState } from '../features/face/faceAnalysis';

const COLORS = ['#34d399', '#60a5fa', '#f472b6', '#fbbf24', '#a78bfa', '#f87171'];
export const colorForId = (id: number): string => COLORS[id % COLORS.length]!;

function path(
  ctx: CanvasRenderingContext2D,
  lm: Float32Array,
  idx: readonly number[],
  w: number,
  h: number,
  close: boolean,
) {
  ctx.moveTo(lm[idx[0]! * 3]! * w, lm[idx[0]! * 3 + 1]! * h);
  for (let i = 1; i < idx.length; i++) ctx.lineTo(lm[idx[i]! * 3]! * w, lm[idx[i]! * 3 + 1]! * h);
  if (close) ctx.closePath();
}

/**
 * Draws all visible faces straight onto the canvas, one independent block per layer.
 * The caller clears the canvas first (the heatmap and hands share it).
 * Called from the frame loop, never from React.
 */
export function drawFaces(
  ctx: CanvasRenderingContext2D,
  tracks: readonly FaceTrack[],
  layers: LayerToggles,
  w: number,
  h: number,
  /** Recognition result for a tracked face, if face recognition is active. */
  labelFor?: (trackId: number) => FaceLabel | null,
  /** Expression / blink / gaze analysis for a tracked face. */
  stateFor?: (trackId: number) => FaceState | null,
): void {
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  for (const t of tracks) {
    if (!t.visible) continue;
    const color = colorForId(t.id);
    const lm = t.landmarks;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;

    if (layers.mesh) {
      // Dots instead of the tessellation: one cheap fillRect per point, no mesh table to ship.
      ctx.globalAlpha = 0.6;
      for (let i = 0; i < LANDMARK_COUNT; i++)
        ctx.fillRect(lm[i * 3]! * w - 1, lm[i * 3 + 1]! * h - 1, 2, 2);
      ctx.globalAlpha = 1;
    }
    if (layers.jaw) {
      ctx.beginPath();
      path(ctx, lm, JAWLINE, w, h, false);
      ctx.stroke();
    }
    if (layers.brows) {
      ctx.beginPath();
      for (const l of LEFT_BROW_LINES) path(ctx, lm, l, w, h, false);
      for (const l of RIGHT_BROW_LINES) path(ctx, lm, l, w, h, false);
      ctx.stroke();
    }
    if (layers.nose) {
      ctx.beginPath();
      for (const l of NOSE_LINES) path(ctx, lm, l, w, h, false);
      ctx.stroke();
    }
    if (layers.lips) {
      ctx.beginPath();
      path(ctx, lm, LIPS_OUTER_RING, w, h, true);
      path(ctx, lm, LIPS_INNER_RING, w, h, true);
      ctx.stroke();
    }
    if (layers.eyes) {
      ctx.beginPath();
      path(ctx, lm, LEFT_EYE_RING, w, h, true);
      path(ctx, lm, RIGHT_EYE_RING, w, h, true);
      path(ctx, lm, LEFT_IRIS_RING, w, h, true);
      path(ctx, lm, RIGHT_IRIS_RING, w, h, true);
      ctx.stroke();
      for (const c of [LEFT_IRIS_CENTER, RIGHT_IRIS_CENTER]) {
        ctx.fillRect(lm[c * 3]! * w - 1.5, lm[c * 3 + 1]! * h - 1.5, 3, 3);
      }
    }
    if (layers.box) {
      ctx.strokeRect(t.box.x * w, t.box.y * h, t.box.w * w, t.box.h * h);
    }
    if (layers.label) {
      // Name and confidence when recognition is on, otherwise just the track ID.
      const who = labelFor?.(t.id) ?? null;
      let text = `ID ${t.id}`;
      let textColor = color;
      if (who) {
        if (who.state === 'known') {
          text = `${who.name} ${who.confidence.toFixed(2)}`;
          textColor = '#4ade80';
        } else if (who.state === 'unknown') {
          text = `Unknown ${who.confidence.toFixed(2)}`;
          textColor = '#fbbf24';
        } else {
          text = `ID ${t.id} ...`;
          textColor = '#d4d4d4';
        }
      }
      // The canvas is CSS-mirrored with the video, so un-mirror the text locally to keep it readable.
      const x = (t.box.x + t.box.w) * w;
      const y = t.box.y * h - 6;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(-1, 1);
      ctx.font = '15px ui-monospace, monospace';
      // Dark outline keeps the label readable over any background.
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText(text, 0, 0);
      ctx.fillStyle = textColor;
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }

    const st = stateFor?.(t.id) ?? null;
    if (st && layers.expression) {
      // Expression under the box, un-mirrored like the other text.
      ctx.save();
      // Under the box; inside its bottom edge when the face fills the frame and there is no room below.
      const below = (t.box.y + t.box.h) * h + 16;
      ctx.translate(
        (t.box.x + t.box.w) * w - (below > h - 4 ? 6 : 0),
        below > h - 4 ? (t.box.y + t.box.h) * h - 8 : below,
      );
      ctx.scale(-1, 1);
      ctx.font = '15px ui-monospace, monospace';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText(st.expression.label, 0, 0);
      ctx.fillStyle = '#e5e5e5';
      ctx.fillText(st.expression.label, 0, 0);
      ctx.restore();
    }
    if (st && layers.gaze && st.gaze.valid) {
      // An arrow from between the eyes along the gaze. Gaze x is in the mirrored (display) convention,
      // the canvas is raw, so x flips. 5 px per degree, capped so it stays on the face.
      const ex = (lm[LEFT_IRIS_CENTER * 3]! + lm[RIGHT_IRIS_CENTER * 3]!) / 2;
      const ey = (lm[LEFT_IRIS_CENTER * 3 + 1]! + lm[RIGHT_IRIS_CENTER * 3 + 1]!) / 2;
      const x0 = ex * w;
      const y0 = ey * h;
      const len = Math.min(70, Math.hypot(st.gaze.x, st.gaze.y) * 5);
      const ang = Math.atan2(st.gaze.y, -st.gaze.x);
      ctx.strokeStyle = st.blink.closed ? '#6b7280' : '#facc15';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len);
      ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      ctx.arc(x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2;
    }
  }
}
