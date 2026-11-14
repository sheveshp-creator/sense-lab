import { describe, expect, it } from 'vitest';
import { friendlyModelError, friendlyRuntimeError } from '../src/core/errors';
import { CAMERA_ERROR_TEXT, toCameraError } from '../src/core/camera/camera';

describe('friendlyModelError', () => {
  it('leads with the cause for a download problem, and says what still works', () => {
    const f = friendlyModelError(
      'hand',
      'Failed to load http://x/models/hand_landmarker.task: 404',
    );
    expect(f.title).toBe('Could not load hand tracking.');
    expect(f.hint).toMatch(/could not be downloaded/);
    expect(f.hint).toMatch(/Face tracking still works/);
  });
  it('recognises a graphics problem', () => {
    expect(friendlyModelError('face', 'WebGL context lost').hint).toMatch(/graphics/);
  });
  it('recognises running out of memory', () => {
    expect(friendlyModelError('identity', 'Out of memory').hint).toMatch(/memory/);
  });
  it('has a generic answer for anything else', () => {
    expect(friendlyModelError('gesture', 'boom').hint).toMatch(/Something went wrong/);
  });
  it('never mentions a feature that is not the one that failed', () => {
    expect(friendlyModelError('identity', 'x').hint).toMatch(/will not get names/);
    expect(friendlyModelError('identity', 'x').hint).not.toMatch(/Hands/);
  });
});

describe('friendlyRuntimeError', () => {
  it('keeps the reason short', () => {
    const m = friendlyRuntimeError('x'.repeat(500));
    expect(m.length).toBeLessThan(260);
    expect(m).toMatch(/Reload the page/);
  });
});

describe('toCameraError', () => {
  const kind = (name: string) => toCameraError(new DOMException('m', name)).kind;
  it('maps the browser errors people actually hit', () => {
    expect(kind('NotAllowedError')).toBe('permission-denied');
    expect(kind('NotFoundError')).toBe('no-camera');
    expect(kind('NotReadableError')).toBe('in-use');
    expect(kind('SomethingElse')).toBe('unknown');
  });
  it('has friendly text for every kind, including a camera lost mid-session', () => {
    expect(CAMERA_ERROR_TEXT.lost).toMatch(/stopped/);
    for (const text of Object.values(CAMERA_ERROR_TEXT)) expect(text.length).toBeGreaterThan(20);
  });
});
