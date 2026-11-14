import { describe, expect, it } from 'vitest';
import type { LiveFace, LiveHand, LiveTwoHand } from '../src/core/frameStore';
import { AirDrawModel, ERASER_RADIUS, PALETTE } from '../src/demos/airDraw/model';
import { SLIDES, SlideModel } from '../src/demos/slides/model';
import { MAX_SCALE, MIN_SCALE, ObjectModel } from '../src/demos/object3d/model';
import { AvatarSmoother, NEUTRAL_AVATAR, avatarFromFace } from '../src/demos/avatar/model';
import { BlinkBattleModel, COUNTDOWN_MS } from '../src/demos/blinkBattle/model';
import type { BattleFace } from '../src/demos/blinkBattle/model';
import { MoodModel } from '../src/demos/mood/model';
import { BS } from '../src/features/face/blendshapes';
import { EXPRESSIONS } from '../src/features/face/expression';
import expressionFixture from './fixtures/expression_blendshapes.json';

const ASPECT = 4 / 3;
const hand = (o: Partial<LiveHand> = {}): LiveHand => ({
  id: 1,
  hand: 'Right',
  gesture: null,
  palmX: 0.6,
  palmY: 0.5,
  palmLen: 0.18,
  pinch: null,
  ...o,
});
const pinchAt = (x: number, y: number) => ({ x: x * ASPECT, y, dragging: false }); // x given as 0..1 across the screen
const face = (o: Partial<LiveFace> = {}): LiveFace => ({
  id: 1,
  cx: 0.5,
  cy: 0.5,
  blendshapes: new Float32Array(52),
  yawDeg: 0,
  pitchDeg: 0,
  rollDeg: 0,
  expression: 'neutral',
  scores: Float32Array.from([0, 0, 0, 0, 1]),
  blinks: 0,
  eyesClosed: false,
  ...o,
});
const bs = (v: Partial<Record<keyof typeof BS, number>>) => {
  const b = new Float32Array(52);
  for (const [k, x] of Object.entries(v)) b[BS[k as keyof typeof BS]] = x!;
  return b;
};

