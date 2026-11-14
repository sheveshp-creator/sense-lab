import { describe, expect, it } from 'vitest';
import { BLENDSHAPE_NAMES, BS } from '../src/features/face/blendshapes';
import {
  EXPRESSIONS,
  ExpressionSmoother,
  RuleBasedClassifier,
} from '../src/features/face/expression';
import type { Expression, ExpressionClassifier } from '../src/features/face/expression';
import { rng } from './helpers/scenes';
import real from './fixtures/expression_blendshapes.json';

/** A blendshape vector with the named scores set and everything else 0. */
const face = (v: Partial<Record<keyof typeof BS, number>>) => {
  const b = new Float32Array(52);
  for (const [k, x] of Object.entries(v)) b[BS[k as keyof typeof BS]] = x!;
  return b;
};
const classifier = new RuleBasedClassifier();
const run = (b: ArrayLike<number>) => {
  const out = new Float32Array(5);
  const label = classifier.classify(b, out);
  return { label, out };
};

describe('blendshape names', () => {
  it('has the 52 categories in the model order, with unique names', () => {
    expect(BLENDSHAPE_NAMES).toHaveLength(52);
    expect(new Set(BLENDSHAPE_NAMES).size).toBe(52);
    expect(BS.eyeBlinkLeft).toBe(9);
    expect(BS.jawOpen).toBe(25);
    expect(BS.mouthSmileRight).toBe(45);
    expect(BS.noseSneerRight).toBe(51);
  });
});

describe('rule-based classifier on hand-built faces', () => {
  it('a relaxed face (all zeros) is neutral, with the neutral score at its maximum', () => {
    const { label, out } = run(face({}));
    expect(label).toBe('neutral');
    expect(out[4]).toBeCloseTo(1, 5);
  });

  it('a clear smile is happy', () => {
    expect(run(face({ mouthSmileLeft: 0.8, mouthSmileRight: 0.8 })).label).toBe('happy');
  });

  it('raised brows, open jaw and wide eyes are surprised', () => {
    const b = face({
      browInnerUp: 0.7,
      browOuterUpLeft: 0.7,
      browOuterUpRight: 0.7,
      jawOpen: 0.6,
      eyeWideLeft: 0.3,
      eyeWideRight: 0.3,
    });
    expect(run(b).label).toBe('surprised');
  });

  it('brows pulled down and squinting eyes are angry', () => {
    expect(
      run(face({ browDownLeft: 0.7, browDownRight: 0.7, eyeSquintLeft: 0.5, eyeSquintRight: 0.5 }))
        .label,
    ).toBe('angry');
  });

  it('inner brows raised and a pushed-up lower lip are sad', () => {
    expect(run(face({ browInnerUp: 0.6, mouthShrugLower: 0.4 })).label).toBe('sad');
  });

  it('a laugh (smile with a wide-open jaw) is happy, not surprised: a smile suppresses the others', () => {
    const b = face({
      mouthSmileLeft: 0.9,
      mouthSmileRight: 0.9,
      jawOpen: 0.7,
      browInnerUp: 0.4,
      browOuterUpLeft: 0.4,
      browOuterUpRight: 0.4,
    });
    expect(run(b).label).toBe('happy');
  });

  it('raised brows cancel anger (a surprised face with some brow-down noise is not angry)', () => {
    const b = face({
      browInnerUp: 0.6,
      browOuterUpLeft: 0.6,
      browOuterUpRight: 0.6,
      browDownLeft: 0.3,
      browDownRight: 0.3,
      jawOpen: 0.4,
    });
    expect(run(b).label).toBe('surprised');
  });

  it('weak evidence stays neutral: below the evidence bar nothing wins', () => {
    expect(run(face({ mouthSmileLeft: 0.25, mouthSmileRight: 0.25 })).label).toBe('neutral');
  });

  it('the dead blendshapes (noseSneer, cheekSquint, mouthFrown on their own) do not drive any rule except frown for sadness', () => {
    expect(
      run(face({ noseSneerLeft: 1, noseSneerRight: 1, cheekSquintLeft: 1, cheekSquintRight: 1 }))
        .label,
    ).toBe('neutral');
  });

  it('a single eye blink or a head-turn gaze does not change the expression', () => {
    expect(
      run(face({ eyeBlinkLeft: 1, eyeBlinkRight: 1, eyeLookOutLeft: 0.8, eyeLookInRight: 0.8 }))
        .label,
    ).toBe('neutral');
  });
});

