import type { ActionSpec } from '../types';

export type SlideAction = 'next' | 'prev' | 'like';

export const SLIDE_ACTIONS: readonly ActionSpec<SlideAction>[] = [
  { id: 'prev', label: 'Previous slide', gesture: 'Swipe right', key: 'ArrowLeft', keyLabel: '←' },
  { id: 'next', label: 'Next slide', gesture: 'Swipe left', key: 'ArrowRight', keyLabel: '→' },
  { id: 'like', label: 'Like', gesture: 'Thumbs up', key: 'l', keyLabel: 'L' },
];
