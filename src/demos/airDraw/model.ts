import type { LiveHand } from '../../core/frameStore';

/** Categorical palette, dark-surface steps (blue, orange, aqua, yellow, magenta). */
export const PALETTE = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'] as const;

export interface Stroke {
  color: string;
  /** Points in 0..1 across the drawing area. */
  points: [number, number][];
}

const MAX_STROKES = 400;
const MAX_POINTS = 3000;
/** Skip points closer than this to the last one (keeps strokes light). */
const MIN_STEP = 0.002;
/** How far from the palm centre strokes are erased, as a share of the drawing area. */
export const ERASER_RADIUS = 0.1;

/**
 * Air Draw: pinch to draw, an open palm erases what it passes over, a peace sign changes the colour.
 * Pure state: the component feeds it live hands each frame (frame()) and calls the same methods from its
 * buttons, keys and mouse, so every gesture action has an alternative.
 */
export class AirDrawModel {
  strokes: Stroke[] = [];
  colorIndex = 0;
  /** Where the pen is (hand pinch point, mouse or keyboard cursor), for drawing the cursor. */
  cursor = { x: 0.5, y: 0.5, visible: false };
  /** The palm eraser, when an open palm is in view. */
  eraser = { x: 0, y: 0, visible: false };
  /** Bumped on every change so a renderer knows to redraw. */
  version = 0;
  private readonly active = new Map<string, Stroke>();

  get color(): string {
    return PALETTE[this.colorIndex % PALETTE.length]!;
  }

  nextColour(): string {
    this.colorIndex = (this.colorIndex + 1) % PALETTE.length;
    this.version++;
    return this.color;
  }

  /** Start a stroke from an input source ('hand', 'mouse', 'keyboard'). */
  begin(source: string, x: number, y: number): void {
    this.end(source);
    const s: Stroke = { color: this.color, points: [[x, y]] };
    this.strokes.push(s);
    if (this.strokes.length > MAX_STROKES) this.strokes.shift();
    this.active.set(source, s);
    this.version++;
  }

  move(source: string, x: number, y: number): void {
    const s = this.active.get(source);
    if (!s) return;
    const last = s.points[s.points.length - 1]!;
    if (Math.hypot(x - last[0], y - last[1]) < MIN_STEP) return;
    s.points.push([x, y]);
    if (s.points.length > MAX_POINTS) s.points.shift();
    this.version++;
  }

  end(source: string): void {
    this.active.delete(source);
  }

  isDrawing(source: string): boolean {
    return this.active.has(source);
  }

  /** Removes every stroke that has a point within `radius` of (x, y). Returns how many were removed. */
  eraseAt(x: number, y: number, radius = ERASER_RADIUS): number {
    const before = this.strokes.length;
    this.strokes = this.strokes.filter((s) => {
      const hit = s.points.some((p) => Math.hypot(p[0] - x, p[1] - y) <= radius);
      if (hit) for (const [src, a] of this.active) if (a === s) this.active.delete(src);
      return !hit;
    });
    const removed = before - this.strokes.length;
    if (removed) this.version++;
    return removed;
  }

  clear(): void {
    this.strokes = [];
    this.active.clear();
    this.version++;
  }

  /** Removes the most recent stroke. */
  undo(): void {
    const s = this.strokes.pop();
    if (s) for (const [src, a] of this.active) if (a === s) this.active.delete(src);
    this.version++;
  }

  /** Per-frame input from the live hands. `aspect` turns x (frame heights) into 0..1 across the screen. */
  frame(hands: readonly LiveHand[], aspect: number): void {
    const pinching = hands.find((h) => h.pinch);
    if (pinching?.pinch) {
      const x = pinching.pinch.x / aspect;
      const y = pinching.pinch.y;
      this.cursor.x = x;
      this.cursor.y = y;
      this.cursor.visible = true;
      if (!this.isDrawing('hand')) this.begin('hand', x, y);
      else this.move('hand', x, y);
    } else {
      this.end('hand');
      if (!this.isDrawing('mouse') && !this.isDrawing('keyboard')) this.cursor.visible = false;
    }

    const palm = hands.find((h) => h.gesture === 'openPalm' || h.gesture === 'five');
    if (palm) {
      this.eraser.x = palm.palmX / aspect;
      this.eraser.y = palm.palmY;
      this.eraser.visible = true;
      this.eraseAt(this.eraser.x, this.eraser.y);
    } else this.eraser.visible = false;
  }
}