describe('the scores and the label always agree (the meter never contradicts the label)', () => {
  it('on 2000 random faces: scores in 0..1, label = highest score', () => {
    const r = rng(5);
    const out = new Float32Array(5);
    for (let n = 0; n < 2000; n++) {
      const b = Float32Array.from({ length: 52 }, () => Math.max(0, r()) * (n % 3 === 0 ? 1 : 0.4));
      const label = classifier.classify(b, out);
      for (const s of out) {
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(1);
      }
      expect(EXPRESSIONS[out.indexOf(Math.max(...out))]).toBe(label);
    }
  });

  it('is deterministic and does not modify its input', () => {
    const b = face({ mouthSmileLeft: 0.7, jawOpen: 0.3 });
    const copy = Float32Array.from(b);
    expect(run(b).label).toBe(run(b).label);
    expect(Array.from(b)).toEqual(Array.from(copy));
  });
});

describe('on REAL blendshape scores from held-out photos (not used for tuning)', () => {
  type S = { label: Expression; source: string; blendshapes: number[] };
  const samples = real.samples as S[];
  const tally = (pred: (s: S) => boolean) => {
    const rows = samples.filter(pred);
    const out = new Float32Array(5);
    const hits = rows.filter((s) => classifier.classify(s.blendshapes, out) === s.label).length;
    return { hits, n: rows.length, rate: hits / rows.length };
  };

  it('has 100 vectors of 52 numbers over the five expressions', () => {
    expect(samples).toHaveLength(100);
    for (const s of samples) expect(s.blendshapes).toHaveLength(52);
    expect(new Set(samples.map((s) => s.label)).size).toBe(5);
  });

  it('posed happy and posed surprised are recognised every time', () => {
    expect(tally((s) => s.source === 'posed' && s.label === 'happy').rate).toBe(1);
    expect(tally((s) => s.source === 'posed' && s.label === 'surprised').rate).toBe(1);
  });

  it('posed angry and posed sad are mostly right (they are the subtle ones)', () => {
    expect(tally((s) => s.source === 'posed' && s.label === 'angry').rate).toBeGreaterThanOrEqual(
      0.6,
    );
    expect(tally((s) => s.source === 'posed' && s.label === 'sad').rate).toBeGreaterThanOrEqual(
      0.6,
    );
  });

  it('in ordinary photos happy is easy and the others are well above chance, as measured', () => {
    expect(
      tally((s) => s.source === 'in-the-wild' && s.label === 'happy').rate,
    ).toBeGreaterThanOrEqual(0.75);
    // Five classes: chance is 20%. In-the-wild photos are noisy; the full held-out run measured 52% overall.
    expect(tally((s) => s.source === 'in-the-wild').rate).toBeGreaterThanOrEqual(0.4);
  });

  it('the neutral photos are not all called an expression', () => {
    expect(tally((s) => s.label === 'neutral').rate).toBeGreaterThanOrEqual(0.3);
  });
});

