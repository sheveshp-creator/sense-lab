import { peopleStore } from '../../storage/peopleStore';
import type { Person } from '../../storage/peopleStore';
import type { FaceTrack } from '../../core/tracking/faceTracker';
import { IDENTITY_HEADER } from '../../core/worker/protocol';
import type { FrameResult, IdentityStatus } from '../../core/worker/protocol';
import { ACTIVE_IDENTITY_MODEL } from './identityModel';
import { matchPerson } from './matching';
import { headPose } from './pose';
import { qualityProblem } from './quality';
import { DEFAULT_LIMITS, RegistrationSession } from './registration';
import type { Progress, SessionOptions } from './registration';
import { IdentityVoter } from './voting';
import type { Candidate } from './matching';

/**
 * Default match threshold (cosine similarity). Chosen from the LFW test in scripts/eval-identity.mjs,
 * see the README for the numbers; the slider in Face Lab overrides it.
 */
export const DEFAULT_THRESHOLD = 0.5;
const THRESHOLD_KEY = 'senselab.threshold';

/** A new face gets this many quick samples, then one every REFRESH_MS: identity never runs per frame. */
const BURST_SAMPLES = 3;
const BURST_MS = 150;
const REFRESH_MS = 500;
/** At most this many faces are embedded in one frame, to keep the frame under budget. */
const MAX_PER_FRAME = 2;

export type FaceLabelState = 'identifying' | 'known' | 'unknown';

export interface FaceLabel {
  state: FaceLabelState;
  name: string | null;
  personId: string | null;
  /** Cosine similarity, 0..1. */
  confidence: number;
}

interface TrackSched {
  lastReqAt: number;
  requests: number;
}

const readThreshold = (): number => {
  try {
    const v = Number(localStorage.getItem(THRESHOLD_KEY));
    return Number.isFinite(v) && v >= 0.1 && v <= 0.95 ? v : DEFAULT_THRESHOLD;
  } catch {
    return DEFAULT_THRESHOLD;
  }
};

/**
 * Main-thread side of face recognition: decides which tracked faces need an embedding (new faces and
 * every ~500 ms), matches the embeddings that come back against the registered people, smooths the
 * result with a 5-vote majority per face, and drives the registration session.
 * The heavy part (alignment and the ONNX model) runs in the worker.
 */
export class IdentityService {
  status: IdentityStatus | { state: 'loading' } = { state: 'loading' };
  threshold = readThreshold();
  /** People usable with the current model, ready for matching. */
  people: (Candidate & { sampleCount: number })[] = [];
  /** People saved with a different model: kept in storage but not matched. */
  incompatible = 0;

  private readonly voter = new IdentityVoter(5, 2);
  private readonly sched = new Map<number, TrackSched>();
  private pending: number[] = [];
  private rollback: { id: number; prev: TrackSched }[] = [];
  private session: RegistrationSession | null = null;
  private lastVisible = 0;
  /** Latest quality numbers per track, for the UI. */
  readonly quality = new Map<number, { sharpness: number; brightness: number }>();

  get ready(): boolean {
    return this.status.state === 'ready';
  }

  get registering(): boolean {
    return this.session !== null;
  }

  async loadPeople(): Promise<Person[]> {
    const all = await peopleStore.list();
    const usable = all.filter((p) => p.modelId === ACTIVE_IDENTITY_MODEL.id);
    this.incompatible = all.length - usable.length;
    this.people = usable.map((p) => ({
      id: p.id,
      name: p.name,
      mean: p.meanEmbedding,
      sampleCount: p.embeddings.length,
    }));
    return all;
  }

  setThreshold(v: number): void {
    this.threshold = v;
    try {
      localStorage.setItem(THRESHOLD_KEY, String(v));
    } catch {
      /* private mode: the slider still works for this session */
    }
  }

  /** Forgets saved settings (part of "delete all data"): the threshold goes back to the default. */
  resetSettings(): void {
    this.threshold = DEFAULT_THRESHOLD;
    try {
      for (const k of Object.keys(localStorage))
        if (k.startsWith('senselab.')) localStorage.removeItem(k);
    } catch {
      /* storage blocked: nothing was saved */
    }
  }

  /** What to draw next to a face. Null when recognition is off or nobody is registered yet. */
  labelFor(trackId: number): FaceLabel | null {
    if (!this.ready || this.people.length === 0) return null;
    const v = this.voter.verdict(trackId, this.threshold);
    const person = v.personId ? this.people.find((p) => p.id === v.personId) : undefined;
    return {
      state: v.state,
      name: person?.name ?? null,
      personId: v.personId,
      confidence: v.confidence,
    };
  }