describe('Air Draw', () => {
  it('a pinch draws a stroke that follows the pinch point (x is turned into 0..1 across the screen)', () => {
    const m = new AirDrawModel();
    m.frame([hand({ pinch: pinchAt(0.2, 0.3) })], ASPECT);
    m.frame([hand({ pinch: pinchAt(0.3, 0.35) })], ASPECT);
    m.frame([hand({ pinch: pinchAt(0.4, 0.4) })], ASPECT);
    expect(m.strokes).toHaveLength(1);
    expect(m.strokes[0]!.points).toHaveLength(3);
    expect(m.strokes[0]!.points[0]![0]).toBeCloseTo(0.2, 6);
    expect(m.strokes[0]!.points[2]![1]).toBeCloseTo(0.4, 6);
    expect(m.cursor).toMatchObject({ visible: true });
  });

  it('letting go ends the stroke; pinching again starts a new one', () => {
    const m = new AirDrawModel();
    m.frame([hand({ pinch: pinchAt(0.2, 0.3) })], ASPECT);
    m.frame([hand({ pinch: pinchAt(0.3, 0.3) })], ASPECT);
    m.frame([hand()], ASPECT);
    expect(m.cursor.visible).toBe(false);
    m.frame([hand({ pinch: pinchAt(0.6, 0.6) })], ASPECT);
    m.frame([hand({ pinch: pinchAt(0.7, 0.6) })], ASPECT);
    expect(m.strokes).toHaveLength(2);
    expect(m.strokes[0]!.points).toHaveLength(2);
  });

  it('does not add points when the hand barely moves', () => {
    const m = new AirDrawModel();
    for (let i = 0; i < 10; i++) m.frame([hand({ pinch: pinchAt(0.5, 0.5 + i * 0.0001) })], ASPECT);
    expect(m.strokes[0]!.points).toHaveLength(1);
  });

  it('an open palm erases only the strokes it passes over', () => {
    const m = new AirDrawModel();
    m.begin('mouse', 0.2, 0.2);
    m.move('mouse', 0.25, 0.2);
    m.end('mouse');
    m.begin('mouse', 0.8, 0.8);
    m.move('mouse', 0.85, 0.8);
    m.end('mouse');
    m.frame([hand({ gesture: 'openPalm', palmX: 0.22 * ASPECT, palmY: 0.2 })], ASPECT);
    expect(m.strokes).toHaveLength(1);
    expect(m.strokes[0]!.points[0]![0]).toBeCloseTo(0.8, 6);
    expect(m.eraser.visible).toBe(true);
    m.frame([hand()], ASPECT);
    expect(m.eraser.visible).toBe(false);
  });

  it('a fist or a peace sign does not erase', () => {
    const m = new AirDrawModel();
    m.begin('mouse', 0.5, 0.5);
    m.end('mouse');
    m.frame([hand({ gesture: 'fist', palmX: 0.5 * ASPECT, palmY: 0.5 })], ASPECT);
    m.frame([hand({ gesture: 'peace', palmX: 0.5 * ASPECT, palmY: 0.5 })], ASPECT);
    expect(m.strokes).toHaveLength(1);
  });

  it('erase range is the eraser radius, no further', () => {
    const m = new AirDrawModel();
    m.begin('mouse', 0.5 + ERASER_RADIUS + 0.02, 0.5);
    m.end('mouse');
    expect(m.eraseAt(0.5, 0.5)).toBe(0);
    expect(m.eraseAt(0.5 + 0.03, 0.5)).toBe(1);
  });

  it('changing colour affects new strokes only, and cycles through the palette', () => {
    const m = new AirDrawModel();
    m.begin('mouse', 0.1, 0.1);
    m.end('mouse');
    const first = m.color;
    const second = m.nextColour();
    m.begin('mouse', 0.2, 0.2);
    expect(m.strokes[0]!.color).toBe(first);
    expect(m.strokes[1]!.color).toBe(second);
    expect(second).not.toBe(first);
    for (let i = 0; i < PALETTE.length; i++) m.nextColour();
    expect(m.color).toBe(second); // a full circle of 5 steps comes back to the same colour
  });

  it('hand, mouse and keyboard can draw at the same time without mixing their strokes', () => {
    const m = new AirDrawModel();
    m.begin('mouse', 0.1, 0.1);
    m.frame([hand({ pinch: pinchAt(0.7, 0.7) })], ASPECT);
    m.move('mouse', 0.2, 0.2);
    m.frame([hand({ pinch: pinchAt(0.8, 0.8) })], ASPECT);
    expect(m.strokes).toHaveLength(2);
    expect(m.strokes.map((s) => s.points.length)).toEqual([2, 2]);
    m.frame([hand()], ASPECT); // the hand lets go...
    expect(m.isDrawing('mouse')).toBe(true); // ...the mouse stroke goes on
    expect(m.cursor.visible).toBe(true);
  });

  it('undo removes the last stroke; clear removes all', () => {
    const m = new AirDrawModel();
    for (let i = 0; i < 3; i++) {
      m.begin('mouse', i * 0.1, 0.5);
      m.end('mouse');
    }
    m.undo();
    expect(m.strokes).toHaveLength(2);
    m.clear();
    expect(m.strokes).toHaveLength(0);
    m.undo(); // nothing to undo is fine
    expect(m.strokes).toHaveLength(0);
  });

  it('caps memory: at most 400 strokes and 3000 points in one stroke', () => {
    const m = new AirDrawModel();
    for (let i = 0; i < 450; i++) {
      m.begin('mouse', 0.1, 0.1);
      m.end('mouse');
    }
    expect(m.strokes).toHaveLength(400);
    m.begin('mouse', 0, 0);
    for (let i = 1; i < 3200; i++) m.move('mouse', (i % 100) / 100, Math.floor(i / 100) / 40);
    expect(m.strokes.at(-1)!.points.length).toBeLessThanOrEqual(3000);
  });

  it('a stroke erased while still being drawn does not come back; the next frame starts a new one', () => {
    const m = new AirDrawModel();
    m.frame([hand({ pinch: pinchAt(0.5, 0.5) })], ASPECT);
    m.frame([hand({ pinch: pinchAt(0.52, 0.5) })], ASPECT);
    m.eraseAt(0.5, 0.5);
    expect(m.strokes).toHaveLength(0);
    expect(m.isDrawing('hand')).toBe(false);
    m.frame([hand({ pinch: pinchAt(0.6, 0.6) })], ASPECT);
    expect(m.strokes).toHaveLength(1);
  });
});

