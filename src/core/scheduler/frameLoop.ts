export type FrameCallback = (now: number, frameIndex: number) => void;

/**
 * Calls onFrame once per new video frame. Uses requestVideoFrameCallback so we never process
 * the same camera frame twice; falls back to requestAnimationFrame where it is missing.
 * Skips work while the tab is hidden (rule 10). Returns a stop function.
 */
export function startFrameLoop(
  video: HTMLVideoElement,
  onFrame: FrameCallback,
  /** Called when the tab becomes visible again after being hidden, before the next frame. */
  onResume?: () => void,
): () => void {
  let stopped = false;
  let handle = 0;
  let frameIndex = 0;
  const hasRvfc = 'requestVideoFrameCallback' in video;

  const tick = () => {
    if (stopped) return;
    if (!document.hidden && video.readyState >= 2) onFrame(performance.now(), frameIndex++);
    schedule();
  };
  const schedule = () => {
    handle = hasRvfc ? video.requestVideoFrameCallback(tick) : requestAnimationFrame(tick);
  };

  const onVisibility = () => {
    if (!document.hidden) onResume?.();
  };
  document.addEventListener('visibilitychange', onVisibility);

  schedule();
  return () => {
    stopped = true;
    document.removeEventListener('visibilitychange', onVisibility);
    if (hasRvfc) video.cancelVideoFrameCallback(handle);
    else cancelAnimationFrame(handle);
  };
}
