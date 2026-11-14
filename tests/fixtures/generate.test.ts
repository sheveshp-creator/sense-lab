import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { makeHand, POSES, setLandmark } from '../helpers/makeHand';
import type { HandSpec } from '../helpers/makeHand';
import { ASPECT, FRAME_MS, handAt, move, rng, seq, still, toFixture } from '../helpers/scenes';
import type { Frame } from '../helpers/scenes';

/**
 * Regenerates the SYNTHETIC fixtures (tests/fixtures/synthetic_*.json) from the parametric hand in
 * tests/helpers/makeHand.ts. Skipped unless GEN_FIXTURES=1:  GEN_FIXTURES=1 npx vitest run tests/fixtures
 * Real recordings (hand_*.json, real_*.json) come from the dev record button instead.
 */
const GEN = !!process.env.GEN_FIXTURES;
const out = (name: string, note: string, frames: Frame[]) =>
  writeFileSync(
    `tests/fixtures/${name}.json`,
    JSON.stringify(toFixture(`SYNTHETIC: ${note}`, frames)),
  );

const OPEN = POSES.openPalm!;
const RELAXED: HandSpec = { curl: [0.45, 0.4, 0.45, 0.5], thumb: 'tucked' };
const CENTRE: [number, number] = [ASPECT / 2, 0.5];

/** Two hands, left and right on screen, as one Frame list. */
function pair(
  a: HandSpec,
  b: HandSpec,
  pos: (i: number) => [[number, number], [number, number]],
  n: number,
  t0 = 0,
): Frame[] {
  return Array.from({ length: n }, (_, i) => {
    const [pa, pb] = pos(i);
    return { t: t0 + i * FRAME_MS, hands: [handAt(a, pa[0], pa[1]), handAt(b, pb[0], pb[1])] };
  });
}

