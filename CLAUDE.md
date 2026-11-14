# SenseLab: project brief

SenseLab is a portfolio web app that does real-time face and hand recognition in the browser using the webcam. Everything runs on-device. No backend, no video upload.

## Features (all must work live)

Face: detection, recognition of registered people, landmarks (eyes, brows, nose, lips, jawline), tracking with stable IDs, expressions (happy, sad, angry, surprised, neutral), eye tracking (blinks + gaze direction), multiple faces at once.
Hand: detection, 21 landmarks, per-finger state and tracking, static gestures (thumbs up, peace, open palm, fist, pointing, OK, etc.), dynamic gestures (wave, swipe 4 directions, point with direction), hand position tracking, two-hand gestures (zoom, rotate, clap, heart).

## Stack (do not swap without asking)

- Vite + React + TypeScript (strict mode)
- @mediapipe/tasks-vision: FaceLandmarker, HandLandmarker, GestureRecognizer
- onnxruntime-web with a small face-embedding model (MobileFaceNet / ArcFace style, 112x112 input, int8 if possible) for identity. MediaPipe cannot identify people; this model can.
- Canvas 2D for overlays, Three.js for 3D demos
- Zustand for state, idb for IndexedDB, Tailwind for styling, Framer Motion for UI motion
- Vitest for unit tests, Playwright for e2e (Chromium fake camera)
- PWA service worker to cache models

## Architecture rules

1. Models run in a Web Worker. The UI thread never runs inference. Check that MediaPipe works inside the worker; if module workers fail, use a classic worker or fall back to main thread behind a flag. Tell me which one you picked and why.
2. Frame loop uses requestVideoFrameCallback (fallback: requestAnimationFrame). Send frames to the worker as ImageBitmap (transferable). Worker returns only Float32Array landmarks and small result objects. Never send images back.
3. Each model runs on its own schedule (scheduler module). Face and hand models run every frame (or every 2nd frame in low-quality mode). Face identity runs only for new faces or every ~500 ms per tracked face, never every frame.
4. Automatic quality mode: if average frame time > 33 ms, step down (lower input size, skip frames, disable heavy layers). Step back up when stable.
5. No React re-renders per frame. The live data lives in a Zustand store read by the frame loop and the canvas renderer directly. React only renders panels and pages.
6. Smooth all landmarks with a One-Euro filter. Do not use a plain moving average.
7. Every gesture detector implements one interface:
   `interface GestureDetector { id: string; update(frame: HandFrame): GestureEvent[] }`
   Adding a gesture = adding one file + one registry line. Each detector has a hold-frames requirement, a confidence threshold and a cooldown.
8. Typed event bus for everything the UI reacts to ("gesture:swipeLeft", "face:recognized", ...).
9. Reuse objects and typed arrays in hot paths. No allocations per frame where avoidable.
10. Pause all processing when the tab is hidden or the camera is off.

## Privacy rules (non-negotiable)

- Ask for consent in the UI before starting the camera.
- Store only face embeddings + names in IndexedDB. Never store photos or video frames.
- One-click delete of all data, plus JSON export/import of profiles.
- No network calls after the models are loaded, except fetching static model files from our own origin.

## Folder structure

```
src/
  core/ camera/ worker/ scheduler/ tracking/ events/
  features/ face/ (detect, landmarks, identity, expression, eyes)
            hand/ (landmarks, fingers, static/, dynamic/, twoHand/)
  render/    canvas layers, three.js scenes
  storage/   IndexedDB profiles, export/import
  ui/        pages, panels, components
  demos/     playground modules
public/models/   .task and .onnx files
tests/fixtures/  recorded landmark JSON for repeatable tests
```

## Pages

Welcome (consent), Live Studio (layer toggles + FPS/per-model timing panel), Face Lab (register/delete people, threshold slider, expression meter, blink/gaze charts), Hand Lab (finger state, gesture timeline), Playground (Air Draw, Slide Remote, 3D Object with two hands, Mirror Avatar, Blink Battle), How It Works (architecture + performance notes).

## Targets

30 FPS on a mid-range laptop with face + hands on. 20+ FPS on a recent phone.
First face box in under 3 s on first load, under 1 s on later loads (cached models).

## How I want you to work

- Work in small steps. After each step, run the type check and tests and tell me the result.
- Before writing code for a phase, give me a short plan (files you will create/change) and wait for my OK only if the plan departs from this brief.
- Prefer simple code over clever code. Comment the "why", not the "what".
- If a decision is not covered here, pick the simplest option, state it in one line, and continue.
- Never invent numbers (FPS, accuracy). Measure them and show me.
- If a model file or package cannot be downloaded in your environment, do not fake it. Create a scripts/fetch-models.sh with the exact URLs and tell me to run it.
