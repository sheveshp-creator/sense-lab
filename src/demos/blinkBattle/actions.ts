import type { ActionSpec } from '../types';

export type BattleAction = 'start' | 'blink1' | 'blink2' | 'again';

export const BATTLE_ACTIONS: readonly ActionSpec<BattleAction>[] = [
  { id: 'start', label: 'Start round', gesture: null, key: ' ', keyLabel: 'Space' },
  {
    id: 'blink1',
    label: 'Player 1 blinks',
    gesture: 'Player 1 blinks (the face on the left)',
    key: '1',
    keyLabel: '1',
  },
  {
    id: 'blink2',
    label: 'Player 2 blinks',
    gesture: 'Player 2 blinks (the face on the right)',
    key: '2',
    keyLabel: '2',
  },
  { id: 'again', label: 'New round', gesture: null, key: 'n', keyLabel: 'N' },
];
