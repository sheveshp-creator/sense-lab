/**
 * Compact per-face layout shared by worker and UI. One face = one flat Float32Array slice:
 *   [0 .. 1434)     478 landmarks x (x, y, z), x/y normalised 0..1 in image space
 *   [1434 .. 1486)  52 blendshape scores, indexed by MediaPipe category index
 *   [1486 .. 1489)  head pose: yaw, pitch, roll in degrees
 * A frame result is `count` faces back to back, sent as one transferable buffer.
 */
export const LANDMARK_COUNT = 478;
export const BLENDSHAPE_COUNT = 52;
export const LANDMARK_FLOATS = LANDMARK_COUNT * 3;
export const BLENDSHAPE_OFFSET = LANDMARK_FLOATS;
export const POSE_OFFSET = BLENDSHAPE_OFFSET + BLENDSHAPE_COUNT;
export const FACE_STRIDE = POSE_OFFSET + 3;
export const MAX_FACES = 4;