describe('Slide Remote', () => {
  it('moves forward and back and stops at the ends (no wrap)', () => {
    const s = new SlideModel();
    expect(s.prev()).toBe(false);
    expect(s.index).toBe(0);
    for (let i = 0; i < SLIDES.length - 1; i++) expect(s.next()).toBe(true);
    expect(s.index).toBe(SLIDES.length - 1);
    expect(s.next()).toBe(false);
    expect(s.prev()).toBe(true);
    expect(s.index).toBe(SLIDES.length - 2);
  });

  it('remembers which way it moved, for the slide animation', () => {
    const s = new SlideModel();
    s.next();
    expect(s.direction).toBe(1);
    s.prev();
    expect(s.direction).toBe(-1);
  });

  it('likes count per slide and in total, and each like bumps the tick for the heart animation', () => {
    const s = new SlideModel();
    s.like();
    s.like();
    s.next();
    s.like();
    expect(s.likes.slice(0, 2)).toEqual([2, 1]);
    expect(s.totalLikes).toBe(3);
    expect(s.likeTick).toBe(3);
  });
});

describe('3D Object', () => {
  const grip = (engaged: boolean, scale = 1, deg = 0): LiveTwoHand => ({ engaged, scale, deg });

  it('zooms and rotates while the hands are engaged', () => {
    const o = new ObjectModel();
    o.frame(grip(true, 1.5, 20));
    expect(o.scale).toBeCloseTo(1.5);
    expect(o.rotationDeg).toBeCloseTo(20);
  });

  it('keeps what it reached when the hands let go, and the next grip continues from there', () => {
    const o = new ObjectModel();
    o.frame(grip(true, 1.5, 20));
    o.frame(grip(false));
    expect(o.scale).toBeCloseTo(1.5);
    expect(o.rotationDeg).toBeCloseTo(20);
    o.frame(grip(true, 1, 0)); // a fresh grip starts at "1x, 0 degrees" relative to where it is now
    expect(o.scale).toBeCloseTo(1.5);
    o.frame(grip(true, 2, -30));
    expect(o.scale).toBeCloseTo(3); // 1.5 x 2 = 3 (the maximum)
    expect(o.rotationDeg).toBeCloseTo(-10);
  });

  it('stays between the minimum and maximum size', () => {
    const o = new ObjectModel();
    o.frame(grip(true, 100));
    expect(o.scale).toBe(MAX_SCALE);
    o.frame(grip(false));
    o.frame(grip(true, 0.0001));
    expect(o.scale).toBe(MIN_SCALE);
  });

  it('buttons and keys do the same: zoomBy and rotateBy, and a grip afterwards continues from them', () => {
    const o = new ObjectModel();
    o.zoomBy(1.25);
    o.rotateBy(15);
    expect(o.scale).toBeCloseTo(1.25);
    expect(o.rotationDeg).toBe(15);
    o.frame(grip(true, 2, 10));
    expect(o.scale).toBeCloseTo(2.5);
    expect(o.rotationDeg).toBeCloseTo(25);
    for (let i = 0; i < 40; i++) o.zoomBy(2);
    expect(o.scale).toBe(MAX_SCALE);
  });

  it('reset (the clap) returns to 1x, 0 degrees and is counted', () => {
    const o = new ObjectModel();
    o.frame(grip(true, 2, 90));
    o.reset();
    expect(o.scale).toBe(1);
    expect(o.rotationDeg).toBe(0);
    expect(o.resets).toBe(1);
    o.frame(grip(true, 1.2, 0)); // still holding: continues from the reset state, not the old one
    expect(o.scale).toBeCloseTo(1.2);
  });
});

