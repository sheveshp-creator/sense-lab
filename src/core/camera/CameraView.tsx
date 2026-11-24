import { useEffect, useRef, useState } from 'react';
import { CAMERA_ERROR_TEXT } from './camera';
import type { CameraErrorKind } from './camera';
import type { CameraStatus } from './useCamera';

interface Props {
  stream: MediaStream | null;
  status: CameraStatus;
  errorKind: CameraErrorKind | null;
  devices: MediaDeviceInfo[];
  deviceId?: string;
  onSelectDevice: (id: string) => void;
  onRetry: () => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

export function CameraView({
  stream,
  status,
  errorKind,
  devices,
  deviceId,
  onSelectDevice,
  onRetry,
  videoRef,
  canvasRef,
}: Props) {
  const localRef = useRef<HTMLVideoElement | null>(null);
  // The view box must match the video's real aspect ratio. Phones (e.g. ultra-wide front cameras)
  // often do not deliver 4:3, and cropping the video while the overlay stretches would misalign them.
  const [aspect, setAspect] = useState('4 / 3');

  useEffect(() => {
    const v = localRef.current;
    if (!v) return;
    const sync = () => {
      if (v.videoWidth > 0) setAspect(`${v.videoWidth} / ${v.videoHeight}`);
    };
    v.addEventListener('loadedmetadata', sync);
    v.addEventListener('resize', sync);
    v.srcObject = stream;
    if (stream) void v.play().catch(() => {});
    return () => {
      v.removeEventListener('loadedmetadata', sync);
      v.removeEventListener('resize', sync);
    };
  }, [stream]);

  return (
    <div className="space-y-3">
      <div
        className="relative w-full max-w-[640px] overflow-hidden rounded-sm bg-black"
        style={{ aspectRatio: aspect }}
      >
        <video
          ref={(el) => {
            localRef.current = el;
            videoRef.current = el;
          }}
          className="absolute inset-0 h-full w-full -scale-x-100 object-fill"
          playsInline
          muted
        />
        {/* Overlay matches the capture resolution; mirrored like the video. */}
        <canvas
          ref={canvasRef}
          width={640}
          height={480}
          className="absolute inset-0 h-full w-full -scale-x-100"
        />
        {status === 'starting' && (
          <p className="absolute inset-0 grid place-items-center text-neutral-300">
            Starting camera…
          </p>
        )}
        {status === 'error' && errorKind && (
          <div className="absolute inset-0 grid place-content-center gap-3 p-6 text-center">
            <p role="alert" className="text-red-300">
              {CAMERA_ERROR_TEXT[errorKind]}
            </p>
            <button className="btn" onClick={onRetry}>
              Retry
            </button>
          </div>
        )}
      </div>
      {devices.length > 1 && (
        <label className="flex items-center gap-2 text-sm text-neutral-300">
          Camera
          <select
            className="btn !px-2 !py-1"
            value={deviceId ?? ''}
            onChange={(e) => onSelectDevice(e.target.value)}
          >
            {devices.map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Camera ${i + 1}`}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
