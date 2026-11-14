import { describe, expect, it } from 'vitest';
import { BlinkDetector, DEFAULT_BLINK } from '../src/features/face/eyes/blink';
import { EarClosure, eyeAspectRatio } from '../src/features/face/eyes/ear';
import { blinkCurve, blinks, sampleTrace } from './helpers/blinkTraces';
import type { Sample } from './helpers/blinkTraces';

const count = (trace: Sample[], d = new BlinkDetector()) => {
  const events = trace.map((s) => d.update(s.closure, s.t)).filter(Boolean);
  return { d, events, n: d.count };
};

describe('blink detection with hysteresis', () => {
  it('counts normal blinks at 30 fps even when the camera frames miss the peak', () => {
    const r = count(sampleTrace(blinks([1200, 4000, 7300, 10100]), 12_000));
    expect(r.n).toBe(4);
    expect(r.events[0]!.durationMs).toBeGreaterThan(30);
    expect(r.events[0]!.durationMs).toBeLessThan(300);
  });

  it('counts at a slower 15 fps too (a busy device)', () => {
    expect(count(sampleTrace(blinks([1000, 3000, 5000]), 7000, 15)).n).toBe(3);
  });

  it('counts a fast double blink as two', () => {
    expect(count(sampleTrace(blinks([2000, 2330, 5000]), 7000)).n).toBe(3);
  });

  it('does not count a squint that stays under the down threshold (smiling eyes)', () => {
    const squint = (t: number) => (t % 4000 > 1000 && t % 4000 < 3000 ? 0.45 : 0);
    expect(count(sampleTrace(squint, 12_000, 30, 0.03)).n).toBe(0);
  });

  it('does not count noise around open eyes', () => {
    expect(count(sampleTrace(() => 0.1, 20_000, 30, 0.12)).n).toBe(0);
  });

  it('does not count a wink: the signal is min(left, right)', () => {
    const left = sampleTrace(blinks([1000, 3000]), 5000);
    const right = sampleTrace(() => 0.05, 5000, 30, 0.02);
    const min = left.map((s, i) => ({ t: s.t, closure: Math.min(s.closure, right[i]!.closure) }));
    expect(count(min).n).toBe(0);
    // ...while both eyes blinking together is counted:
    const both = left.map((s, i) => ({ t: s.t, closure: Math.min(s.closure, left[i]!.closure) }));
    expect(count(both).n).toBe(2);
  });

  it('eyes held shut longer than 800 ms are not a blink, and the one after is still counted', () => {
    const held = (t: number) => (t > 1000 && t < 2700 ? 0.9 : 0);
    const trace = sampleTrace((t) => Math.max(held(t), blinkCurve(t, 5000)), 7000);
    const d = new BlinkDetector();
    let heldSeen = false;
    for (const s of trace) {
      d.update(s.closure, s.t);
      heldSeen ||= d.heldShut;
    }
    expect(d.count).toBe(1);
    expect(heldSeen).toBe(true);
  });

  it('a slow 400 ms blink is still a blink', () => {
    const slow = (t: number) => (t > 1000 && t < 1400 ? 0.85 : 0);
    expect(count(sampleTrace(slow, 3000)).n).toBe(1);
  });

  it('hysteresis: a value wobbling around the down threshold is one blink, not several', () => {
    // Closes, then wobbles 0.50-0.60 (around "down") for a while, then re-opens: still one blink.
    const trace: Sample[] = [];
    for (let i = 0; i < 90; i++) {
      const t = i * 33;
      let v = 0.05;
      if (i >= 10 && i < 14) v = 0.9;
      else if (i >= 14 && i < 22) v = i % 2 ? 0.5 : 0.6;
      trace.push({ t, closure: v });
    }
    expect(count(trace).n).toBe(1);
  });

  it('hysteresis: wobbling around the up threshold while re-opening does not count a second blink', () => {
    const trace: Sample[] = [];
    const closed = [0.9, 0.9, 0.9];
    const wobble = [0.34, 0.28, 0.34, 0.28, 0.34, 0.28];
    const vals = [0.05, 0.05, 0.05, ...closed, ...wobble, 0.05, 0.05, 0.05];
    vals.forEach((v, i) => trace.push({ t: i * 33, closure: v }));
    expect(count(trace).n).toBe(1);
  });

  it('the down threshold really is higher than the up threshold', () => {
    expect(DEFAULT_BLINK.down).toBeGreaterThan(DEFAULT_BLINK.up);
  });

  it('losing the face while the eyes are closed does not count a blink across the gap', () => {
    const d = new BlinkDetector();
    d.update(0.05, 0);
    d.update(0.9, 33); // closes...
    // ...face lost for 2 s, comes back with eyes open:
    expect(d.update(0.05, 2033)).toBeNull();
    expect(d.count).toBe(0);
  });

  it('the refractory period ignores a bounce right after a counted blink', () => {
    const d = new BlinkDetector();
    const seq = [0.05, 0.9, 0.9, 0.05, 0.9, 0.05];
    const out = seq.map((v, i) => d.update(v, i * 33));
    expect(out.filter(Boolean)).toHaveLength(1);
  });

  it('reports a blink event with when it ended and how long it lasted', () => {
    const d = new BlinkDetector();
    d.update(0.05, 0);
    d.update(0.9, 100);
    d.update(0.9, 133);
    const e = d.update(0.1, 166)!;
    expect(e).toEqual({ t: 166, durationMs: 66 });
  });
});

