/**
 * Where hands have been lately: a coarse grid that gains heat at each palm position and cools down
 * over time, drawn as a translucent colour wash. Coordinates are normalised camera-image space
 * (the same space the canvas is drawn in). Typed arrays only; nothing allocates per frame.
 */
export class Heatmap {
  private readonly heat: Float32Array;
  private readonly image: ImageData;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private lastDecayAt = -1;

  constructor(
    readonly cols = 64,
    readonly rows = 48,
  ) {
    this.heat = new Float32Array(cols * rows);
    this.image = new ImageData(cols, rows);
    this.canvas = document.createElement('canvas');
    this.canvas.width = cols;
    this.canvas.height = rows;
    this.ctx = this.canvas.getContext('2d');
  }

  /** Add heat around (x, y), both 0..1. Soft round blob of ~2 cells. */
  add(x: number, y: number, amount = 1): void {
    const cx = x * this.cols;
    const cy = y * this.rows;
    for (
      let j = Math.max(0, Math.floor(cy - 2));
      j <= Math.min(this.rows - 1, Math.ceil(cy + 2));
      j++
    ) {
      for (
        let i = Math.max(0, Math.floor(cx - 2));
        i <= Math.min(this.cols - 1, Math.ceil(cx + 2));
        i++
      ) {
        const d2 = (i + 0.5 - cx) ** 2 + (j + 0.5 - cy) ** 2;
        if (d2 < 6) this.heat[j * this.cols + i]! += amount * (1 - d2 / 6);
      }
    }
  }

  /** Cool down: heat halves every `halfLifeMs`. Call with the current time once per frame. */
  decay(nowMs: number, halfLifeMs = 3000): void {
    if (this.lastDecayAt >= 0) {
      const k = Math.pow(0.5, (nowMs - this.lastDecayAt) / halfLifeMs);
      for (let i = 0; i < this.heat.length; i++) this.heat[i]! *= k;
    }
    this.lastDecayAt = nowMs;
  }

  clear(): void {
    this.heat.fill(0);
  }

  get max(): number {
    let m = 0;
    for (let i = 0; i < this.heat.length; i++) if (this.heat[i]! > m) m = this.heat[i]!;
    return m;
  }

  /** Paint onto the overlay canvas, scaled up with smoothing. */
  draw(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (!this.ctx) return;
    const px = this.image.data;
    for (let i = 0; i < this.heat.length; i++) {
      // 0 -> transparent, then blue -> yellow -> red as heat grows. Saturates at a heat of 6.
      const v = Math.min(1, this.heat[i]! / 6);
      const o = i * 4;
      px[o] = 255 * Math.min(1, v * 2);
      px[o + 1] = 255 * Math.max(0, 1 - Math.abs(v - 0.5) * 2) + 40 * v;
      px[o + 2] = 255 * Math.max(0, 1 - v * 2);
      px[o + 3] = 170 * Math.sqrt(v);
    }
    this.ctx.putImageData(this.image, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.canvas, 0, 0, w, h);
  }
}
