import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IdentityService } from '../src/features/face/identityService';
import { ACTIVE_IDENTITY_MODEL } from '../src/features/face/identityModel';
import { l2Normalize } from '../src/features/face/matching';
import { peopleStore } from '../src/storage/peopleStore';
import { IDENTITY_HEADER } from '../src/core/worker/protocol';
import type { FrameResult } from '../src/core/worker/protocol';
import type { FaceTrack } from '../src/core/tracking/faceTracker';

const DIM = 3;
const unit = (...v: number[]) => l2Normalize(Float32Array.from(v));
const track = (id: number, x = 0.5, y = 0.5, visible = true) =>
  ({
    id,
    visible,
    box: { x: x - 0.1, y: y - 0.1, w: 0.2, h: 0.2 },
    landmarks: new Float32Array(1434),
  }) as unknown as FaceTrack;

function ready(svc: IdentityService) {
  svc.status = { state: 'ready', modelId: ACTIVE_IDENTITY_MODEL.id, dim: DIM, provider: 'wasm' };
  return svc;
}

/** A worker result carrying one embedding record per entry, for the target indexes given. */
function result(
  records: { target: number; emb: Float32Array; sharp?: number; bright?: number }[],
): FrameResult {
  const stride = IDENTITY_HEADER + DIM;
  const data = new Float32Array(records.length * stride);
  records.forEach((r, i) => {
    data.set([r.target, r.sharp ?? 150, r.bright ?? 120, 0], i * stride);
    data.set(r.emb, i * stride + IDENTITY_HEADER);
  });
  return { identityCount: records.length, identity: data } as unknown as FrameResult;
}

let svc: IdentityService;
beforeEach(async () => {
  await peopleStore.clear();
  svc = ready(new IdentityService());
  svc.people = [
    { id: 'a', name: 'Alice', mean: unit(1, 0, 0), sampleCount: 5 },
    { id: 'b', name: 'Bob', mean: unit(0, 1, 0), sampleCount: 5 },
  ];
  svc.threshold = 0.5;
});

describe('when identity runs (new faces, then about every 500 ms, never every frame)', () => {
  it('asks for a new face straight away, then in a quick burst of 3, then every 500 ms', () => {
    const t = [track(1)];
    const due: number[] = [];
    for (let now = 0; now <= 1200; now += 10) if (svc.plan(t, now)) due.push(now);
    // 0, 150, 300 (burst of 3), then 800 (500 ms after the third), then 1300 is beyond the loop.
    expect(due).toEqual([0, 150, 300, 800]);
  });

  it('at 30 fps for 5 s it asks about 12 times, not 150', () => {
    const t = [track(1)];
    const due: number[] = [];
    for (let now = 0; now < 5000; now += 33) if (svc.plan(t, now)) due.push(now);
    expect(due.length).toBeGreaterThanOrEqual(10);
    expect(due.length).toBeLessThanOrEqual(14);
    for (let i = 1; i < due.length; i++) expect(due[i]! - due[i - 1]!).toBeGreaterThanOrEqual(150);
  });

  it('hands the worker the centre of each face to embed', () => {
    const out = svc.plan([track(1, 0.3, 0.6)], 0)!;
    expect(out[0]).toBeCloseTo(0.3);
    expect(out[1]).toBeCloseTo(0.6);
  });

  it('does no work at all when nobody is registered, unless a registration is running', () => {
    svc.people = [];
    expect(svc.plan([track(1)], 0)).toBeNull();
    svc.startRegistration();
    expect(svc.plan([track(1)], 1)).not.toBeNull();
    svc.cancelRegistration();
    expect(svc.plan([track(1)], 1000)).toBeNull();
  });

  it('embeds at most 2 faces per frame; the others get the next frame', () => {
    const faces = [track(1, 0.1), track(2, 0.3), track(3, 0.5), track(4, 0.7)];
    expect(svc.plan(faces, 0)!.length / 2).toBe(2);
    expect(svc.plan(faces, 1)!.length / 2).toBe(2); // the two that have not had a turn yet
    expect(svc.plan(faces, 2)).toBeNull(); // everyone was just served
  });

  it('skips faces that are only being kept alive (not visible) and does nothing when the model is not ready', () => {
    expect(svc.plan([track(1, 0.5, 0.5, false)], 0)).toBeNull();
    const off = new IdentityService();
    off.status = { state: 'missing', message: 'no file' };
    expect(off.plan([track(1)], 0)).toBeNull();
  });

  it('unplan() gives the faces their turn back when the frame was not sent', () => {
    expect(svc.plan([track(1)], 0)).not.toBeNull();
    svc.unplan(); // the frame never left, so the face has not really had its turn
    expect(svc.plan([track(1)], 1)).not.toBeNull();
    // Without unplan the burst gap would have applied:
    expect(svc.plan([track(1)], 2)).toBeNull();
  });

  it('forgets a face that disappears, so its ID can be reused cleanly', () => {
    svc.plan([track(1)], 0);
    svc.onFaces([], 100); // face 1 gone
    expect(svc.plan([track(1)], 101)).not.toBeNull(); // treated as new again
  });

  it('registration speeds sampling up to the burst rate for every face', () => {
    const t = [track(1)];
    for (let i = 0; i < 4; i++) svc.plan(t, 1000 + i * 150); // burst used up
    expect(svc.plan(t, 1000 + 4 * 150 + 20)).toBeNull(); // normal 500 ms rule now
    svc.startRegistration();
    expect(svc.plan(t, 1000 + 4 * 150 + 20 + 150)).not.toBeNull();
  });
});

