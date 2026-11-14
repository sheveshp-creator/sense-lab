import { describe, expect, it } from 'vitest';
import { FalseTriggerCounter } from '../src/core/falseTriggers';
import { bus } from '../src/events/bus';
import type { GestureEvent } from '../src/features/hand/types';

const ev = (id: GestureEvent['id'], kind: GestureEvent['kind']): GestureEvent => ({
  id,
  kind,
  handId: 1,
  hand: 'Left',
  confidence: 1,
  t: 0,
});

describe('FalseTriggerCounter', () => {
  it('counts start and fire events but not ends, and groups by gesture', () => {
    let now = 1000;
    const c = new FalseTriggerCounter(() => now);
    c.start();
    c.record('swipeLeft', 'fire');
    c.record('fist', 'start');
    c.record('fist', 'end');
    c.record('swipeLeft', 'fire');
    now += 60_000;
    const s = c.snapshot();
    expect(s.count).toBe(3);
    expect(s.byGesture).toEqual({ swipeLeft: 2, fist: 1 });
    expect(s.perMinute).toBeCloseTo(3, 5);
    expect(s.elapsedSec).toBe(60);
  });

  it('shows no rate in the first seconds (one event would read as dozens per minute)', () => {
    let now = 0;
    const c = new FalseTriggerCounter(() => now);
    c.start();
    c.record('wave', 'fire');
    now += 2000;
    expect(c.snapshot().perMinute).toBe(0);
    now += 4000;
    expect(c.snapshot().perMinute).toBeCloseTo(10, 5); // 1 event in 6 s
  });

  it('ignores events when not running and freezes the time when stopped', () => {
    let now = 0;
    const c = new FalseTriggerCounter(() => now);
    c.record('wave', 'fire');
    expect(c.snapshot().count).toBe(0);
    c.start();
    now += 10_000;
    c.record('wave', 'fire');
    c.stop();
    now += 50_000;
    c.record('wave', 'fire');
    const s = c.snapshot();
    expect(s.count).toBe(1);
    expect(s.elapsedSec).toBe(10);
    expect(s.running).toBe(false);
  });

  it('start() resets a previous run', () => {
    const c = new FalseTriggerCounter(() => 0);
    c.start();
    c.record('wave', 'fire');
    c.start();
    expect(c.snapshot().count).toBe(0);
  });

  it('listens to the real event bus while running and stops listening after stop()', () => {
    const c = new FalseTriggerCounter(() => 0);
    c.start();
    bus.emit('gesture:clap', ev('clap', 'fire'));
    bus.emit('gesture:zoom', ev('zoom', 'start'));
    bus.emit('gesture:zoom', ev('zoom', 'end'));
    expect(c.snapshot().count).toBe(2);
    c.stop();
    bus.emit('gesture:clap', ev('clap', 'fire'));
    expect(c.snapshot().count).toBe(2);
  });
});

describe('event bus', () => {
  it('delivers typed payloads to specific and wildcard subscribers, and unsubscribes', () => {
    const got: string[] = [];
    const off1 = bus.on('gesture:wave', (e) => got.push(`on:${e.id}`));
    const off2 = bus.onAny((name) => got.push(`any:${String(name)}`));
    bus.emit('gesture:wave', ev('wave', 'fire'));
    bus.emit('gesture:clap', ev('clap', 'fire'));
    off1();
    off2();
    bus.emit('gesture:wave', ev('wave', 'fire'));
    expect(got).toEqual(['on:wave', 'any:gesture:wave', 'any:gesture:clap']);
  });
});
