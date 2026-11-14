/**
 * Turns the current video frame into an ImageBitmap that can be transferred to the worker.
 *
 * Normal path: createImageBitmap(video), which keeps the frame on the GPU. Some Safari versions reject a
 * video element there, so on the first failure we switch for good to the slower route: draw the video onto a
 * reused canvas, then take the bitmap from that. (?capture=canvas forces it, to test that route anywhere.)
 */
export class FrameGrabber {
  private viaCanvas: boolean;
  private scratch: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  constructor(search: string = location.search) {
    this.viaCanvas = new URLSearchParams(search).get('capture') === 'canvas';
  }

  get usingCanvas(): boolean {
    return this.viaCanvas;
  }

  async grab(video: HTMLVideoElement): Promise<ImageBitmap> {
    if (!this.viaCanvas) {
      try {
        return await createImageBitmap(video);
      } catch {
        this.viaCanvas = true;
      }
    }
    const w = video.videoWidth;
    const h = video.videoHeight;
    // One canvas for the whole session: no allocation per frame.
    if (!this.scratch) {
      this.scratch = document.createElement('canvas');
      this.ctx = this.scratch.getContext('2d');
    }
    if (this.scratch.width !== w || this.scratch.height !== h) {
      this.scratch.width = w;
      this.scratch.height = h;
    }
    this.ctx!.drawImage(video, 0, 0, w, h);
    return createImageBitmap(this.scratch);
  }
}
