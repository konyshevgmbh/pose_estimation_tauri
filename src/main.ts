import { invoke } from "@tauri-apps/api/core";
import { startCamera, captureJpeg, captureJpegBytes, type FacingMode } from "./camera";
import { drawSkeleton, scaleKeypoints, type Keypoint } from "./pose";

const isTauri = "__TAURI_INTERNALS__" in window;
const TARGET_FPS = 15;
const FRAME_MS = 1000 / TARGET_FPS;

// DOM
const video     = document.getElementById("video")     as HTMLVideoElement;
const overlay   = document.getElementById("overlay")   as HTMLCanvasElement;
const initScreen = document.getElementById("init-screen") as HTMLDivElement;
const statusEl  = document.getElementById("status")    as HTMLSpanElement;
const timeEl    = document.getElementById("inference-time") as HTMLSpanElement;
const cameraBtn = document.getElementById("camera-btn")as HTMLButtonElement;
const initText  = document.getElementById("init-text") as HTMLParagraphElement;
const initSteps = document.querySelectorAll<HTMLLIElement>(".init-step");

const captureCanvas = document.createElement("canvas");
const overlayCtx    = overlay.getContext("2d")!;

let facingMode: FacingMode = "environment";
let running = false;

// --- init step helpers ---
function stepDone(i: number) {
  initSteps[i].classList.replace("active", "done");
  if (i + 1 < initSteps.length) initSteps[i + 1].classList.add("active");
}
function stepError(i: number, msg: string) {
  initSteps[i].classList.add("error");
  initSteps[i].classList.remove("active");
  initText.textContent = msg;
}

// --- init sequence ---
async function init() {
  // step 0: camera
  initText.textContent = "Requesting camera…";
  try {
    await startCamera(video, facingMode);
  } catch (e) {
    stepError(0, `Camera error: ${e}`);
    return;
  }
  stepDone(0);

  if (!isTauri) {
    try {
      // step 1: load WASM module + model
      initText.textContent = "Loading ONNX model…";
      const wasm = await import("./wasm-pkg/pose_estimation_wasm.js");
      await wasm.default();
      const resp = await fetch("models/rtmpose.onnx");
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const bytes = new Uint8Array(await resp.arrayBuffer());
      wasm.load_model(bytes);
      stepDone(1);

      // step 2: warmup
      initText.textContent = "Warming up…";
      try {
        const jpegBytes = captureJpegBytes(video, captureCanvas);
        if (jpegBytes) wasm.run_inference(jpegBytes, video.videoWidth, video.videoHeight);
      } catch (_) {}
      stepDone(2);

      // step 3: go
      stepDone(3);
      await new Promise((r) => setTimeout(r, 300));
      initScreen.style.display = "none";
      statusEl.textContent = "Running (Web)";
      running = true;
      startInferenceBytesLoop((bytes, w, h) => wasm.run_inference(bytes, w, h) as Keypoint[]);
    } catch (e) {
      stepError(1, `WASM error: ${e}\nPlace rtmpose.onnx in models/`);
    }
    startRenderLoop();
    return;
  }

  // step 1: load model
  initText.textContent = "Loading ONNX model…";
  try {
    const modelPath = ((window as unknown) as Record<string, unknown>)["POSE_MODEL_PATH"] as string
      ?? "models/rtmpose.onnx";
    try {
      // fast path: Rust resolves from resource_dir (desktop + Android prod)
      await invoke("init_model", { path: modelPath });
    } catch (_pathErr) {
      // fallback: fetch bytes and send to Rust (Android dev mode)
      initText.textContent = "Loading ONNX model (fetch)…";
      const resp = await fetch(modelPath);
      if (!resp.ok) throw new Error(`fetch ${modelPath}: HTTP ${resp.status}\n(path error: ${_pathErr})`);
      const bytes = Array.from(new Uint8Array(await resp.arrayBuffer()));
      await invoke("init_model_bytes", { bytes });
    }
  } catch (e) {
    stepError(1, `Model error: ${e}`);
    return;
  }
  stepDone(1);

  // step 2: warmup
  initText.textContent = "Warming up…";
  try {
    const jpeg = captureJpeg(video, captureCanvas);
    if (jpeg) {
      await invoke("run_inference", {
        jpegB64: jpeg,
        origW: video.videoWidth,
        origH: video.videoHeight,
      });
    }
  } catch (_) { /* warmup failure is non-fatal */ }
  stepDone(2);

  // step 3: go
  initText.textContent = "Ready!";
  stepDone(3);
  await new Promise((r) => setTimeout(r, 300));
  initScreen.style.display = "none";
  statusEl.textContent = "Running";
  running = true;
  startInferenceLoop(async (jpeg, w, h) =>
    invoke<Keypoint[]>("run_inference", { jpegB64: jpeg, origW: w, origH: h })
  );
  startRenderLoop();
}

// --- inference loop (Tauri — base64 string IPC) ---
type InferFn = (jpeg: string, w: number, h: number) => Keypoint[] | Promise<Keypoint[]>;

function startInferenceLoop(infer: InferFn) {
  async function tick() {
    if (!running) return;
    const t0 = performance.now();
    const jpeg = captureJpeg(video, captureCanvas);
    if (jpeg) {
      try {
        const kps = await infer(jpeg, video.videoWidth, video.videoHeight);
        renderPose(kps);
        timeEl.textContent = `${Math.round(performance.now() - t0)} ms`;
      } catch (_) {}
    }
    const elapsed = performance.now() - t0;
    setTimeout(tick, Math.max(0, FRAME_MS - elapsed));
  }
  tick();
}

// --- inference loop (WASM — raw bytes, no base64 overhead) ---
type InferBytesFn = (bytes: Uint8Array, w: number, h: number) => Keypoint[] | Promise<Keypoint[]>;

function startInferenceBytesLoop(infer: InferBytesFn) {
  async function tick() {
    if (!running) return;
    const t0 = performance.now();
    const bytes = captureJpegBytes(video, captureCanvas);
    if (bytes) {
      try {
        const kps = await infer(bytes, video.videoWidth, video.videoHeight);
        renderPose(kps);
        timeEl.textContent = `${Math.round(performance.now() - t0)} ms`;
      } catch (_) {}
    }
    const elapsed = performance.now() - t0;
    setTimeout(tick, Math.max(0, FRAME_MS - elapsed));
  }
  tick();
}

// --- render loop (keeps overlay size in sync with video) ---
function startRenderLoop() {
  function frame() {
    syncOverlaySize();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function syncOverlaySize() {
  if (overlay.width !== video.clientWidth || overlay.height !== video.clientHeight) {
    overlay.width  = video.clientWidth;
    overlay.height = video.clientHeight;
  }
}

function renderPose(kps: Keypoint[]) {
  syncOverlaySize();
  overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
  if (!kps.length) return;
  const scaled = scaleKeypoints(
    kps,
    video.videoWidth, video.videoHeight,
    overlay.width,    overlay.height
  );
  drawSkeleton(overlayCtx, scaled);
}

// --- camera flip ---
cameraBtn.addEventListener("click", async () => {
  facingMode = facingMode === "user" ? "environment" : "user";
  await startCamera(video, facingMode);
});

init();
