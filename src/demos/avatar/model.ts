import { BS } from '../../features/face/blendshapes';
import type { LiveFace } from '../../core/frameStore';

/** What the cartoon face needs, all in the on-screen convention (see LiveFace). */
export interface AvatarParams {
  smile: number; // 0..1
  mouthOpen: number; // 0..1
  /** 0 = eye open, 1 = shut. "Left" and "Right" are the left and right of the SCREEN (the mirrored view). */
  blinkLeft: number;
  blinkRight: number;
  /** -1 = brows pulled down, 0 = neutral, +1 = raised. */
  browRaise: number;
  yaw: number; // degrees, + = turned toward screen right
  pitch: number; // degrees, + = chin down
  roll: number; // degrees, + = clockwise on screen
}

export const NEUTRAL_AVATAR: Readonly<AvatarParams> = {
  smile: 0,
  mouthOpen: 0,
  blinkLeft: 0,
  blinkRight: 0,
  browRaise: 0,
  yaw: 0,
  pitch: 0,
  roll: 0,
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Face -> cartoon. Smile, jaw, blinks and brows come from the blendshape scores; the head turn from the
 * pose. In the mirrored view the user's left eye is on the left of the screen, and the model's "Left" blendshapes
 * are the subject's own left, so they map straight across.
 */
export function avatarFromFace(
  f: Pick<LiveFace, 'blendshapes' | 'yawDeg' | 'pitchDeg' | 'rollDeg'>,
  out: AvatarParams = { ...NEUTRAL_AVATAR },
): AvatarParams {
  const b = f.blendshapes;
  out.smile = clamp((b[BS.mouthSmileLeft]! + b[BS.mouthSmileRight]!) / 2, 0, 1);
  out.mouthOpen = clamp(b[BS.jawOpen]!, 0, 1);
  out.blinkLeft = clamp(b[BS.eyeBlinkLeft]!, 0, 1);
  out.blinkRight = clamp(b[BS.eyeBlinkRight]!, 0, 1);
  const up = (b[BS.browInnerUp]! + (b[BS.browOuterUpLeft]! + b[BS.browOuterUpRight]!) / 2) / 2;
  const down = (b[BS.browDownLeft]! + b[BS.browDownRight]!) / 2;
  out.browRaise = clamp(up - down, -1, 1);
  out.yaw = f.yawDeg;
  out.pitch = f.pitchDeg;
  out.roll = f.rollDeg;
  return out;
}

/** Time constants (ms): blinks must be quick or they are missed; the head can be lazier. */
const TAU: Record<keyof AvatarParams, number> = {
  smile: 90,
  mouthOpen: 60,
  blinkLeft: 35,
  blinkRight: 35,
  browRaise: 90,
  yaw: 110,
  pitch: 110,
  roll: 110,
};

/** Eases the cartoon toward the target so it moves smoothly even when frames arrive unevenly. */
export class AvatarSmoother {
  readonly value: AvatarParams = { ...NEUTRAL_AVATAR };

  update(target: Readonly<AvatarParams>, dtMs: number): AvatarParams {
    for (const k of Object.keys(TAU) as (keyof AvatarParams)[]) {
      const a = 1 - Math.exp(-Math.max(0, dtMs) / TAU[k]);
      this.value[k] += a * (target[k] - this.value[k]);
    }
    return this.value;
  }
}
