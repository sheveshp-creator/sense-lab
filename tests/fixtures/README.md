# Fixtures

All files use the same JSON layout (`kind: "hands"`, frames of raw hand data in the
`src/features/hand/handFormat.ts` layout), the same one the dev "Record last 2 s" button saves, so a
fixture you record yourself can be dropped in here and replayed by `tests/helpers/runHands.ts`.

| Files                               | Source                                                                                                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `hand_*.json`                       | REAL: MediaPipe sample photos shown to the app through a fake camera (static poses)                                                                                            |
| `real_swipe_*.json`                 | REAL: the model's landmarks on a hand photo sliding across a fake camera feed                                                                                                  |
| `synthetic_*.json`                  | SYNTHETIC: generated from the parametric hand in `tests/helpers/makeHand.ts`. Regenerate with `GEN_FIXTURES=1 npx vitest run tests/fixtures`                                   |
| `identity_embeddings.json`          | REAL: SFace fp32 embeddings (numbers only, no images) of 8 public LFW photos for each of 6 public figures, written by `scripts/eval-identity.mjs --json out.json --embeddings` |
| `expression_blendshapes.json`       | REAL: 52 MediaPipe blendshape scores (numbers only) for 100 photos held out from tuning: in-the-wild and posed CK+. Random sample, seed 11                                     |
| `eyes_real_photos.json`             | REAL: sparse landmarks, head-pose angles and eye blendshapes (numbers only) for 146 public photos, including the extremes whose direction was confirmed by looking at them     |
| `faces_*.json`, `noisy_signal.json` | SYNTHETIC: face tracker and One-Euro filter tests                                                                                                                              |

Synthetic fixtures check the detector logic and the false-trigger guards, not real-world accuracy.
Nothing here has been recorded from a person's live hand yet.
