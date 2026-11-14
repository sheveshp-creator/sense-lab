import { useCallback, useEffect, useRef, useState } from 'react';
import { CameraError, listVideoDevices, startCamera, stopCamera } from './camera';
import type { CameraErrorKind } from './camera';

export type CameraStatus = 'idle' | 'starting' | 'live' | 'error';

export function useCamera() {
  const [status, setStatus] = useState<CameraStatus>('idle');
  const [errorKind, setErrorKind] = useState<CameraErrorKind | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | undefined>();
  const streamRef = useRef<MediaStream | null>(null);
  // Guards against a slow getUserMedia resolving after unmount or a newer request.
  const requestId = useRef(0);

  const start = useCallback(async (id?: string) => {
    const mine = ++requestId.current;
    stopCamera(streamRef.current);
    streamRef.current = null;
    setStream(null);
    setStatus('starting');
    setErrorKind(null);
    try {
      const s = await startCamera(id);
      if (mine !== requestId.current) {
        stopCamera(s);
        return;
      }
      streamRef.current = s;
      // A camera that goes away mid-session ends its track. Say so (with Retry) instead of freezing silently.
      for (const track of s.getVideoTracks()) {
        track.addEventListener('ended', () => {
          if (streamRef.current !== s) return; // already replaced or stopped on purpose
          stopCamera(s);
          streamRef.current = null;
          setStream(null);
          setErrorKind('lost');
          setStatus('error');
        });
      }
      setStream(s);
      setDeviceId(s.getVideoTracks()[0]?.getSettings().deviceId ?? id);
      setStatus('live');
      setDevices(await listVideoDevices());
    } catch (err) {
      if (mine !== requestId.current) return;
      setErrorKind(err instanceof CameraError ? err.kind : 'unknown');
      setStatus('error');
    }
  }, []);

  const stop = useCallback(() => {
    requestId.current++;
    stopCamera(streamRef.current);
    streamRef.current = null;
    setStream(null);
    setStatus('idle');
  }, []);

  // Release the camera when the component using it goes away.
  useEffect(() => stop, [stop]);

  return { status, errorKind, stream, devices, deviceId, start, stop };
}
