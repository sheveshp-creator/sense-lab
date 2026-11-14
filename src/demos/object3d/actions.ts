import type { ActionSpec } from '../types';

export type ObjectAction = 'zoomIn' | 'zoomOut' | 'rotateLeft' | 'rotateRight' | 'reset';

export const OBJECT_ACTIONS: readonly ActionSpec<ObjectAction>[] = [
  {
    id: 'zoomIn',
    label: 'Zoom in',
    gesture: 'Two open palms moving apart',
    key: '=',
    altKeys: ['+'],
    keyLabel: '+',
    repeat: true,
  },
  {
    id: 'zoomOut',
    label: 'Zoom out',
    gesture: 'Two open palms moving together',
    key: '-',
    altKeys: ['_'],
    keyLabel: '-',
    repeat: true,
  },
  {
    id: 'rotateLeft',
    label: 'Rotate left',
    gesture: 'Turn the line between two open palms counter-clockwise',
    key: '[',
    keyLabel: '[',
    repeat: true,
  },
  {
    id: 'rotateRight',
    label: 'Rotate right',
    gesture: 'Turn the line between two open palms clockwise',
    key: ']',
    keyLabel: ']',
    repeat: true,
  },
  { id: 'reset', label: 'Reset', gesture: 'Clap', key: 'r', keyLabel: 'R' },
];
