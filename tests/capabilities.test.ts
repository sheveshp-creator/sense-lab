import { describe, expect, it } from 'vitest';
import { blockers, chooseThread, degradations } from '../src/core/capabilities';
import type { Capabilities } from '../src/core/capabilities';

const full: Capabilities = {
  secureContext: true,
  getUserMedia: true,
  webAssembly: true,
  moduleWorker: true,
  createImageBitmap: true,
  videoFrameCallback: true,
  webgl2: true,
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