describe('Mirror Avatar mapping', () => {
  it('a relaxed face maps to the neutral cartoon', () => {
    expect(avatarFromFace(face())).toEqual(NEUTRAL_AVATAR);
  });

  it('smile, open jaw and blinks map to their own parameters', () => {
    const p = avatarFromFace(
      face({
        blendshapes: bs({
          mouthSmileLeft: 0.8,
          mouthSmileRight: 0.6,
          jawOpen: 0.4,
          eyeBlinkLeft: 0.9,
        }),
      }),
    );
    expect(p.smile).toBeCloseTo(0.7);
    expect(p.mouthOpen).toBeCloseTo(0.4);
    expect(p.blinkLeft).toBeCloseTo(0.9);
    expect(p.blinkRight).toBe(0); // a wink stays a wink
  });

  it('raised brows go positive, lowered brows negative, and it stays within -1..1', () => {
    expect(
      avatarFromFace(
        face({
          blendshapes: bs({ browInnerUp: 0.6, browOuterUpLeft: 0.6, browOuterUpRight: 0.6 }),
        }),
      ).browRaise,
    ).toBeCloseTo(0.6);
    expect(
      avatarFromFace(face({ blendshapes: bs({ browDownLeft: 0.8, browDownRight: 0.8 }) }))
        .browRaise,
    ).toBeCloseTo(-0.8);
    expect(
      avatarFromFace(
        face({ blendshapes: bs({ browDownLeft: 1, browDownRight: 1, eyeBlinkLeft: 5 }) }),
      ).browRaise,
    ).toBe(-1);
    expect(avatarFromFace(face({ blendshapes: bs({ eyeBlinkLeft: 5 }) })).blinkLeft).toBe(1);
  });

  it('copies the head angles as they are (already in the on-screen convention)', () => {
    const p = avatarFromFace(face({ yawDeg: 18, pitchDeg: -7, rollDeg: 4 }));
    expect([p.yaw, p.pitch, p.roll]).toEqual([18, -7, 4]);
  });

  it('on REAL blendshape scores: posed happy faces smile, posed surprised faces open the mouth and raise the brows', () => {
    type S = { label: string; source: string; blendshapes: number[] };
    const rows = (expressionFixture.samples as S[]).filter((s) => s.source === 'posed');
    const avg = (label: string, pick: (p: ReturnType<typeof avatarFromFace>) => number) => {
      const xs = rows
        .filter((r) => r.label === label)
        .map((r) => pick(avatarFromFace(face({ blendshapes: Float32Array.from(r.blendshapes) }))));
      return xs.reduce((a, b) => a + b, 0) / xs.length;
    };
    expect(avg('happy', (p) => p.smile)).toBeGreaterThan(0.6);
    expect(avg('surprised', (p) => p.mouthOpen)).toBeGreaterThan(0.3);
    expect(avg('surprised', (p) => p.browRaise)).toBeGreaterThan(0.3);
    expect(avg('angry', (p) => p.browRaise)).toBeLessThan(0); // angry brows are pulled down
    expect(avg('angry', (p) => p.smile)).toBeLessThan(0.2);
  });

  describe('smoothing', () => {
    const target = { ...NEUTRAL_AVATAR, smile: 1, blinkLeft: 1, yaw: 30 };

    it('eases toward the target without overshooting and gets there', () => {
      const s = new AvatarSmoother();
      let prev = 0;
      for (let i = 0; i < 100; i++) {
        s.update(target, 33);
        expect(s.value.smile).toBeGreaterThanOrEqual(prev);
        expect(s.value.smile).toBeLessThanOrEqual(1);
        prev = s.value.smile;
      }
      expect(s.value.smile).toBeCloseTo(1, 3);
      expect(s.value.yaw).toBeCloseTo(30, 2);
    });

    it('blinks follow much faster than the head turn (a blink must not be missed)', () => {
      const s = new AvatarSmoother();
      s.update(target, 33);
      expect(s.value.blinkLeft / 1).toBeGreaterThan(s.value.yaw / 30 + 0.2);
    });

    it('does not depend on the frame rate: two 16 ms steps equal one 32 ms step', () => {
      const a = new AvatarSmoother();
      const b = new AvatarSmoother();
      a.update(target, 16);
      a.update(target, 16);
      b.update(target, 32);
      expect(a.value.smile).toBeCloseTo(b.value.smile, 6);
    });

    it('a zero or negative time step changes nothing', () => {
      const s = new AvatarSmoother();
      s.update(target, 0);
      s.update(target, -5);
      expect(s.value).toEqual(NEUTRAL_AVATAR);
    });
  });
});