describe('blinks per minute', () => {
  const evenBlinks = (n: number, spanMs: number) =>
    Array.from({ length: n }, (_, i) => 500 + (i * spanMs) / n);

  it('says 0 ("not enough data") before 10 seconds', () => {
    const d = new BlinkDetector();
    sampleTrace(blinks([1000, 3000]), 8000).forEach((s) => d.update(s.closure, s.t));
    expect(d.perMinute(8000)).toBe(0);
  });

  it('after a full minute reports the blinks in the last 60 s', () => {
    const d = new BlinkDetector();
    sampleTrace(blinks(evenBlinks(15, 60_000)), 60_500).forEach((s) => d.update(s.closure, s.t));
    expect(d.count).toBe(15);
    expect(d.perMinute(60_500)).toBeCloseTo(15, 0);
  });

  it('scales up what it has seen when less than a minute has passed', () => {
    const d = new BlinkDetector();
    sampleTrace(blinks(evenBlinks(5, 20_000)), 20_000).forEach((s) => d.update(s.closure, s.t));
    expect(d.perMinute(20_000)).toBeCloseTo(15, 0); // 5 blinks in 20 s
  });

  it('forgets blinks older than a minute', () => {
    const d = new BlinkDetector();
    sampleTrace(blinks([2000, 4000, 6000]), 130_000).forEach((s) => d.update(s.closure, s.t));
    expect(d.count).toBe(3);
    expect(d.perMinute(130_000)).toBe(0);
  });

  it('reset() clears everything', () => {
    const d = new BlinkDetector();
    sampleTrace(blinks([1000]), 3000).forEach((s) => d.update(s.closure, s.t));
    d.reset();
    expect(d.count).toBe(0);
    expect(d.perMinute(5000)).toBe(0);
  });
});

describe('eye aspect ratio fallback', () => {
  /** Landmarks for two eyes of the given height/width ratio (only the points EAR reads). */
  const eyes = (ratio: number, width = 0.06) => {
    const lm = new Float32Array(478 * 3);
    const set = (i: number, x: number, y: number) => lm.set([x, y, 0], i * 3);
    const h = (ratio * width) / 1; // EAR = (v1+v2)/(2w) with both verticals = h  =>  h = ratio * w
    for (const [cx, p] of [
      [0.35, [33, 160, 158, 133, 153, 144]],
      [0.65, [362, 385, 387, 263, 373, 380]],
    ] as const) {
      const [p1, p2, p3, p4, p5, p6] = p;
      set(p1, cx - width / 2, 0.5);
      set(p4, cx + width / 2, 0.5);
      set(p2, cx - width / 6, 0.5 - h / 2);
      set(p3, cx + width / 6, 0.5 - h / 2);
      set(p6, cx - width / 6, 0.5 + h / 2);
      set(p5, cx + width / 6, 0.5 + h / 2);
    }
    return lm;
  };

  it('EAR equals height / width and does not depend on eye size or frame shape', () => {
    expect(eyeAspectRatio(eyes(0.3), 1)).toBeCloseTo(0.3, 5);
    expect(eyeAspectRatio(eyes(0.3, 0.12), 1)).toBeCloseTo(0.3, 5); // bigger eyes (closer to camera)
    expect(eyeAspectRatio(eyes(0.3), 4 / 3)).toBeGreaterThan(0.2); // aspect applied to x
  });

  it('EAR falls when the eyes close', () => {
    expect(eyeAspectRatio(eyes(0.03))).toBeLessThan(eyeAspectRatio(eyes(0.3)) / 5);
  });

  it("EarClosure maps open to ~0 and closed to 1, whatever the person's own open EAR is", () => {
    for (const open of [0.22, 0.3, 0.38]) {
      const c = new EarClosure();
      let v = 0;
      for (let i = 0; i < 30; i++) v = c.update(open);
      expect(v).toBeCloseTo(0, 1);
      expect(c.update(open * 0.1)).toBe(1);
    }
  });

  it('counts blinks through the fallback signal', () => {
    const open = 0.3;
    const ear = sampleTrace(
      (t) => open * (1 - 0.9 * blinks([1500, 4000, 6500])(t)),
      9000,
      30,
      0.005,
    );
    const closure = new EarClosure();
    const d = new BlinkDetector();
    for (const s of ear) d.update(closure.update(s.closure), s.t);
    expect(d.count).toBe(3);
  });

  it('the learned open level adapts when the person moves closer or further', () => {
    const c = new EarClosure(0.99);
    for (let i = 0; i < 20; i++) c.update(0.35);
    for (let i = 0; i < 400; i++) c.update(0.2); // sits further away, EAR settles lower
    expect(c.update(0.2)).toBeLessThan(0.1);
  });
});
