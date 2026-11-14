import type { DemoModule } from './types';
import { AIR_DRAW_ACTIONS } from './airDraw/actions';
import { AVATAR_ACTIONS } from './avatar/actions';
import { BATTLE_ACTIONS } from './blinkBattle/actions';
import { MOOD_ACTIONS } from './mood/actions';
import { OBJECT_ACTIONS } from './object3d/actions';
import { SLIDE_ACTIONS } from './slides/actions';

/**
 * The playground demos. Adding one = a folder under src/demos (its model, an actions.ts and a Demo.tsx) and one
 * entry here. A demo may read only the event bus (events/bus.ts) and the live frame store (core/frameStore.ts):
 * tests/demoRules.test.ts fails if one imports a model, the worker or the pipeline.
 */
export const DEMOS: readonly DemoModule[] = [
  {
    id: 'air-draw',
    title: 'Air Draw',
    summary: 'Pinch to draw, open palm to erase, peace sign to change colour.',
    actions: AIR_DRAW_ACTIONS,
    load: () => import('./airDraw/Demo'),
  },
  {
    id: 'slide-remote',
    title: 'Slide Remote',
    summary: 'Swipe to change slides, thumbs up to like.',
    actions: SLIDE_ACTIONS,
    load: () => import('./slides/Demo'),
  },
  {
    id: 'object-3d',
    title: '3D Object',
    summary: 'Two open palms zoom and rotate it, a clap resets it.',
    actions: OBJECT_ACTIONS,
    load: () => import('./object3d/Demo'),
  },
  {
    id: 'mirror-avatar',
    title: 'Mirror Avatar',
    summary: 'A cartoon face that copies your smile, blinks, brows and head turn.',
    actions: AVATAR_ACTIONS,
    load: () => import('./avatar/Demo'),
  },
  {
    id: 'blink-battle',
    title: 'Blink Battle',
    summary: 'Two faces: the first to blink loses.',
    actions: BATTLE_ACTIONS,
    load: () => import('./blinkBattle/Demo'),
  },
  {
    id: 'mood-meter',
    title: 'Mood Meter',
    summary: 'A live chart of the expressions of everyone in view.',
    actions: MOOD_ACTIONS,
    load: () => import('./mood/Demo'),
  },
];