describe('Blink Battle', () => {
  const two: BattleFace[] = [
    { id: 7, cx: 0.7 },
    { id: 3, cx: 0.25 },
  ];
  const live = (m: BlinkBattleModel, t0 = 0) => {
    m.start(t0, two);
    m.update(t0 + COUNTDOWN_MS + 1, two);
    return t0 + COUNTDOWN_MS + 1;
  };

  it('needs two faces to start, and player 1 is the face on the left of the screen', () => {
    const m = new BlinkBattleModel();
    expect(m.start(0, [two[0]!])).toBe(false);
    expect(m.phase).toBe('waiting');
    expect(m.start(0, two)).toBe(true);
    expect(m.players[0].trackId).toBe(3); // cx 0.25 = left
    expect(m.players[1].trackId).toBe(7);
  });

  it('counts down 3 seconds, then goes live; a blink during the countdown is ignored', () => {
    const m = new BlinkBattleModel();
    m.start(1000, two);
    expect(m.countdownLeft(1000)).toBe(COUNTDOWN_MS);
    m.blink(3, 1500, 1500); // too early
    m.update(1000 + COUNTDOWN_MS - 1, two);
    expect(m.phase).toBe('countdown');
    m.update(1000 + COUNTDOWN_MS, two);
    expect(m.phase).toBe('live');
    expect(m.loser).toBeNull();
  });

  it('the first blink loses, the other player wins the round, and the time survived is recorded', () => {
    const m = new BlinkBattleModel();
    const t = live(m);
    m.blink(7, t + 2200, t + 2300); // player 2 blinks 2.2 s into the round
    m.update(t + 2300 + 200, two); // the grace period passes
    expect(m.phase).toBe('over');
    expect(m.loser).toBe(1);
    expect(m.reason).toBe('blink');
    expect(m.players[0].wins).toBe(1);
    expect(m.players[1].wins).toBe(0);
    expect(m.survivedMs).toBe(2200);
  });

  it('when both blink almost together, whoever STARTED first loses, not whoever was reported first', () => {
    const m = new BlinkBattleModel();
    const t = live(m);
    m.blink(3, t + 1000, t + 1120); // player 1 reported first, started later
    m.blink(7, t + 960, t + 1100); // player 2 started 40 ms earlier but reported second
    expect(m.phase).toBe('over');
    expect(m.loser).toBe(1);
  });

  it('blinks that start within 20 ms of each other are a draw and score nothing', () => {
    const m = new BlinkBattleModel();
    const t = live(m);
    m.blink(3, t + 1000, t + 1100);
    m.blink(7, t + 1010, t + 1110);
    expect(m.phase).toBe('over');
    expect(m.reason).toBe('draw');
    expect(m.loser).toBeNull();
    expect(m.players[0].wins + m.players[1].wins).toBe(0);
  });

  it('ignores a second blink from the same player, faces that are not playing, and blinks after the round', () => {
    const m = new BlinkBattleModel();
    const t = live(m);
    m.blink(99, t + 500, t + 600); // a bystander
    m.update(t + 900, two);
    expect(m.phase).toBe('live');
    m.blink(3, t + 1000, t + 1100);
    m.blink(3, t + 1010, t + 1110);
    m.update(t + 1400, two);
    expect(m.loser).toBe(0);
    m.blink(7, t + 2000, t + 2100);
    expect(m.players[0].wins + m.players[1].wins).toBe(1);
  });

  it('a player whose face disappears for 1.5 s forfeits; a short dropout does not', () => {
    const m = new BlinkBattleModel();
    const t = live(m);
    const onlyP2 = [two[0]!];
    m.update(t + 1000, onlyP2);
    expect(m.phase).toBe('live'); // 1 s gone is fine
    m.update(t + 1100, two); // back
    m.update(t + 2600, onlyP2);
    expect(m.phase).toBe('live');
    m.update(t + 2600 + 1600, onlyP2);
    expect(m.phase).toBe('over');
    expect(m.reason).toBe('face lost');
    expect(m.loser).toBe(0);
  });

  it('manual blinks (buttons and keys) play the same game', () => {
    const m = new BlinkBattleModel();
    const t = live(m);
    m.manualBlink(0, t + 3000);
    m.update(t + 3300, two);
    expect(m.loser).toBe(0);
    expect(m.players[1].wins).toBe(1);
  });

  it('scores survive new rounds; resetScores clears them; a round in progress cannot be restarted', () => {
    const m = new BlinkBattleModel();
    let t = live(m);
    m.manualBlink(1, t + 100);
    m.update(t + 400, two);
    expect(m.players[0].wins).toBe(1);
    m.newRound();
    expect(m.phase).toBe('waiting');
    expect(m.players[0].wins).toBe(1);
    t = live(m, 50_000);
    expect(m.start(t, two)).toBe(false); // already live
    m.resetScores();
    expect(m.players[0].wins).toBe(0);
    expect(m.phase).toBe('waiting');
  });
});