  /**
   * Picks the faces to embed in the frame about to be sent: new faces (a short burst) and any face not
   * embedded for ~500 ms. Returns the centres to pass to the worker, or null if none is due.
   * Call right before sending; if the frame is not sent after all, call unplan().
   */
  plan(tracks: readonly FaceTrack[], nowMs: number): Float32Array | null {
    this.pending = [];
    this.rollback = [];
    // Nobody to compare against and nobody being registered: the embedding would be wasted work.
    if (!this.ready || (this.people.length === 0 && !this.session)) return null;
    const due: { t: FaceTrack; s: TrackSched }[] = [];
    for (const t of tracks) {
      if (!t.visible) continue;
      let s = this.sched.get(t.id);
      if (!s) this.sched.set(t.id, (s = { lastReqAt: -Infinity, requests: 0 }));
      // While registering, sample quickly so the guided capture feels responsive.
      const interval = this.session || s.requests < BURST_SAMPLES ? BURST_MS : REFRESH_MS;
      if (nowMs - s.lastReqAt >= interval) due.push({ t, s });
    }
    if (due.length === 0) return null;
    due.sort((a, b) => a.s.lastReqAt - b.s.lastReqAt); // longest-waiting first
    const picked = due.slice(0, MAX_PER_FRAME);
    const out = new Float32Array(picked.length * 2);
    picked.forEach(({ t, s }, i) => {
      out[i * 2] = t.box.x + t.box.w / 2;
      out[i * 2 + 1] = t.box.y + t.box.h / 2;
      this.pending.push(t.id);
      this.rollback.push({ id: t.id, prev: { ...s } });
      s.lastReqAt = nowMs;
      s.requests++;
    });
    return out;
  }

  /** The planned frame was not sent: give the faces their turn back. */
  unplan(): void {
    for (const { id, prev } of this.rollback) this.sched.set(id, prev);
    this.pending = [];
    this.rollback = [];
  }

  /** Call after every face update: keeps the registration hint right when no embedding is due. */
  onFaces(tracks: readonly FaceTrack[], nowMs: number): void {
    this.lastVisible = tracks.filter((t) => t.visible).length;
    const alive = new Set(tracks.map((t) => t.id));
    for (const id of this.sched.keys()) {
      if (!alive.has(id)) {
        this.sched.delete(id);
        this.voter.forget(id);
        this.quality.delete(id);
      }
    }
    if (this.session && this.lastVisible !== 1)
      this.session.update({ faces: this.lastVisible, pose: null }, nowMs);
  }

  /** Handles the embeddings from one frame: match, vote, and feed the registration session. */
  onResult(r: FrameResult, tracks: readonly FaceTrack[], aspect: number, nowMs: number): void {
    if (!this.ready || r.identityCount === 0) return;
    const status = this.status as Extract<IdentityStatus, { state: 'ready' }>;
    const stride = IDENTITY_HEADER + status.dim;
    for (let i = 0; i < r.identityCount; i++) {
      const rec = r.identity.subarray(i * stride, (i + 1) * stride);
      const trackId = this.pending[rec[0]!];
      if (trackId === undefined) continue;
      const sharpness = rec[1]!;
      const brightness = rec[2]!;
      const emb = rec.slice(IDENTITY_HEADER); // copy: the registration keeps it
      this.quality.set(trackId, { sharpness, brightness });

      if (this.session) {
        const track = tracks.find((t) => t.id === trackId);
        this.session.update(
          {
            faces: this.lastVisible,
            pose: track ? headPose(track.landmarks, aspect) : null,
            embedding: emb,
            sharpness,
            brightness,
          },
          nowMs,
        );
      }
      // A blurry or dark crop gives an unreliable match; skip it instead of letting it vote.
      if (qualityProblem(sharpness, brightness, DEFAULT_LIMITS)) continue;
      const m = matchPerson(emb, this.people, this.threshold);
      this.voter.push(trackId, { bestId: m.bestId, score: m.score });
    }
    this.pending = [];
    this.rollback = [];
  }

  // --- registration -----------------------------------------------------------------------

  startRegistration(opts: Partial<SessionOptions> = {}): void {
    this.session = new RegistrationSession(opts);
  }

  cancelRegistration(): void {
    this.session = null;
  }

  registrationProgress(): Progress | null {
    return this.session?.progress() ?? null;
  }

  skipRegistrationStep(): void {
    this.session?.skipStep();
  }

  /** Saves the captured frames as a new person (name + embeddings only) and ends the session. */
  async finishRegistration(name: string): Promise<Person> {
    if (!this.session || !this.session.done) throw new Error('Registration is not finished');
    const embeddings = this.session.embeddings();
    const person = await peopleStore.add(name, embeddings, ACTIVE_IDENTITY_MODEL.id);
    this.session = null;
    await this.loadPeople();
    this.voter.clear(); // let everyone be re-judged against the new person
    return person;
  }
}

export const identityService = new IdentityService();
