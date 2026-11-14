/**
 * Compact per-hand layout shared by worker and UI. One hand = one flat Float32Array slice:
 *   [0 .. 63)     21 landmarks x (x, y, z), x/y normalised 0..1 in image space
 *   [63 .. 126)   21 world landmarks x (x, y, z) in metres, origin near the hand centre
 *   [126]         probability that this is the user's RIGHT hand (already corrected for the
 *                 un-mirrored camera frame, see detect.ts)
 *   [127]         handedness score from the model
 * Hands are packed back to back and sent as one transferable buffer.
 */
export const HAND_LANDMARK_COUNT = 21;
export const HAND_LANDMARK_FLOATS = HAND_LANDMARK_COUNT * 3;
export const HAND_WORLD_OFFSET = HAND_LANDMARK_FLOATS;
export const HAND_RIGHT_PROB = HAND_WORLD_OFFSET + HAND_LANDMARK_FLOATS;
export const HAND_SCORE = HAND_RIGHT_PROB + 1;
export const HAND_STRIDE = HAND_SCORE + 1;
export const MAX_HANDS = 2;

/**
 * GestureRecognizer hints, only used to cross-check our own detectors. One entry per hand:
 *   [wristX, wristY, labelIndex into BUILTIN_LABELS, score]
 * The recognizer may list hands in a different order than HandLandmarker, so the UI side
 * matches hints to tracked hands by wrist position.
 */
export const HINT_STRIDE = 4;

export const BUILTIN_LABELS = [
  'None',
  'Closed_Fist',
  'Open_Palm',
  'Pointing_Up',
  'Thumb_Down',
  'Thumb_Up',
  'Victory',
  'ILoveYou',
] as const;

/** Bit mask of models to run for one frame, chosen by the scheduler. */
export const TASK_FACE = 1;
export const TASK_HAND = 2;
export const TASK_GESTURE = 4;
export const TASK_IDENTITY = 8;
