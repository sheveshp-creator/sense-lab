import { describe, expect, it } from 'vitest';
import { IdentityVoter } from '../src/features/face/voting';
import type { Vote } from '../src/features/face/voting';

const A = (score = 0.8): Vote => ({ bestId: 'a', score });
const B = (score = 0.8): Vote => ({ bestId: 'b', score });
/** A sample whose best match is Alice but too weak to count at the threshold used below. */
const WEAK_A = (): Vote => ({ bestId: 'a', score: 0.3 });
const T = 0.5;

function feed(v: IdentityVoter, id: number, votes: Vote[]) {
  votes.forEach((x) => v.push(id, x));
  return v.verdict(id, T);
}

describe('IdentityVoter (majority of the last 5)', () => {
  it('says "identifying" until it has 2 samples', () => {
    const v = new IdentityVoter(5, 2);
    expect(v.verdict(1, T).state).toBe('identifying');
    v.push(1, A());
    expect(v.verdict(1, T).state).toBe('identifying');
    v.push(1, A());
    expect(v.verdict(1, T)).toMatchObject({ state: 'known', personId: 'a', votes: 2 });
  });

  it('one bad sample does not flip the label (no flicker)', () => {
    const v = new IdentityVoter();
    const seen: (string | null)[] = [];
    for (const x of [A(), A(), WEAK_A(), A(), A(), B(), A()]) {
      v.push(1, x);
      seen.push(v.verdict(1, T).personId);
    }
    expect(seen.slice(1).every((p) => p === 'a')).toBe(true);
  });

  it('follows a real change once the majority switches', () => {
    const v = new IdentityVoter();
    const verdicts: (string | null)[] = [];
    for (const x of [A(), A(), A(), B(), B(), B(), B()]) {
      v.push(1, x);
      verdicts.push(v.verdict(1, T).personId);
    }
    expect(verdicts[2]).toBe('a');
    expect(verdicts.at(-1)).toBe('b');
  });

  it('a stranger stays Unknown when most samples are below the threshold', () => {
    const v = new IdentityVoter();
    const out = feed(v, 1, [WEAK_A(), WEAK_A(), A(), WEAK_A(), WEAK_A()]);
    expect(out.state).toBe('unknown');
    expect(out.personId).toBeNull();
  });

  it('only the last 5 samples count', () => {
    const v = new IdentityVoter(5, 2);
    // Five Alice votes, then five Bob votes: the old Alice votes must have slid out.
    expect(feed(v, 1, [A(), A(), A(), A(), A(), B(), B(), B(), B(), B()]).personId).toBe('b');
  });

  it('on a tie the previous winner stays, and with no previous winner it is Unknown', () => {
    const v = new IdentityVoter(4, 2);
    feed(v, 1, [A(), A(), A()]); // winner: a
    expect(feed(v, 1, [B()]).personId).toBe('a'); // a,a,a,b -> a (3 vs 1)
    v.push(1, B()); // window a,a,b,b: tie, previous winner a stays
    expect(v.verdict(1, T).personId).toBe('a');

    const fresh = new IdentityVoter(4, 2);
    fresh.push(2, A());
    fresh.push(2, B()); // tie 1-1 and nothing decided before
    expect(fresh.verdict(2, T).personId).toBeNull();
  });

  it('applies the threshold when the verdict is read: moving the slider re-judges old samples', () => {
    const v = new IdentityVoter();
    for (let i = 0; i < 5; i++) v.push(1, { bestId: 'a', score: 0.55 });
    expect(v.verdict(1, 0.5).personId).toBe('a');
    expect(v.verdict(1, 0.6).personId).toBeNull();
    expect(v.verdict(1, 0.6).state).toBe('unknown');
    expect(v.verdict(1, 0.5).personId).toBe('a'); // and back again
  });

  it('confidence is the mean score of the votes that agree with the verdict', () => {
    const v = new IdentityVoter();
    const out = feed(v, 1, [A(0.9), A(0.7), B(0.6), A(0.8)]);
    expect(out.personId).toBe('a');
    expect(out.confidence).toBeCloseTo((0.9 + 0.7 + 0.8) / 3, 6);
  });

  it('keeps faces separate and forget() clears one', () => {
    const v = new IdentityVoter();
    feed(v, 1, [A(), A()]);
    feed(v, 2, [B(), B()]);
    expect(v.verdict(1, T).personId).toBe('a');
    expect(v.verdict(2, T).personId).toBe('b');
    v.forget(1);
    expect(v.verdict(1, T).state).toBe('identifying');
    expect(v.verdict(2, T).personId).toBe('b');
    v.clear();
    expect(v.verdict(2, T).state).toBe('identifying');
  });

  it('nobody registered (bestId null) is Unknown, not a crash', () => {
    const v = new IdentityVoter();
    const out = feed(v, 1, [
      { bestId: null, score: 0 },
      { bestId: null, score: 0 },
    ]);
    expect(out.state).toBe('unknown');
  });
});
