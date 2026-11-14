import { BUILTIN_LABELS } from './handFormat';
import type { GestureId } from './types';

/** Which of our gestures each GestureRecognizer label corresponds to. */
const BUILTIN_TO_OURS: Record<string, readonly GestureId[]> = {
  None: [],
  Closed_Fist: ['fist'],
  Open_Palm: ['openPalm', 'five'],
  Pointing_Up: ['pointingUp', 'one'],
  Thumb_Down: ['thumbsDown'],
  Thumb_Up: ['thumbsUp'],
  Victory: ['peace', 'two'],
  ILoveYou: ['rock'], // thumb + index + pinky; our rock ignores the thumb
};

const KNOWN = new Set(Object.values(BUILTIN_TO_OURS).flat());

export type CrossCheck = 'agree' | 'disagree' | 'unsupported' | 'none';

export const builtinName = (index: number): string => BUILTIN_LABELS[index] ?? 'None';

/**
 * Compares our gesture with the recognizer's label for the same hand.
 * 'unsupported' = we show a gesture the recognizer has no label for (OK, three, four).
 */
export function crossCheck(ours: GestureId | null, builtinIndex: number): CrossCheck {
  if (!ours) return 'none';
  if (!KNOWN.has(ours)) return 'unsupported';
  return BUILTIN_TO_OURS[builtinName(builtinIndex)]?.includes(ours) ? 'agree' : 'disagree';
}
