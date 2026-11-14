#!/usr/bin/env bash
# Fetches model files and runtimes into public/models (served from our own origin, so the app makes
# no third-party network calls at runtime). Run after `npm install`.
#   WITH_INT8=1 ./scripts/fetch-models.sh   also downloads the 9.9 MB int8 face-recognition model
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p public/models/wasm public/models/ort

# FaceLandmarker (float16, ~3.7 MB)
curl -fL -o public/models/face_landmarker.task \
  https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task

# HandLandmarker (float16, ~7.8 MB)
curl -fL -o public/models/hand_landmarker.task \
  https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task

# GestureRecognizer (float16, ~8.4 MB): used only as a cross-check for our own detectors
curl -fL -o public/models/gesture_recognizer.task \
  https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task

# Face recognition: SFace, a MobileFaceNet trained with the SFace loss (OpenCV Zoo), 128-d embeddings
# from a 112x112 aligned face. Apache-2.0. fp32 (38.7 MB) is the default: same accuracy as int8 but
# 2-5x faster in onnxruntime-web (see the README). The 9.9 MB int8 file is optional.
curl -fL -o public/models/face_recognition_sface_2021dec.onnx \
  https://huggingface.co/opencv/face_recognition_sface/resolve/main/face_recognition_sface_2021dec.onnx
curl -fL -o public/models/LICENSE-sface.txt \
  https://huggingface.co/opencv/face_recognition_sface/resolve/main/LICENSE
if [ "${WITH_INT8:-0}" = "1" ]; then
  curl -fL -o public/models/face_recognition_sface_2021dec_int8.onnx \
    https://huggingface.co/opencv/face_recognition_sface/resolve/main/face_recognition_sface_2021dec_int8.onnx
fi

# MediaPipe WASM runtime and onnxruntime-web's .wasm files: copied from the installed npm packages
# so versions always match. (plain = CPU/WASM; asyncify = the WebGPU build of onnxruntime-web 1.31)
cp node_modules/@mediapipe/tasks-vision/wasm/* public/models/wasm/
cp node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm \
   node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs \
   node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm \
   node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.mjs \
   public/models/ort/

echo "Models ready in public/models"