describe('recognising from worker results', () => {
  let now = 0; // one clock across calls: time never goes backwards
  beforeEach(() => {
    now = 0;
  });
  const feedVotes = (embs: Float32Array[], faceId = 1) => {
    for (const e of embs) {
      svc.plan([track(faceId)], (now += 200));
      svc.onResult(result([{ target: 0, emb: e }]), [track(faceId)], 4 / 3, now);
    }
  };

  it('is "identifying" for the first sample, then names the person', () => {
    feedVotes([unit(1, 0.05, 0)]);
    expect(svc.labelFor(1)!.state).toBe('identifying');
    feedVotes([unit(1, 0.1, 0)]);
    const l = svc.labelFor(1)!;
    expect(l).toMatchObject({ state: 'known', name: 'Alice', personId: 'a' });
    expect(l.confidence).toBeGreaterThan(0.9);
  });

  it('shows Unknown for a face that matches nobody', () => {
    feedVotes([unit(0.3, 0.3, 1), unit(0.2, 0.3, 1), unit(0.3, 0.2, 1)]);
    expect(svc.labelFor(1)).toMatchObject({ state: 'unknown', name: null });
  });

  it('a single odd sample does not change the name (majority of 5)', () => {
    feedVotes([unit(1, 0, 0), unit(1, 0.1, 0), unit(0, 1, 0), unit(1, 0, 0.1), unit(1, 0.1, 0)]);
    expect(svc.labelFor(1)!.name).toBe('Alice');
  });

  it('moving the threshold re-judges immediately', () => {
    // About 0.6 similar to Alice and far from Bob: known at 0.5, Unknown at 0.7.
    feedVotes([unit(0.6, 0.2, 0.77), unit(0.61, 0.21, 0.76), unit(0.59, 0.19, 0.78)]);
    svc.threshold = 0.5;
    expect(svc.labelFor(1)).toMatchObject({ state: 'known', name: 'Alice' });
    svc.threshold = 0.7;
    expect(svc.labelFor(1)).toMatchObject({ state: 'unknown', name: null });
    svc.threshold = 0.5;
    expect(svc.labelFor(1)!.state).toBe('known');
  });

  it('blurry or dark crops do not vote (they would only cause flicker)', () => {
    svc.plan([track(1)], 0);
    svc.onResult(result([{ target: 0, emb: unit(0, 1, 0), sharp: 5 }]), [track(1)], 4 / 3, 0);
    svc.plan([track(1)], 200);
    svc.onResult(result([{ target: 0, emb: unit(0, 1, 0), bright: 10 }]), [track(1)], 4 / 3, 200);
    expect(svc.labelFor(1)!.state).toBe('identifying'); // still no votes
    expect(svc.quality.get(1)!.brightness).toBe(10);
  });

  it('keeps two faces separate', () => {
    let now = 0;
    for (let i = 0; i < 3; i++) {
      svc.plan([track(1, 0.3), track(2, 0.7)], (now += 200));
      svc.onResult(
        result([
          { target: 0, emb: unit(1, 0, 0) },
          { target: 1, emb: unit(0, 1, 0) },
        ]),
        [track(1, 0.3), track(2, 0.7)],
        4 / 3,
        now,
      );
    }
    expect(svc.labelFor(1)!.name).toBe('Alice');
    expect(svc.labelFor(2)!.name).toBe('Bob');
  });

  it('returns no label when recognition is off or nobody is registered', () => {
    feedVotes([unit(1, 0, 0), unit(1, 0, 0)]);
    svc.people = [];
    expect(svc.labelFor(1)).toBeNull();
    const off = new IdentityService();
    expect(off.labelFor(1)).toBeNull();
  });

  it('ignores a record for a target that is no longer pending', () => {
    svc.onResult(result([{ target: 5, emb: unit(1, 0, 0) }]), [track(1)], 4 / 3, 0);
    expect(svc.labelFor(1)!.state).toBe('identifying');
  });
});

