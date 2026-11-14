import type { HandPipeline, HandView } from '../features/hand/handPipeline';
import type { LayerToggles } from '../core/liveStore';
import { FINGER_TIPS, HAND_CHAINS, PALM_LOOP } from '../features/hand/landmarks';
import { builtinName } from '../features/hand/builtinLabels';

const HAND_COLORS = { Left: '#22d3ee', Right: '#fb923c' } as const;
const STATE_COLORS = ['#34d399', '#fbbf24', '#f87171']; // open, half, closed
const STATE_LETTERS = ['O', 'H', 'C'];

/**
 * Draws tracked hands on top of whatever is already on the canvas (faces clear it first).
 * The canvas is CSS-mirrored with the video, so all text is flipped back locally to stay readable.
 */
export function drawHands(
  ctx: CanvasRenderingContext2D,
  views: readonly HandView[],
  layers: LayerToggles,
  w: number,
  h: number,
): void {
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.font = '13px ui-monospace, monospace';
  for (const v of views) {
    const lm = v.track.landmarks;
    const color = HAND_COLORS[v.track.handedness];

    if (layers.handSkeleton) {
      ctx.strokeStyle = color;
      ctx.beginPath();
      for (const chain of HAND_CHAINS) {
        ctx.moveTo(lm[chain[0]! * 3]! * w, lm[chain[0]! * 3 + 1]! * h);
        for (let i = 1; i < chain.length; i++)
          ctx.lineTo(lm[chain[i]! * 3]! * w, lm[chain[i]! * 3 + 1]! * h);
      }
      ctx.moveTo(lm[PALM_LOOP[1]! * 3]! * w, lm[PALM_LOOP[1]! * 3 + 1]! * h);
      for (let i = 2; i < PALM_LOOP.length; i++)
        ctx.lineTo(lm[PALM_LOOP[i]! * 3]! * w, lm[PALM_LOOP[i]! * 3 + 1]! * h);
      ctx.stroke();
      ctx.fillStyle = color;
      for (let i = 0; i < 21; i++) {
        ctx.beginPath();
        ctx.arc(lm[i * 3]! * w, lm[i * 3 + 1]! * h, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (layers.fingerLabels) {
      for (let f = 0; f < 5; f++) {
        const tip = FINGER_TIPS[f]!;
        const s = v.frame.state[f]!;
        label(
          ctx,
          STATE_LETTERS[s]!,
          lm[tip * 3]! * w,
          lm[tip * 3 + 1]! * h - 12,
          STATE_COLORS[s]!,
          'center',
        );
      }
    }

    if (layers.gestureTag) {
      const b = v.track.box;
      const x = (b.x + b.w) * w;
      const y = b.y * h - 8;
      if (v.gesture) {
        const mark = v.cross === 'agree' ? ' ✓' : v.cross === 'disagree' ? ' ?' : '';
        label(ctx, `${v.gesture}${mark}`, x, y - 16, '#ffffff', 'left');
      }
      const mp = builtinName(v.track.builtinLabel);
      const meta = `#${v.track.id} ${v.track.handedness}${mp !== 'None' ? ` · MP ${mp}` : ''}`;
      label(ctx, meta, x, y, color, 'left');
    }
  }
}

function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  align: 'left' | 'center',
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(-1, 1);
  ctx.textAlign = align === 'left' ? 'left' : 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = color;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

// Motion data is in display space (mirrored, unit = frame height). The canvas is in raw image
// space and then mirrored by CSS, so a display point (x, y) lands at canvas (w - x*h, y*h).
const cx = (x: number, w: number, h: number) => w - x * h;
const cy = (y: number, h: number) => y * h;

const TOAST_MS = 900;
const ARROWS: Record<string, string> = {
  swipeLeft: '←',
  swipeRight: '→',
  swipeUp: '↑',
  swipeDown: '↓',
};

/**
 * Hand position and gesture feedback: palm trail, point ray, pinch cursor, two-hand overlay
 * (zoom / rotate / frame) and a short-lived label for one-shot gestures.
 */
export function drawHandMotion(
  ctx: CanvasRenderingContext2D,
  hands: HandPipeline,
  layers: LayerToggles,
  w: number,
  h: number,
  nowMs: number,
): void {
  ctx.lineWidth = 2;
  for (const v of hands.views) {
    const m = v.frame.motion;
    const color = HAND_COLORS[v.track.handedness];

    if (layers.palmTrail && m.length > 1) {
      // Newest 1 s of palm positions, fading with age.
      const n = m.countWithin(1000);
      ctx.strokeStyle = color;
      for (let i = 0; i < n - 1; i++) {
        ctx.globalAlpha = 1 - i / n;
        ctx.beginPath();
        ctx.moveTo(cx(m.px(i), w, h), cy(m.py(i), h));
        ctx.lineTo(cx(m.px(i + 1), w, h), cy(m.py(i + 1), h));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx(v.frame.metrics.palmX, w, h), cy(v.frame.metrics.palmY, h), 5, 0, Math.PI * 2);
      ctx.fill();
    }

    if (layers.gestureFx) {
      const f = v.frame.metrics;
      if (v.active.has('point')) {
        // Ray from the fingertip along the index finger, as long as 3 palm lengths.
        const len = f.palmLen * 3;
        const x0 = cx(f.tipX, w, h);
        const y0 = cy(f.tipY, h);
        const x1 = cx(f.tipX + f.indexDirX * len, w, h);
        const y1 = cy(f.tipY + f.indexDirY * len, h);
        ctx.strokeStyle = '#facc15';
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.arc(x1, y1, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      if (v.pinch) {
        ctx.strokeStyle = '#f472b6';
        ctx.fillStyle = v.pinch.dragging ? '#f472b6' : 'rgba(244,114,182,0.35)';
        ctx.beginPath();
        ctx.arc(cx(v.pinch.x, w, h), cy(v.pinch.y, h), 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        if (v.pinch.dragging) {
          ctx.beginPath();
          ctx.moveTo(cx(v.pinch.startX, w, h), cy(v.pinch.startY, h));
          ctx.lineTo(cx(v.pinch.x, w, h), cy(v.pinch.y, h));
          ctx.stroke();
        }
      }
    }
  }

  if (layers.gestureFx) {
    const th = hands.twoHand;
    if (th.pair && hands.views.length === 2) {
      const [a, b] = hands.views;
      const am = a!.frame.metrics;
      const bm = b!.frame.metrics;
      if (th.engaged) {
        ctx.strokeStyle = '#a78bfa';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx(am.palmX, w, h), cy(am.palmY, h));
        ctx.lineTo(cx(bm.palmX, w, h), cy(bm.palmY, h));
        ctx.stroke();
        const mx = cx((am.palmX + bm.palmX) / 2, w, h);
        const my = cy((am.palmY + bm.palmY) / 2, h);
        label(
          ctx,
          `zoom ${th.scale.toFixed(2)}x  rotate ${th.deg.toFixed(0)}°`,
          mx + 70,
          my - 10,
          '#c4b5fd',
          'left',
        );
      }
    }
    if (th.active.has('frame') && th.frameRect.valid) {
      const r = th.frameRect;
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 3;
      // Display-space rect to canvas rect: x flips, so the right edge becomes the canvas-left edge.
      ctx.strokeRect(cx(r.x + r.w, w, h), cy(r.y, h), r.w * h, r.h * h);
    }
    if (th.active.has('heart')) label(ctx, '♥', w / 2 + 12, h / 2, '#f43f5e', 'left');
  }

  const fire = hands.lastFire;
  if (layers.gestureTag && fire && nowMs - fire.t < TOAST_MS) {
    const arrow = ARROWS[fire.id] ?? '';
    ctx.font = '22px ui-monospace, monospace';
    label(ctx, `${arrow} ${fire.id}`.trim(), w - 12, 30, '#ffffff', 'left');
    ctx.font = '13px ui-monospace, monospace';
  }
}
