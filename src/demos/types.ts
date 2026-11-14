import type { ComponentType } from 'react';

/**
 * One thing a user can do in a demo. It is declared once, with the gesture that triggers it AND the button and
 * keyboard shortcut that do the same thing, so no gesture action can exist without an accessible alternative:
 * the ActionBar renders a button for every spec and registers every key.
 */
export interface ActionSpec<Id extends string = string> {
  id: Id;
  /** Text on the button, e.g. "Next slide". */
  label: string;
  /** KeyboardEvent.key that triggers it, e.g. "ArrowRight", "r", " ". */
  key: string;
  /** How the key is shown to the user, e.g. "→", "R", "Space". */
  keyLabel: string;
  /** Other keys that do the same (e.g. both "+" and "=" zoom in). */
  altKeys?: readonly string[];
  /** The gesture that does the same thing, or null for actions that only have a button and a key. */
  gesture: string | null;
  /** Hold the key to repeat the action (zoom, rotate). */
  repeat?: boolean;
}

/** A playground demo. Add one = a folder under src/demos plus one line in registry.ts. */
export interface DemoModule {
  id: string;
  title: string;
  /** One sentence for the picker. */
  summary: string;
  actions: readonly ActionSpec[];
  /** Lazy-loaded so the app starts fast (the 3D demo carries Three.js). */
  load: () => Promise<{ default: ComponentType }>;
}
