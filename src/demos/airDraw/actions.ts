import type { ActionSpec } from '../types';

export type AirDrawAction = 'pen' | 'erase' | 'colour' | 'undo';

export const AIR_DRAW_ACTIONS: readonly ActionSpec<AirDrawAction>[] = [
  {
    id: 'pen',
    label: 'Pen down / up',
    gesture: 'Pinch thumb and index finger',
    key: ' ',
    keyLabel: 'Space',
  },
  {
    id: 'erase',
    label: 'Erase all',
    gesture: 'Open palm (erases what it touches)',
    key: 'e',
    keyLabel: 'E',
  },
  { id: 'colour', label: 'Change colour', gesture: 'Peace sign', key: 'c', keyLabel: 'C' },
  { id: 'undo', label: 'Undo stroke', gesture: null, key: 'u', keyLabel: 'U' },
];
