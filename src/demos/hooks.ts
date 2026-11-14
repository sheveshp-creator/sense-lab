import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { frameStore } from '../core/frameStore';
import { bus } from '../events/bus';
import type { AppEvents } from '../events/bus';

/** Calls `cb` once per animation frame while mounted. `dtMs` is the time since the previous call. */
export function useFrameLoop(cb: (nowMs: number, dtMs: number) => void): void {
  const ref = useRef(cb);
  useEffect(() => {
    ref.current = cb;
  });
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      ref.current(now, Math.min(100, now - last));
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
}

/** Subscribes to one event on the typed event bus while mounted. */
export function useBus<K extends keyof AppEvents>(
  name: K,
  handler: (payload: AppEvents[K]) => void,
): void {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => bus.on(name, (p) => ref.current(p)), [name]);
}

/** Whether the camera pipeline is running (the only per-frame store value that is fine to render from). */
export function useCameraRunning(): boolean {
  return useStore(frameStore, (s) => s.running || s.simulated);
}
