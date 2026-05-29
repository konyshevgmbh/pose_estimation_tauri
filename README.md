# Pose Estimation Tauri

Test project — a desktop app built with [Tauri v2](https://tauri.app/) for real-time human pose estimation.

## Stack

- **Tauri 2** — desktop shell (Rust + WebView)
- **Vite + TypeScript** — frontend
- **RTMPose (ONNX)** — body keypoint detection model (COCO-17)
- **WebAssembly** — model inference in the browser context

## Features

- Detects 17 body keypoints (COCO format)
- Renders skeleton with colored bones
- Android build support

## Requirements

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/) (stable)
- [wasm-pack](https://rustwasm.github.io/wasm-pack/)

## Getting Started

```bash
npm install

# Build the WASM module
npm run wasm:build

# Run in dev mode
npm run tauri:dev

# Build release
npm run tauri:build
```

## Android

```bash
npm run android:init
npm run android:dev
npm run android:build
```

## Project Structure

```
├── src/              # TypeScript frontend
│   └── pose.ts       # Skeleton rendering logic
├── src-tauri/        # Rust backend (Tauri)
├── src-wasm/         # WebAssembly module
└── models/           # ONNX models (rtmpose.onnx)
```
