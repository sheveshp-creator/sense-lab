import { Scheduler } from './scheduler/scheduler';
import { startFrameLoop } from './scheduler/frameLoop';
import { QUALITY_LEVELS, QualityManager } from './scheduler/quality';
import type { QualityId } from './scheduler/quality';
import { stats } from './stats/collector';
import { WorkerClient } from './worker/client';
import { FaceTracker } from './tracking/faceTracker';
import { liveStore } from './liveStore';
import type { LayerToggles } from './liveStore';
import { handRecorder } from './recorder';
import { bus } from '../events/bus';
import { drawFaces } from '../render/faceOverlay';
import { drawHandMotion, drawHands } from '../render/handOverlay';
import { Heatmap } from '../render/heatmap';
import { HandPipeline } from '../features/hand/handPipeline';
import { identityService } from '../features/face/identityService';
import { FaceAnalysis } from '../features/face/faceAnalysis';
import { frameStore, publishFrame, resetFrameStore } from './frameStore';
import { ACTIVE_IDENTITY_MODEL } from '../features/face/identityModel';
import { TASK_FACE, TASK_GESTURE, TASK_HAND, TASK_IDENTITY } from '../features/hand/handFormat';
import type { GestureEvent } from '../features/hand/types';
import type { ModelName } from './worker/protocol';
import type { ThreadMode } from './worker/transport';
import { chooseThread, isWorkerEnvironmentError } from './capabilities';
import { FrameGrabber } from './camera/capture';
import { prefetchSettled } from './prefetch';

export interface Pipeline {
  stop: () => void;
}

/** Hands currently on screen, for the Hand Lab panels (they poll it a few times per second). */
export const live: {
  hands: HandPipeline | null;
  faces: FaceTracker | null;
  analysis: FaceAnalysis | null;
  /** Asks the engine to load a model again after it failed (the Retry button). */
  retry: ((model: ModelName) => void) | null;
} = {
  hands: null,
  faces: null,
  analysis: null,
  retry: null,
};

/** One analysis object for the whole session, so gaze calibration survives restarting the camera. */
export const faceAnalysis = new FaceAnalysis();

const emit = (events: GestureEvent[]) => {
  for (const e of events) bus.emit(`gesture:${e.id}`, e);
};

/**
 * Wires camera frames -> worker -> trackers -> overlay canvas, recording per-stage timings.
 * Trackers are owned here and handed straight to the renderer, so tracks never enter React state.
 */