describe('registration through the service', () => {
  it('captures 10 good frames, saves only the name and embeddings, and the new person is recognised', async () => {
    svc.people = [];
    svc.startRegistration({ relaxPose: true });
    expect(svc.registering).toBe(true);
    let now = 0;
    const faces = [track(1)];
    for (let i = 0; i < 40 && !svc.registrationProgress()!.done; i++) {
      svc.onFaces(faces, now);
      svc.plan(faces, (now += 300));
      svc.onResult(result([{ target: 0, emb: unit(0, 0, 1) }]), faces, 4 / 3, now);
    }
    expect(svc.registrationProgress()).toMatchObject({ done: true, collected: 10 });
    const person = await svc.finishRegistration('Carol');
    expect(person.embeddings).toHaveLength(10);
    expect(person.modelId).toBe(ACTIVE_IDENTITY_MODEL.id);
    expect(svc.registering).toBe(false);
    expect((await peopleStore.list()).map((p) => p.name)).toEqual(['Carol']);
    expect(svc.people.map((p) => p.name)).toEqual(['Carol']);
  });

  it('the registration hint reacts to the number of faces', () => {
    svc.startRegistration();
    svc.onFaces([], 0);
    expect(svc.registrationProgress()!.hint).toMatch(/no face/i);
    svc.onFaces([track(1), track(2)], 100);
    expect(svc.registrationProgress()!.hint).toMatch(/one face/i);
  });

  it('cannot save before the capture is complete, and cancel discards it', async () => {
    svc.startRegistration();
    await expect(svc.finishRegistration('X')).rejects.toThrow(/not finished/i);
    svc.cancelRegistration();
    expect(svc.registering).toBe(false);
    expect(await peopleStore.list()).toEqual([]);
  });

  it('only people made with the current model are matched; others are counted but kept', async () => {
    await peopleStore.add('Old', [unit(1, 0, 0)], 'some-older-model');
    await peopleStore.add('New', [unit(0, 1, 0)], ACTIVE_IDENTITY_MODEL.id);
    await svc.loadPeople();
    expect(svc.people.map((p) => p.name)).toEqual(['New']);
    expect(svc.incompatible).toBe(1);
    expect(await peopleStore.list()).toHaveLength(2);
  });
});
