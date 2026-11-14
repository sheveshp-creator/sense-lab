import { closed, createStaticGesture, extended, INDEX, MIDDLE, PINKY, RING } from './common';

// Index and pinky straight, middle and ring curled ("horns"). Thumb is free.
export const rock = () =>
  createStaticGesture({
    id: 'rock',
    confidence: (f) =>
      Math.min(extended(f, INDEX), extended(f, PINKY), closed(f, MIDDLE), closed(f, RING)),
  });
