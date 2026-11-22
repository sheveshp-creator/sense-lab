import { describe, expect, it } from 'vitest';
import {
  blockers,
  chooseThread,
  degradations,
  isWorkerEnvironmentError,
} from '../src/core/capabilities';
import type { Capabilities } from '../src/core/capabilities';

const full: Capabilities = {
  secureContext: true,
  getUserMedia: true,
  webAssembly: true,
  moduleWorker: true,
  createImageBitmap: true,
  videoFrameCallback: true,
  webgl2: true,
  offscreenWebgl2: true,
  webgpu: true,
  serviceWorker: true,
};

describe('chooseThread', () => {
  it('uses a worker when module workers work', () => {
    expect(chooseThread(full, '')).toBe('worker');
  });
  it('falls back to the main thread without module workers (old Safari)', () => {
    expect(chooseThread({ ...full, moduleWorker: false }, '')).toBe('main');
  });
  it('falls back to the main thread without a WebGL 2 OffscreenCanvas (iOS before 17, some Android WebViews)', () => {
    expect(chooseThread({ ...full, offscreenWebgl2: false }, '')).toBe('main');
  });
  it('lets the URL force either path, for testing', () => {
    expect(chooseThread(full, '?thread=main')).toBe('main');
    expect(chooseThread({ ...full, moduleWorker: false }, '?thread=worker')).toBe('worker');
  });
  it('ignores unknown values', () => {
    expect(chooseThread(full, '?thread=banana')).toBe('worker');
  });
});

describe('blockers', () => {
  it('is empty when everything is there', () => {
    expect(blockers(full)).toEqual([]);
  });
  it('explains a missing secure context in plain words, once', () => {
    const b = blockers({ ...full, secureContext: false, getUserMedia: false });
    expect(b).toHaveLength(1);
    expect(b[0]).toMatch(/https/i);
  });
  it('reports no WebAssembly and no createImageBitmap', () => {
    expect(blockers({ ...full, webAssembly: false })).toHaveLength(1);
    expect(blockers({ ...full, createImageBitmap: false })).toHaveLength(1);
  });
  it('does not block on things that only slow the app down', () => {
    expect(blockers({ ...full, webgl2: false, webgpu: false, moduleWorker: false })).toEqual([]);
  });
});

describe('degradations', () => {
  it('says nothing on a fully capable browser', () => {
    expect(degradations(full, 'worker')).toEqual([]);
  });
  it('mentions each missing piece', () => {
    const d = degradations(
      { ...full, webgl2: false, webgpu: false, videoFrameCallback: false },
      'main',
    ).join(' ');
    expect(d).toMatch(/page itself/);
    expect(d).toMatch(/WebGL/);
    expect(d).toMatch(/WebGPU/);
    expect(d).toMatch(/refresh/);
  });
});

describe('isWorkerEnvironmentError', () => {
  it('recognises the iPhone and iPad failures (a worker with no document or canvas)', () => {
    for (const m of [
      "Can't find variable: document",
      'document is not defined',
      'OffscreenCanvas is not defined',
      'Canvas is not supported in this environment.',
      'WebGL context could not be created',
    ])
      expect(isWorkerEnvironmentError(m), m).toBe(true);
  });
  it('does not retry on the main thread for a download problem: the file would be missing there too', () => {
    for (const m of [
      'Failed to load http://x/models/a.task: 404',
      'Failed to fetch',
      'NetworkError',
      'status 500',
    ])
      expect(isWorkerEnvironmentError(m), m).toBe(false);
  });
  it('does not retry for an empty or unrelated message', () => {
    expect(isWorkerEnvironmentError('')).toBe(false);
    expect(isWorkerEnvironmentError('Out of memory')).toBe(false);
  });
});