describe('Mood Meter', () => {
  const happyFace = (): LiveFace =>
    face({ expression: 'happy', scores: Float32Array.from([0.9, 0, 0, 0.1, 0]) });
  const sadFace = (): LiveFace =>
    face({ id: 2, expression: 'sad', scores: Float32Array.from([0, 0.7, 0.1, 0, 0.2]) });

  it('averages the scores of every visible face, 4 times a second', () => {
    const m = new MoodModel();
    expect(m.sample(1000, [happyFace(), sadFace()])).toBe(true);
    expect(m.sample(1100, [happyFace(), sadFace()])).toBe(false); // too soon
    expect(m.sample(1250, [happyFace(), sadFace()])).toBe(true);
    const r = m.read(1250);
    expect(r.t).toEqual([1000, 1250]);
    expect(r.values[EXPRESSIONS.indexOf('happy')]![0]).toBeCloseTo(0.45);
    expect(r.values[EXPRESSIONS.indexOf('sad')]![0]).toBeCloseTo(0.35);
  });

  it('counts the expression each face shows right now, even between samples', () => {
    const m = new MoodModel();
    m.sample(0, [happyFace(), sadFace(), happyFace()]);
    m.sample(50, [happyFace()]);
    expect(m.faceCount).toBe(1);
    expect(m.counts.happy).toBe(1);
    expect(m.counts.sad).toBe(0);
  });

  it('records a gap (NaN) when nobody is in view, and has no room mood then', () => {
    const m = new MoodModel();
    m.sample(0, [happyFace()]);
    expect(m.room()).toBe('happy');
    m.sample(300, []);
    expect(m.room()).toBeNull();
    expect(m.read(300).values[0]!.at(-1)).toBeNaN();
  });

  it('the room mood is the expression with the highest average', () => {
    const m = new MoodModel();
    m.sample(0, [sadFace(), sadFace(), happyFace()]);
    expect(m.room()).toBe('sad');
  });

  it('keeps 60 s of history, wraps around when full and returns it oldest first', () => {
    const m = new MoodModel();
    for (let i = 0; i < 300; i++) m.sample(i * 250, [happyFace()]);
    const r = m.read(299 * 250, 1e9);
    expect(r.t).toHaveLength(240);
    expect(r.t).toEqual([...r.t].sort((a, b) => a - b));
    expect(m.read(299 * 250, 10_000).t.length).toBeLessThanOrEqual(41);
  });

  it('paused stops recording but not the live counts; reset clears', () => {
    const m = new MoodModel();
    m.sample(0, [happyFace()]);
    m.paused = true;
    expect(m.sample(1000, [happyFace(), sadFace()])).toBe(false);
    expect(m.faceCount).toBe(2);
    expect(m.read(1000).t).toEqual([0]);
    m.reset();
    expect(m.read(1000).t).toEqual([]);
    expect(m.room()).toBeNull();
  });
});
