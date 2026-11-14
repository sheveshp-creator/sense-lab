import { describe, expect, it } from 'vitest';
import { RegistrationSession, STEPS } from '../src/features/face/registration';
import type { Sample } from '../src/features/face/registration';

const emb = (i = 0) => Float32Array.from([Math.cos(i), Math.sin(i), 0]);
/** A good frame: sharp, well lit, one face, with the given head pose. */
const good = (pose: { yaw: number; pitch: number }, i = 0): Sample => ({
  faces: 1,
  pose,
  embedding: emb(i),
  sharpness: 150,
  brightness: 120,
});
const POSES = {
  front: { yaw: 0, pitch: 0 },
  left: { yaw: -0.4, pitch: 0 },
  right: { yaw: 0.4, pitch: 0 },
  up: { yaw: 0, pitch: -0.25 },
  down: { yaw: 0, pitch: 0.25 },
};
const poseFor = (id: string) => POSES[id as keyof typeof POSES];

describe('RegistrationSession', () => {
  it('walks front, left, right, up, down and collects 2 good frames each (10 in total)', () => {
    const s = new RegistrationSession();
    let t = 0;
    const order: string[] = [];
    while (!s.done && t < 100_000) {
      const p = s.progress();
      if (p.stepId && order.at(-1) !== p.stepId) order.push(p.stepId);
      s.update(good(poseFor(p.stepId!), t), (t += 300));
    }
    expect(order).toEqual(['front', 'left', 'right', 'up', 'down']);
    expect(s.embeddings()).toHaveLength(10);
    expect(s.progress()).toMatchObject({ done: true, collected: 10, total: 10 });
  });

  it('stays on a step until the head pose matches', () => {
    const s = new RegistrationSession();
    s.update(good(POSES.front), 0);
    s.update(good(POSES.front), 300); // front done
    expect(s.progress().stepId).toBe('left');
    // Facing front again does not count for "left" and tells the user what to do.
    const p = s.update(good(POSES.front), 600);
    expect(p.stepId).toBe('left');
    expect(p.collected).toBe(2);
    expect(p.hint).toBe(STEPS[1]!.prompt);
    expect(p.rejected.pose).toBe(1);
    // Turning the wrong way (right) is also rejected.
    expect(s.update(good(POSES.right), 900).collected).toBe(2);
    expect(s.update(good(POSES.left), 1200).collected).toBe(3);
  });

  it('skips blurry frames with a hint and counts them', () => {
    const s = new RegistrationSession();
    const p = s.update({ ...good(POSES.front), sharpness: 10 }, 0);
    expect(p.collected).toBe(0);
    expect(p.hint).toMatch(/blurry/i);
    expect(p.rejected.blurry).toBe(1);
  });

  it('skips dark frames with a hint, and over-bright ones', () => {
    const s = new RegistrationSession();
    expect(s.update({ ...good(POSES.front), brightness: 20 }, 0).hint).toMatch(/dark/i);
    expect(s.update({ ...good(POSES.front), brightness: 250 }, 300).hint).toMatch(/bright/i);
    expect(s.progress().collected).toBe(0);
    expect(s.progress().rejected).toMatchObject({ dark: 1, bright: 1 });
  });

  it('reports dark before blur when a frame is both', () => {
    const s = new RegistrationSession();
    expect(s.update({ ...good(POSES.front), brightness: 20, sharpness: 5 }, 0).hint).toMatch(
      /dark/i,
    );
  });

  it('asks for exactly one face', () => {
    const s = new RegistrationSession();
    expect(s.update({ faces: 0, pose: null }, 0).hint).toMatch(/no face/i);
    expect(s.update({ faces: 2, pose: null }, 100).hint).toMatch(/one face/i);
    expect(s.update({ ...good(POSES.front), faces: 2 }, 200).collected).toBe(0);
  });

  it('ignores near-duplicate frames closer together than minGapMs', () => {
    const s = new RegistrationSession();
    s.update(good(POSES.front, 1), 0);
    expect(s.update(good(POSES.front, 2), 100).collected).toBe(1); // too soon
    expect(s.update(good(POSES.front, 3), 300).collected).toBe(2);
  });

  it('relaxPose accepts any quality frame for every step', () => {
    const s = new RegistrationSession({ relaxPose: true });
    let t = 0;
    while (!s.done && t < 50_000) s.update(good(POSES.front, t), (t += 300));
    expect(s.done).toBe(true);
    expect(s.embeddings()).toHaveLength(10);
  });

  it('framesPerStep sets how many frames are kept (5 to 10 in total)', () => {
    const s = new RegistrationSession({ framesPerStep: 1, relaxPose: true });
    let t = 0;
    while (!s.done) s.update(good(POSES.front, t), (t += 300));
    expect(s.embeddings()).toHaveLength(5);
  });

  it('skipStep moves on without collecting', () => {
    const s = new RegistrationSession();
    s.skipStep();
    expect(s.progress().stepId).toBe('left');
    expect(s.progress().collected).toBe(0);
    for (let i = 0; i < 4; i++) s.skipStep();
    expect(s.done).toBe(true);
  });

  it('frames sent after it is done change nothing', () => {
    const s = new RegistrationSession({ relaxPose: true });
    let t = 0;
    while (!s.done) s.update(good(POSES.front, t), (t += 300));
    s.update(good(POSES.front, 99), t + 300);
    expect(s.embeddings()).toHaveLength(10);
  });

  it('waiting for an embedding just repeats the prompt', () => {
    const s = new RegistrationSession();
    const p = s.update({ faces: 1, pose: POSES.front }, 0);
    expect(p.hint).toBe(STEPS[0]!.prompt);
    expect(p.collected).toBe(0);
  });

  it('a frame with no pose estimate does not count when pose is required', () => {
    const s = new RegistrationSession();
    expect(s.update({ ...good(POSES.front), pose: null }, 0).collected).toBe(0);
  });
});
