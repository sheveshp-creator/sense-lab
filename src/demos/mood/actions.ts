import type { ActionSpec } from '../types';

export type MoodAction = 'pause' | 'reset';

/** The Mood Meter only watches; these two are its only actions, and they have no gesture. */
export const MOOD_ACTIONS: readonly ActionSpec<MoodAction>[] = [
  { id: 'pause', label: 'Pause / resume', gesture: null, key: 'p', keyLabel: 'P' },
  { id: 'reset', label: 'Clear history', gesture: null, key: 'x', keyLabel: 'X' },
];