it.skipIf(!GEN)('generate synthetic fixtures', () => {
  // --- single hand, motion ---------------------------------------------------------------
  const wave: Frame[] = [];
  for (let i = 0; i < 60; i++) {
    const t = i * FRAME_MS;
    // 2.5 Hz side to side, +-0.1 frame heights (~1.1 palm lengths each way).
    wave.push({
      t,
      hands: [handAt(OPEN, CENTRE[0] + 0.1 * Math.sin((2 * Math.PI * 2.5 * t) / 1000), 0.45)],
    });
  }
  out('synthetic_wave', 'open palm waving at 2.5 Hz for 2 s', [
    ...still(OPEN, [CENTRE[0], 0.45], 6, 0),
    ...wave.map((f) => ({ ...f, t: f.t + 6 * FRAME_MS })),
  ]);

  const circle: Frame[] = [];
  for (let i = 0; i < 48; i++) {
    const a = (2 * Math.PI * i) / 40; // a bit more than one full turn in ~1.6 s
    // Display y grows down, so increasing angle runs clockwise on screen.
    circle.push({
      t: i * FRAME_MS,
      hands: [handAt(POSES.pointingUp!, CENTRE[0] + 0.15 * Math.cos(a), 0.5 + 0.15 * Math.sin(a))],
    });
  }
  out(
    'synthetic_circle_cw',
    'pointing hand drawing a clockwise circle, radius 0.15 frame heights',
    circle,
  );
  out(
    'synthetic_circle_ccw',
    'same circle, counter-clockwise',
    circle.map((f, i) => ({
      t: f.t,
      hands: [
        handAt(
          POSES.pointingUp!,
          CENTRE[0] + 0.15 * Math.cos(-(2 * Math.PI * i) / 40),
          0.5 + 0.15 * Math.sin(-(2 * Math.PI * i) / 40),
        ),
      ],
    })),
  );

  const pinch = POSES.ok!; // thumb on index tip
  const pinchSpec: HandSpec = { ...pinch, curl: [0.6, 1, 1, 1] };
  out(
    'synthetic_pinch_drag',
    'pinch for 0.3 s, drag right by 0.25 frame heights, release',
    seq(
      (t) => still(OPEN, [0.7, 0.5], 6, t),
      (t) => still(pinchSpec, [0.7, 0.5], 8, t),
      (t) => move(pinchSpec, [0.7, 0.5], [0.95, 0.5], 10, t),
      (t) => still(pinchSpec, [0.95, 0.5], 3, t),
      (t) => still(OPEN, [0.95, 0.5], 8, t),
    ),
  );

  // --- single hand, things that must NOT trigger ----------------------------------------
  const r = rng(7);
  out(
    'synthetic_talking_idle',
    'relaxed half-curled hand near the chin, drifting and jittering for 10 s',
    Array.from({ length: 300 }, (_, i) => ({
      t: i * FRAME_MS,
      hands: [
        handAt(
          RELAXED,
          CENTRE[0] + 0.03 * Math.sin(i / 40) + 0.004 * r(),
          0.6 + 0.03 * Math.cos(i / 55) + 0.004 * r(),
        ),
      ],
    })),
  );
  out(
    'synthetic_slow_sweep',
    'open hand drifting slowly 0.45 frame heights in 2 s (~1.2 palm lengths/s)',
    move(OPEN, [0.5, 0.5], [0.95, 0.5], 60, 0),
  );
  const typing: Frame[] = Array.from({ length: 300 }, (_, i) => {
    const half: HandSpec = { curl: [0.5, 0.45, 0.5, 0.55], thumb: 'tucked' };
    const dx = 0.01 * r();
    return {
      t: i * FRAME_MS,
      hands: [
        handAt(half, 0.55 + dx, 0.85 + 0.01 * r()),
        handAt({ ...half, mirror: true }, 1.05 + dx, 0.85 + 0.01 * r()),
      ],
    };
  });
  out('synthetic_typing', 'two half-curled hands low in the frame, jittering for 10 s', typing);

  // --- two hands -------------------------------------------------------------------------
  const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
  out(
    'synthetic_zoom_in',
    'two open palms: 0.3 s hold, then move apart from 0.4 to 0.9 frame heights',
    seq(
      (t) =>
        pair(
          OPEN,
          OPEN,
          () => [
            [CENTRE[0] - 0.2, 0.5],
            [CENTRE[0] + 0.2, 0.5],
          ],
          12,
          t,
        ),
      (t) =>
        pair(
          OPEN,
          OPEN,
          (i) => [
            [CENTRE[0] - lerp(0.2, 0.45, (i + 1) / 15), 0.5],
            [CENTRE[0] + lerp(0.2, 0.45, (i + 1) / 15), 0.5],
          ],
          15,
          t,
        ),
    ),
  );
  out(
    'synthetic_zoom_out',
    'two open palms moving together from 0.9 to 0.4 frame heights',
    seq(
      (t) =>
        pair(
          OPEN,
          OPEN,
          () => [
            [CENTRE[0] - 0.45, 0.5],
            [CENTRE[0] + 0.45, 0.5],
          ],
          12,
          t,
        ),
      (t) =>
        pair(
          OPEN,
          OPEN,
          (i) => [
            [CENTRE[0] - lerp(0.45, 0.2, (i + 1) / 15), 0.5],
            [CENTRE[0] + lerp(0.45, 0.2, (i + 1) / 15), 0.5],
          ],
          15,
          t,
        ),
    ),
  );
  out(
    'synthetic_rotate_ccw',
    'two open palms 0.5 apart rotating 45 degrees counter-clockwise on screen',
    seq(
      (t) =>
        pair(
          OPEN,
          OPEN,
          () => [
            [CENTRE[0] - 0.25, 0.5],
            [CENTRE[0] + 0.25, 0.5],
          ],
          12,
          t,
        ),
      (t) =>
        pair(
          OPEN,
          OPEN,
          (i) => {
            const a = (Math.PI / 4) * ((i + 1) / 15); // CCW on screen = y decreases on the right hand
            return [
              [CENTRE[0] - 0.25 * Math.cos(a), 0.5 + 0.25 * Math.sin(a)],
              [CENTRE[0] + 0.25 * Math.cos(a), 0.5 - 0.25 * Math.sin(a)],
            ];
          },
          15,
          t,
        ),
    ),
  );
  out(
    'synthetic_static_two_palms',
    'two open palms holding still for 3 s (must not zoom or rotate)',
    pair(
      OPEN,
      OPEN,
      () => [
        [CENTRE[0] - 0.25, 0.5],
        [CENTRE[0] + 0.25, 0.5],
      ],
      90,
    ),
  );
  out(
    'synthetic_clap',
    'two open palms 0.6 apart close to touching in 4 frames, then part slowly',
    seq(
      (t) =>
        pair(
          OPEN,
          OPEN,
          () => [
            [CENTRE[0] - 0.3, 0.5],
            [CENTRE[0] + 0.3, 0.5],
          ],
          12,
          t,
        ),
      (t) =>
        pair(
          OPEN,
          OPEN,
          (i) => [
            [CENTRE[0] - lerp(0.3, 0.1, (i + 1) / 4), 0.5],
            [CENTRE[0] + lerp(0.3, 0.1, (i + 1) / 4), 0.5],
          ],
          4,
          t,
        ),
      (t) =>
        pair(
          OPEN,
          OPEN,
          (i) => [
            [CENTRE[0] - lerp(0.1, 0.35, (i + 1) / 30), 0.5],
            [CENTRE[0] + lerp(0.1, 0.35, (i + 1) / 30), 0.5],
          ],
          30,
          t,
        ),
    ),
  );
  const clapMerge = seq(
    (t) =>
      pair(
        OPEN,
        OPEN,
        () => [
          [CENTRE[0] - 0.3, 0.5],
          [CENTRE[0] + 0.3, 0.5],
        ],
        12,
        t,
      ),
    (t) =>
      pair(
        OPEN,
        OPEN,
        (i) => [
          [CENTRE[0] - lerp(0.3, 0.12, (i + 1) / 4), 0.5],
          [CENTRE[0] + lerp(0.3, 0.12, (i + 1) / 4), 0.5],
        ],
        4,
        t,
      ),
    (t) => still(OPEN, CENTRE, 20, t), // the hands merged: the model now reports one hand
  );
  out('synthetic_clap_merge', 'approach fast, then the model sees a single merged hand', clapMerge);

  const fist: HandSpec = { curl: [0, 1, 1, 1], thumb: 'out' };
  const heart = (gap: number): Frame[] =>
    Array.from({ length: 30 }, (_, i) => {
      const a = makeHand({ ...fist, cx: 0.38, cy: 0.55 });
      const b = makeHand({ ...fist, cx: 0.62, cy: 0.55, mirror: true });
      // Thumb tips meet low in the middle, index tips meet high in the middle.
      setLandmark(a, 4, 0.5 - gap / 2, 0.66);
      setLandmark(b, 4, 0.5 + gap / 2, 0.66);
      setLandmark(a, 8, 0.5 - gap / 2, 0.42);
      setLandmark(b, 8, 0.5 + gap / 2, 0.42);
      return { t: i * FRAME_MS, hands: [a, b] };
    });
  out(
    'synthetic_heart',
    'two hands, thumb tips together and index tips together above them',
    heart(0),
  );
  out(
    'synthetic_heart_apart',
    'same hands but thumbs and indexes 0.3 apart (not a heart)',
    heart(0.3),
  );

  const L: HandSpec = { curl: [0, 1, 1, 1], thumb: 'out' };
  out(
    'synthetic_frame',
    'two L-shapes at opposite corners opening toward each other',
    Array.from({ length: 30 }, (_, i) => ({
      t: i * FRAME_MS,
      hands: [
        // Display space is mirrored: the left hand must open down-left in the RAW image to open
        // down-right on screen, and the right hand (mirrored L) opens up-right raw = up-left on screen.
        handAt({ ...L, rotateDeg: -90 }, CENTRE[0] - 0.3, 0.3),
        handAt({ ...L, mirror: true }, CENTRE[0] + 0.3, 0.7),
      ],
    })),
  );
  out(
    'synthetic_two_fists',
    'two fists side by side (negative for heart and frame)',
    pair(
      POSES.fist!,
      POSES.fist!,
      () => [
        [CENTRE[0] - 0.25, 0.5],
        [CENTRE[0] + 0.25, 0.5],
      ],
      30,
    ),
  );
});
