export interface Slide {
  title: string;
  body: string;
}

export const SLIDES: readonly Slide[] = [
  {
    title: 'SenseLab',
    body: 'Face and hand recognition that runs entirely in your browser. No server, no upload.',
  },
  {
    title: 'Faces',
    body: 'Detection, 478 landmarks, stable IDs, expressions, blinks, gaze and recognition of people you register.',
  },
  {
    title: 'Hands',
    body: 'Twenty-one landmarks per hand, finger states, thirteen poses, swipes, waves, pinches and two-hand gestures.',
  },
  {
    title: 'Fast',
    body: 'Models run in a Web Worker. The page never waits for inference, and nothing is allocated per frame.',
  },
  {
    title: 'Private',
    body: 'Only names and numbers are saved, on your device. Never photos or video. One click deletes everything.',
  },
];

/**
 * Slide Remote: swipe left for the next slide, swipe right for the previous one (like turning a page toward you),
 * thumbs up to like the current slide. It does not wrap around: the first and last slide stop you.
 */
export class SlideModel {
  index = 0;
  likes: number[];
  /** +1 after moving forward, -1 after moving back: the direction the slide should animate. */
  direction: 1 | -1 = 1;
  /** Bumped by every like so the heart animation can restart. */
  likeTick = 0;

  constructor(readonly slides: readonly Slide[] = SLIDES) {
    this.likes = slides.map(() => 0);
  }

  get current(): Slide {
    return this.slides[this.index]!;
  }

  get totalLikes(): number {
    return this.likes.reduce((a, b) => a + b, 0);
  }

  next(): boolean {
    if (this.index >= this.slides.length - 1) return false;
    this.index++;
    this.direction = 1;
    return true;
  }

  prev(): boolean {
    if (this.index <= 0) return false;
    this.index--;
    this.direction = -1;
    return true;
  }

  like(): void {
    this.likes[this.index]!++;
    this.likeTick++;
  }
}
