import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { QualityId } from './scheduler/quality';
import type { ModelState } from './worker/client';
import type { ThreadMode } from './worker/transport';
import type { ModelName } from './worker/protocol';

export interface LayerToggles {
  box: boolean;
  mesh: boolean;
  eyes: boolean;
  brows: boolean;
  nose: boolean;
  lips: boolean;
  jaw: boolean;
  label: boolean;
  expression: boolean;
  gaze: boolean;
  handSkeleton: boolean;
  fingerLabels: boolean;
  gestureTag: boolean;
  palmTrail: boolean;
  gestureFx: boolean;
  heatmap: boolean;
}

/** Which models run. Turning one off saves its time per frame. */
export interface ModelToggles {
  face: boolean;
  hands: boolean;
  /** Face recognition (names on faces). Needs the embedding model file. */
  identity: boolean;
}

export const LAYER_LABELS: Record<keyof LayerToggles, string> = {
  box: 'Box',
  mesh: 'Mesh',
  eyes: 'Eyes',
  brows: 'Brows',
  nose: 'Nose',
  lips: 'Lips',
  jaw: 'Jaw',
  label: 'ID label',
  expression: 'Expression',
  gaze: 'Gaze',
  handSkeleton: 'Skeleton',
  fingerLabels: 'Finger states',
  gestureTag: 'Gesture tag',
  palmTrail: 'Palm trail',
  gestureFx: 'Gesture effects',
  heatmap: 'Heatmap',
};

export const FACE_LAYER_KEYS = [
  'box',
  'mesh',
  'eyes',
  'brows',
  'nose',
  'lips',
  'jaw',
  'label',
  'expression',
  'gaze',
] as const;
export const HAND_LAYER_KEYS = [
  'handSkeleton',
  'fingerLabels',
  'gestureTag',
  'palmTrail',
  'gestureFx',
  'heatmap',
] as const;

interface LiveState {
  layers: LayerToggles;
  setLayer: (key: keyof LayerToggles, on: boolean) => void;
  models: ModelToggles;
  setModel: (key: keyof ModelToggles, on: boolean) => void;
  /** MediaPipe delegate in use, shown in the stats panel. */
  delegate: 'GPU' | 'CPU' | null;
  setDelegate: (d: 'GPU' | 'CPU' | null) => void;
  /** 'auto' lets the quality manager step the level; a number pins it (useful to compare levels). */
  qualityMode: 'auto' | QualityId;
  setQualityMode: (m: 'auto' | QualityId) => void;
  /** Load state of each model (they load on first use). Written by the pipeline. */
  modelLoad: Record<ModelName, ModelState>;
  setModelLoad: (m: ModelName, s: ModelState) => void;
  /** Where inference runs: a Web Worker (normal) or the main thread (fallback). */
  thread: ThreadMode | null;
  setThread: (t: ThreadMode | null) => void;
  /** Set when tracking stopped working while the camera is still fine. */
  runtimeError: string | null;
  setRuntimeError: (e: string | null) => void;
  /** The level in use right now, written by the pipeline. */
  qualityLevel: QualityId;
  setQualityLevel: (l: QualityId) => void;
}

/**
 * Vanilla store so the frame loop and renderer read it with getState() (no React involved).
 * React components subscribe through useLive() only for toggles and panels.
 */
export const liveStore = createStore<LiveState>()((set) => ({
  layers: {
    box: true,
    mesh: false,
    eyes: true,
    brows: true,
    nose: true,
    lips: true,
    jaw: true,
    label: true,
    expression: true,
    gaze: true,
    handSkeleton: true,
    fingerLabels: true,
    gestureTag: true,
    palmTrail: true,
    gestureFx: true,
    heatmap: false,
  },
  models: { face: true, hands: true, identity: true },
  setModel: (key, on) => set((s) => ({ models: { ...s.models, [key]: on } })),
  setLayer: (key, on) => set((s) => ({ layers: { ...s.layers, [key]: on } })),
  delegate: null,
  setDelegate: (delegate) => set({ delegate }),
  modelLoad: {
    face: { state: 'idle' },
    hand: { state: 'idle' },
    gesture: { state: 'idle' },
    identity: { state: 'idle' },
  },
  setModelLoad: (m, st) => set((s) => ({ modelLoad: { ...s.modelLoad, [m]: st } })),
  thread: null,
  setThread: (thread) => set({ thread }),
  runtimeError: null,
  setRuntimeError: (runtimeError) => set({ runtimeError }),
  qualityMode: 'auto',
  setQualityMode: (qualityMode) => set({ qualityMode }),
  qualityLevel: 0,
  setQualityLevel: (qualityLevel) => set({ qualityLevel }),
}));

export const useLive = <T>(selector: (s: LiveState) => T): T => useStore(liveStore, selector);