describe('ExpressionSmoother (no flicker)', () => {
  const score = (e: Expression, v = 0.8) => {
    const s = new Float32Array(5).fill(0.05);
    s[EXPRESSIONS.indexOf(e)] = v;
    return s;
  };
  const feed = (sm: ExpressionSmoother, seq: Expression[], t0 = 0) =>
    seq.map((e, i) => (sm.update(score(e), t0 + i * 33) ? sm.label : null));

  it('starts neutral', () => {
    expect(new ExpressionSmoother().label).toBe('neutral');
  });

  it('a new expression needs a few stable frames before the label changes', () => {
    const sm = new ExpressionSmoother();
    const changes = feed(sm, Array(8).fill('happy'));
    // The 5-frame average has to flip first, then the label must hold for 4 frames.
    const first = changes.findIndex((c) => c === 'happy');
    expect(first).toBeGreaterThanOrEqual(3);
    expect(first).toBeLessThanOrEqual(7);
    expect(sm.label).toBe('happy');
  });

  it('one odd frame never flips the label, and neither does a 2-frame blip', () => {
    const sm = new ExpressionSmoother();
    feed(sm, Array(12).fill('happy'));
    expect(sm.label).toBe('happy');
    const seq = [
      ...Array(1).fill('angry'),
      ...Array(8).fill('happy'),
      ...Array(2).fill('surprised'),
      ...Array(8).fill('happy'),
    ] as Expression[];
    const changed = feed(sm, seq, 1000).filter(Boolean);
    expect(changed).toEqual([]);
    expect(sm.label).toBe('happy');
  });

  it('a sustained change does switch, once, with no ping-pong', () => {
    const sm = new ExpressionSmoother();
    feed(sm, Array(12).fill('happy'));
    const seq = Array(20).fill('surprised') as Expression[];
    const changes = feed(sm, seq, 1000).filter(Boolean);
    expect(changes).toEqual(['surprised']);
  });

  it('on noisy scores hovering between two expressions the label does not flicker', () => {
    const sm = new ExpressionSmoother();
    const r = rng(9);
    let changes = 0;
    let rawFlips = 0;
    let prevRaw = -1;
    for (let i = 0; i < 300; i++) {
      const s = new Float32Array(5).fill(0.05);
      s[0] = 0.5 + 0.08 * r(); // happy and sad within noise of each other
      s[1] = 0.5 + 0.08 * r();
      const raw = s[0]! > s[1]! ? 0 : 1;
      if (prevRaw >= 0 && raw !== prevRaw) rawFlips++;
      prevRaw = raw;
      if (sm.update(s, i * 33)) changes++;
    }
    expect(rawFlips).toBeGreaterThan(100); // without smoothing the label would flip constantly
    expect(changes).toBeLessThanOrEqual(rawFlips / 10);
  });

  it('the displayed scores are the average of the last 5 frames', () => {
    const sm = new ExpressionSmoother();
    for (let i = 0; i < 5; i++) sm.update(score('happy', i % 2 ? 0.4 : 0.8), i);
    expect(sm.scores[0]).toBeCloseTo((0.8 + 0.4 + 0.8 + 0.4 + 0.8) / 5, 5);
  });

  it('reports when the label changed and reset() starts over', () => {
    const sm = new ExpressionSmoother({ window: 1, stableFrames: 2, margin: 0 });
    expect(sm.update(score('happy'), 10)).toBe(false);
    expect(sm.update(score('happy'), 20)).toBe(true);
    expect(sm.changedAt).toBe(20);
    sm.reset();
    expect(sm.label).toBe('neutral');
    expect(sm.changedAt).toBe(-1);
  });
});

describe('the classifier is replaceable (a trained model can slot in)', () => {
  it('any object with classify() drives the smoother and the label', () => {
    // A stand-in "trained model": says happy whenever jawOpen is high. Nothing else in the app changes.
    const fake: ExpressionClassifier = {
      id: 'fake',
      classify(b, out) {
        out.fill(0);
        const happy = b[BS.jawOpen]! > 0.5;
        out[happy ? 0 : 4] = 1;
        return happy ? 'happy' : 'neutral';
      },
    };
    const sm = new ExpressionSmoother();
    const out = new Float32Array(5);
    for (let i = 0; i < 12; i++) {
      fake.classify(face({ jawOpen: 0.9 }), out);
      sm.update(out, i * 33);
    }
    expect(sm.label).toBe('happy');
  });
});
