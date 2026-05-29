export type FacingMode = "user" | "environment";

export async function startCamera(
  video: HTMLVideoElement,
  facingMode: FacingMode
): Promise<void> {
  if (video.srcObject) {
    (video.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 320 },
      height: { ideal: 240 },
      frameRate: { ideal: 30 },
      facingMode,
    },
    audio: false,
  });

  video.srcObject = stream;
  await video.play();
}

/** Returns base64-encoded JPEG (no data-URI prefix), or null if video not ready. */
export function captureJpeg(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  quality = 0.6
): string | null {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d")!.drawImage(video, 0, 0);
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

/** Returns raw JPEG bytes as Uint8Array, or null if video not ready. */
export function captureJpegBytes(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  quality = 0.6
): Uint8Array | null {
  const b64 = captureJpeg(video, canvas, quality);
  if (b64 === null) return null;
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
