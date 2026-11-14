export type CameraErrorKind =
  'permission-denied' | 'no-camera' | 'in-use' | 'unsupported' | 'lost' | 'unknown';

export class CameraError extends Error {
  constructor(
    readonly kind: CameraErrorKind,
    message: string,
  ) {
    super(message);
  }
}

export const CAMERA_ERROR_TEXT: Record<CameraErrorKind, string> = {
  'permission-denied':
    'Camera permission was denied. Allow camera access in your browser settings and retry.',
  'no-camera': 'No camera was found. Connect a camera and retry.',
  'in-use': 'The camera is in use by another app or tab. Close it and retry.',
  unsupported: 'This browser does not support camera access (needs HTTPS or localhost).',
  lost: 'The camera stopped. It may have been unplugged or taken by another app. Reconnect it and retry.',
  unknown: 'The camera could not be started.',
};

export function toCameraError(err: unknown): CameraError {
  const name = err instanceof DOMException ? err.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return new CameraError('permission-denied', CAMERA_ERROR_TEXT['permission-denied']);
    case 'NotFoundError':
    case 'OverconstrainedError':
      return new CameraError('no-camera', CAMERA_ERROR_TEXT['no-camera']);
    case 'NotReadableError':
    case 'AbortError':
      return new CameraError('in-use', CAMERA_ERROR_TEXT['in-use']);
    default:
      return new CameraError('unknown', CAMERA_ERROR_TEXT.unknown);
  }
}

export async function startCamera(deviceId?: string): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraError('unsupported', CAMERA_ERROR_TEXT.unsupported);
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      },
    });
  } catch (err) {
    throw toCameraError(err);
  }
}

export function stopCamera(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}

/** Device labels are only populated after permission is granted, so call this after startCamera. */
export async function listVideoDevices(): Promise<MediaDeviceInfo[]> {
  const all = await navigator.mediaDevices.enumerateDevices();
  return all.filter((d) => d.kind === 'videoinput');
}
