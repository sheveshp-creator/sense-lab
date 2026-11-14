import { qualityProblem } from './quality';
import type { QualityLimits } from './quality';
import type { HeadPose } from './pose';

export type StepId = 'front' | 'left' | 'right' | 'up' | 'down';

interface Step {
  id: StepId;
  prompt: string;
  /** Is the head pose right for this step? (yaw: + is toward the screen's right; pitch: + is chin down) */
  ok: (p: HeadPose) => boolean;
}

/** Pose windows: a clear turn, but not so far that the face is nearly in profile. */
export const STEPS: readonly Step[] = [
  {
    id: 'front',
    prompt: 'Look straight at the camera',
    ok: (p) => Math.abs(p.yaw) < 0.15 && Math.abs(p.pitch) < 0.1,
  },
  {
    id: 'left',
    prompt: 'Turn your head a little to the left',
    ok: (p) => p.yaw <= -0.2 && p.yaw >= -0.9,
  },
  {
    id: 'right',
    prompt: 'Turn your head a little to the right',
    ok: (p) => p.yaw >= 0.2 && p.yaw <= 0.9,
  },
  {
    id: 'up',
    prompt: 'Tilt your head up a little',
    ok: (p) => p.pitch <= -0.12 && p.pitch >= -0.5 && Math.abs(p.yaw) < 0.35,
  },
  {
    id: 'down',
    prompt: 'Tilt your head down a little',
    ok: (p) => p.pitch >= 0.12 && p.pitch <= 0.5 && Math.abs(p.yaw) < 0.35,
  },
];

export const DEFAULT_LIMITS: QualityLimits = {
  minBrightness: 55,
  maxBrightness: 215,
  minSharpness: 40,
};

export interface Sample {
  /** Number of faces currently tracked. Registration needs exactly one. */
  faces: number;
  pose: HeadPose | null;
  /** Present on frames where the identity model produced an embedding for the face. */
  embedding?: Float32Array;
  sharpness?: number;
  brightness?: number;
}

export interface SessionOptions {
  /** Good frames to keep per pose step: 2 steps x 5 poses = 10 frames, the top of the 5-10 range. */
  framesPerStep: number;
  /** Ignore the pose requirement (any frontal-ish quality frame counts). For awkward cameras and tests. */
  relaxPose: boolean;
  /** Minimum time between two accepted frames, so they are not near-duplicates. */
  minGapMs: number;
  limits: QualityLimits;
}

export const DEFAULT_SESSION: SessionOptions = {
  framesPerStep: 2,
  relaxPose: false,
  minGapMs: 250,
  limits: DEFAULT_LIMITS,
};

export interface Progress {
  step: number;
  stepCount: number;
  stepId: StepId | null;
  collected: number;
  total: number;
  /** What to tell the user right now. */
  hint: string;
  done: boolean;
  /** Frames rejected so far, by reason (for the UI and tests). */
  rejected: { dark: number; bright: number; blurry: number; pose: number };
}

/**
 * Guided capture as a pure state machine: feed it one Sample per identity result and it decides
 * whether the frame is good (one face, bright enough, sharp enough, right head pose), tells the user
 * what to fix, and moves through front / left / right / up / down.
 */
export class RegistrationSession {
  private readonly opts: SessionOptions;
  private step = 0;
  private inStep = 0;
  private lastAcceptedAt = -Infinity;
  private hint = STEPS[0]!.prompt;
  private readonly kept: Float32Array[] = [];
  private readonly rejected = { dark: 0, bright: 0, blurry: 0, pose: 0 };

  constructor(opts: Partial<SessionOptions> = {}) {
    this.opts = { ...DEFAULT_SESSION, ...opts };
  }

  get done(): boolean {
    return this.step >= STEPS.length;
  }

  /** The captured embeddings (copy). */
  embeddings(): Float32Array[] {
    return this.kept.slice();
  }

  progress(): Progress {
    return {
      step: Math.min(this.step, STEPS.length - 1),
      stepCount: STEPS.length,
      stepId: this.done ? null : STEPS[this.step]!.id,
      collected: this.kept.length,
      total: STEPS.length * this.opts.framesPerStep,
      hint: this.done ? 'All set. Save this person.' : this.hint,
      done: this.done,
      rejected: { ...this.rejected },
    };
  }

  /** Skip the current pose step (for when a pose does not work with the user's camera). */
  skipStep(): void {
    if (this.done) return;
    this.step++;
    this.inStep = 0;
    this.hint = this.done ? '' : STEPS[this.step]!.prompt;
  }

  update(s: Sample, nowMs: number): Progress {
    if (this.done) return this.progress();
    const step = STEPS[this.step]!;
    if (s.faces === 0) {
      this.hint = 'No face found. Move into the frame.';
    } else if (s.faces > 1) {
      this.hint = 'One face at a time, please.';
    } else if (!s.embedding) {
      this.hint = step.prompt; // waiting for the next identity result
    } else {
      const problem = qualityProblem(s.sharpness ?? 0, s.brightness ?? 0, this.opts.limits);
      if (problem === 'dark') {
        this.rejected.dark++;
        this.hint = 'Too dark. Add some light.';
      } else if (problem === 'bright') {
        this.rejected.bright++;
        this.hint = 'Too bright. Avoid direct light on your face.';
      } else if (problem === 'blurry') {
        this.rejected.blurry++;
        this.hint = 'Too blurry. Hold still.';
      } else if (!this.opts.relaxPose && (!s.pose || !step.ok(s.pose))) {
        this.rejected.pose++;
        this.hint = step.prompt;
      } else if (nowMs - this.lastAcceptedAt >= this.opts.minGapMs) {
        this.kept.push(s.embedding);
        this.lastAcceptedAt = nowMs;
        this.inStep++;
        this.hint = step.prompt;
        if (this.inStep >= this.opts.framesPerStep) {
          this.step++;
          this.inStep = 0;
          if (!this.done) this.hint = STEPS[this.step]!.prompt;
        }
      }
    }
    return this.progress();
  }
}
