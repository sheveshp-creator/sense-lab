/**
 * Index groups into the 478-point MediaPipe face mesh. Rings are closed loops, lines are open.
 * "Left"/"right" are the subject's own left/right, as MediaPipe names them.
 */
export const LEFT_EYE_RING = [
  263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390, 249,
];
export const RIGHT_EYE_RING = [
  33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7,
];

export const LEFT_IRIS_CENTER = 473;
export const RIGHT_IRIS_CENTER = 468;
export const LEFT_IRIS_RING = [474, 475, 476, 477];
export const RIGHT_IRIS_RING = [469, 470, 471, 472];

export const LEFT_BROW_LINES = [
  [300, 293, 334, 296, 336],
  [276, 283, 282, 295, 285],
];
export const RIGHT_BROW_LINES = [
  [70, 63, 105, 66, 107],
  [46, 53, 52, 65, 55],
];

export const NOSE_LINES = [
  [168, 6, 197, 195, 5, 4],
  [129, 98, 97, 2, 326, 327, 358],
];

export const LIPS_OUTER_RING = [
  61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185,
];
export const LIPS_INNER_RING = [
  78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191,
];

/** Ear to ear along the chin (open line, not the full face oval). */
export const JAWLINE = [
  234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288, 361, 323,
  454,
];

export const LANDMARK_GROUPS = {
  leftEye: LEFT_EYE_RING,
  rightEye: RIGHT_EYE_RING,
  leftBrow: LEFT_BROW_LINES.flat(),
  rightBrow: RIGHT_BROW_LINES.flat(),
  nose: NOSE_LINES.flat(),
  lips: [...LIPS_OUTER_RING, ...LIPS_INNER_RING],
  jaw: JAWLINE,
  irises: [LEFT_IRIS_CENTER, RIGHT_IRIS_CENTER, ...LEFT_IRIS_RING, ...RIGHT_IRIS_RING],
} as const;