export async function startPipeline(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
): Promise<Pipeline> {
  const scheduler = new Scheduler();
  scheduler.register('face', { everyNFrames: 1 });
  scheduler.register('hand', { everyNFrames: 1 });
  // The recognizer only cross-checks our own detectors, and it is the heaviest hand model,
  // so it runs on every 8th frame (~270 ms) and only while a hand is in view. Every 4th frame was
  // measured to push those frames past the 33 ms budget and drop inference to ~25/s.
  scheduler.register('gesture', { everyNFrames: 8 });
  const faces = new FaceTracker();
  const hands = new HandPipeline();
  const heatmap = new Heatmap();
  const ctx = canvas.getContext('2d');
  let stopped = false;
  let failedFrames = 0;
  const grabber = new FrameGrabber();

  // Automatic quality (rule 4). The level decides cadence, frame size and which overlays are drawn.
  const quality = new QualityManager();
  let level = QUALITY_LEVELS[0]!;
  const applyLevel = (id: QualityId) => {
    level = QUALITY_LEVELS[id]!;
    scheduler.configure('face', { everyNFrames: level.faceEvery });
    scheduler.configure('hand', { everyNFrames: level.handEvery });
    if (level.gestureEvery > 0)
      scheduler.configure('gesture', { everyNFrames: level.gestureEvery });
    liveStore.getState().setQualityLevel(id);
  };
  applyLevel(0);
  // Layers with the costly ones forced off at lower quality. Rebuilt only when the toggles or the level
  // change (the toggles object is replaced on every change), so the frame loop allocates nothing.
  let lightFor: LayerToggles | null = null;
  let light: LayerToggles | null = null;
  const effectiveLayers = (layers: LayerToggles): LayerToggles => {
    if (!level.lightOverlay) return layers;
    if (lightFor !== layers || !light) {
      light = { ...layers, mesh: false, heatmap: false };
      lightFor = layers;
    }
    return light;
  };

  stats.reset();
  // Models are served from our own origin (privacy rule: no third-party requests).
  const base = `${location.origin}${import.meta.env.BASE_URL}models`;
  // Per-model load state goes to the store (the UI shows it and offers Retry); the delegate shown in the
  // stats panel is GPU only if every loaded MediaPipe model got it.
  const connect = async (mode: ThreadMode): Promise<WorkerClient> => {
    const c = new WorkerClient(mode);
    c.onModel = (model, st) => {
      const ui = liveStore.getState();
      ui.setModelLoad(model, st);
      if (model === 'identity') {
        identityService.status =
          st.state === 'ready' || st.state === 'error'
            ? (st.identity ?? { state: 'error', message: st.message ?? 'failed' })
            : { state: 'loading' };
      }
      const loaded = (['face', 'hand', 'gesture'] as const)
        .map((m) => c.models[m].delegate)
        .filter((d) => d !== undefined);
      ui.setDelegate(loaded.length === 0 ? null : loaded.every((d) => d === 'GPU') ? 'GPU' : 'CPU');
      // A browser quirk in the worker (not a download problem): give the main thread one try.
      if (
        mode === 'worker' &&
        st.state === 'error' &&
        (model === 'face' || model === 'hand') &&
        isWorkerEnvironmentError(st.message ?? '')
      )
        fallBackToMain();
    };
    try {
      await c.init({
        wasmBaseUrl: `${base}/wasm`,
        faceModelUrl: `${base}/face_landmarker.task`,
        handModelUrl: `${base}/hand_landmarker.task`,
        gestureModelUrl: `${base}/gesture_recognizer.task`,
        ortBaseUrl: `${base}/ort/`,
        identityModelUrl: `${base}/${ACTIVE_IDENTITY_MODEL.file}`,
        identityModel: ACTIVE_IDENTITY_MODEL,
        identityProvider: 'auto',
      });
    } catch (err) {
      c.terminate();
      throw err;
    }
    liveStore.getState().setThread(mode);
    return c;
  };
  let client: WorkerClient;
  let fellBack = false;
  /**
   * The models could not start in the worker because of the browser (seen on iPhone and iPad). Start over on the
   * main thread once, where MediaPipe has a document and its usual canvas. The old client is detached first so it
   * cannot write its failures into the UI after we have moved on.
   */
  const fallBackToMain = () => {
    if (fellBack || stopped) return;
    fellBack = true;
    console.warn('Models could not start in the worker; switching to the main thread.');
    const old = client;
    for (const m of ['face', 'hand', 'gesture', 'identity'] as const)
      liveStore.getState().setModelLoad(m, { state: 'idle' });
    void connect('main')
      .then((c) => {
        if (stopped) return c.terminate();
        old.onModel = null;
        old.terminate();
        // The frame loop asks for each model it needs (state 'idle'), so the new client loads them.
        client = c;
      })
      .catch(() => {
        /* the main thread could not start either: the error banner from the worker stays */
      });
  };
  const mode = chooseThread();
  try {
    client = await connect(mode);
  } catch (err) {
    // The worker itself would not start (blocked script, unsupported). Run on the page instead of giving up.
    if (mode !== 'worker') throw err;
    console.warn('Worker failed to start, running models on the main thread:', err);
    client = await connect('main');
  }
  void identityService.loadPeople();
  // If the page is already downloading the face stack (started when consent was ticked), let it finish rather
  // than download the same files a second time.
  await prefetchSettled();
  // Face first: the first face box must not wait for the hand models.
  if (liveStore.getState().models.face) client.load('face');
  if (liveStore.getState().models.hands) client.load('hand');
  live.retry = (m) => client.load(m);
  live.hands = hands;
  live.faces = faces;
  live.analysis = faceAnalysis;
  frameStore.setState({ running: true });
  faceAnalysis.clear();

  const draw = () => {
    if (!ctx) return;
    if (canvas.width !== video.videoWidth && video.videoWidth > 0) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    hands.aspect = canvas.width / canvas.height;
    const t0 = performance.now();
    const layers = effectiveLayers(liveStore.getState().layers);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    heatmap.decay(t0);
    if (layers.heatmap) heatmap.draw(ctx, canvas.width, canvas.height);
    drawFaces(
      ctx,
      faces.alive,
      layers,
      canvas.width,
      canvas.height,
      (id) => identityService.labelFor(id),
      (id) => faceAnalysis.states.get(id) ?? null,
    );
    drawHands(ctx, hands.views, layers, canvas.width, canvas.height);
    drawHandMotion(ctx, hands, layers, canvas.width, canvas.height, t0);
    stats.record('draw', performance.now() - t0);
  };

  // Back from a hidden tab: whatever was tracked is minutes old. Start clean, so a hand that was at one
  // side of the frame cannot "swipe" to where it is now, and the FPS numbers do not include the pause.
  const onResume = () => {
    faces.clear();
    faceAnalysis.clear();
    emit(hands.clear(performance.now()));
    stats.reset();
  };
  const stopLoop = startFrameLoop(
    video,
    async (now, frameIndex) => {
      stats.markFrame(now);
      const { models, qualityMode } = liveStore.getState();
      // A pinned level wins over the manager; in auto mode the manager moves it from measured cost (below).
      if (qualityMode !== 'auto' && qualityMode !== quality.level) {
        quality.set(qualityMode);
        applyLevel(qualityMode);
      }
      // A model switched off must not leave stale tracks on screen.
      if (!models.face && faces.alive.length) {
        faces.clear();
        faceAnalysis.clear();
      }
      if (!models.hands && hands.tracker.alive.length) emit(hands.clear(now));

      // Lazy loading: a model is requested the first time its feature is wanted (idle only: a failed model
      // is retried by the Retry button, not on every frame).
      const want = (m: ModelName) => {
        if (client.models[m].state === 'idle') client.load(m);
      };
      if (models.face) want('face');
      if (models.hands) want('hand');
      if (models.hands && level.gestureEvery > 0 && hands.visibleCount > 0) want('gesture');
      if (models.identity && level.identity && faces.alive.length > 0) want('identity');

      let tasks = 0;
      if (models.face && client.isReady('face') && scheduler.shouldRun('face', frameIndex, now))
        tasks |= TASK_FACE;
      if (models.hands && client.isReady('hand') && scheduler.shouldRun('hand', frameIndex, now))
        tasks |= TASK_HAND;
      if (
        models.hands &&
        level.gestureEvery > 0 &&
        client.isReady('gesture') &&
        hands.visibleCount > 0 &&
        scheduler.shouldRun('gesture', frameIndex, now)
      ) {
        tasks |= TASK_GESTURE;
      }

      if (tasks && !client.busy) {
        const t0 = performance.now();
        // Frames are always sent at full size. Resizing them first was measured to make the models slower
        // (the resized bitmap is no longer a GPU texture), so quality never changes the frame size.
        const bitmap = await grabber.grab(video);
        const captureMs = performance.now() - t0;
        stats.record('capture', captureMs);
        const t1 = performance.now();
        // Identity is not scheduled by frame count: the service picks faces that are new or due (~500 ms).
        let targets: Float32Array | null = null;
        if (models.identity && level.identity && models.face && tasks & TASK_FACE) {
          targets = identityService.plan(faces.alive, t1);
          if (targets) tasks |= TASK_IDENTITY;
        }
        const sent = client.sendFrame(bitmap, now, tasks, targets ?? undefined);
        if (!sent && targets) identityService.unplan();
        sent
          ?.then((r) => {
            if (stopped) return;
            failedFrames = 0;
            if (liveStore.getState().runtimeError) liveStore.getState().setRuntimeError(null);
            const t = performance.now();
            // Round trip includes message passing both ways; the per-model times are MediaPipe alone.
            stats.record('worker', t - t1);
            stats.markResult(t);
            if (liveStore.getState().qualityMode === 'auto') {
              const next = quality.sample(captureMs + (t - t1), t);
              if (next !== null) applyLevel(next);
            }
            if (r.ran & TASK_FACE) {
              stats.record('face', r.faceMs);
              faces.update(r.faces, r.faceCount, t);
              identityService.onFaces(faces.alive, t);
              for (const e of faceAnalysis.update(faces.alive, canvas.width / canvas.height, t)) {
                if (e.type === 'blink') bus.emit('face:blink', e);
                else bus.emit('face:expression', e);
              }
            }
            if (r.ran & TASK_IDENTITY) {
              stats.record('identity', r.identityMs);
              identityService.onResult(r, faces.alive, canvas.width / canvas.height, t);
            }
            if (r.ran & TASK_HAND) {
              stats.record('hand', r.handMs);
              handRecorder.push(t, r.hands, r.handCount);
              emit(hands.update(r.hands, r.handCount, t));
              // Heat is added in raw image coordinates (the space the canvas is drawn in).
              for (const v of hands.views) {
                heatmap.add(
                  1 - v.frame.metrics.palmX / (canvas.width / canvas.height),
                  v.frame.metrics.palmY,
                  0.2,
                );
              }
            }
            if (r.ran & TASK_GESTURE) {
              stats.record('gesture', r.gestureMs);
              hands.applyHints(r.hints, r.hintCount, t);
            }
            // Hand the latest faces, hands and two-hand state to the playground demos.
            publishFrame({
              tracks: faces.alive,
              analysis: faceAnalysis,
              hands,
              aspect: canvas.width / canvas.height,
              t,
            });
          })
          .catch((err: unknown) => {
            if (stopped) return; // worker terminated during shutdown
            // One failed frame is skipped. Many in a row mean tracking is broken: tell the user.
            if (++failedFrames === 30) {
              liveStore
                .getState()
                .setRuntimeError(err instanceof Error ? err.message : 'Tracking stopped working.');
            }
          });
      }
      draw();
    },
    onResume,
  );

  return {
    stop: () => {
      stopped = true;
      stopLoop();
      client.terminate();
      live.retry = null;
      live.hands = null;
      live.faces = null;
      for (const m of ['face', 'hand', 'gesture', 'identity'] as const)
        liveStore.getState().setModelLoad(m, { state: 'idle' });
      liveStore.getState().setThread(null);
      liveStore.getState().setRuntimeError(null);
      live.analysis = null;
      resetFrameStore();
      liveStore.getState().setDelegate(null);
    },
  };
}
