export interface Keypoint {
  x: number;
  y: number;
  score: number;
}

// COCO-17 keypoint order from RTMPose
export const KP_NAMES = [
  "nose",
  "left_eye", "right_eye",
  "left_ear", "right_ear",
  "left_shoulder", "right_shoulder",
  "left_elbow", "right_elbow",
  "left_wrist", "right_wrist",
  "left_hip", "right_hip",
  "left_knee", "right_knee",
  "left_ankle", "right_ankle",
] as const;

// [from_idx, to_idx] connections
export const SKELETON: [number, number][] = [
  [0, 1], [0, 2],           // nose → eyes
  [1, 3], [2, 4],           // eyes → ears
  [5, 6],                   // shoulders
  [5, 7], [7, 9],           // left arm
  [6, 8], [8, 10],          // right arm
  [5, 11], [6, 12],         // torso sides
  [11, 12],                 // hips
  [11, 13], [13, 15],       // left leg
  [12, 14], [14, 16],       // right leg
];

// Per-bone colors (RGB)
const BONE_COLORS: [number, number, number][] = [
  [255, 128,   0], [255, 153,  51],
  [255, 178, 102], [230, 230,   0],
  [102, 178, 255], [153, 204, 255],
  [255, 102, 255], [255,  51, 255],
  [102, 178, 255], [ 51, 153, 255],
  [255, 153, 153], [255, 102, 102],
  [255,  51,  51], [153, 255, 153],
  [102, 255, 102], [ 51, 255,  51],
];

export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  kps: Keypoint[],
  scoreThreshold = 0.3
): void {
  ctx.save();
  ctx.lineCap = "round";

  SKELETON.forEach(([a, b], i) => {
    if (kps[a].score < scoreThreshold || kps[b].score < scoreThreshold) return;
    const [r, g, bl] = BONE_COLORS[i % BONE_COLORS.length];
    ctx.strokeStyle = `rgba(${r},${g},${bl},0.9)`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(kps[a].x, kps[a].y);
    ctx.lineTo(kps[b].x, kps[b].y);
    ctx.stroke();
  });

  kps.forEach((kp) => {
    if (kp.score < scoreThreshold) return;
    ctx.fillStyle = "rgb(0,255,128)";
    ctx.beginPath();
    ctx.arc(kp.x, kp.y, 5, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}

/** Scale keypoints from model-output space to canvas display space. */
export function scaleKeypoints(
  kps: Keypoint[],
  fromW: number,
  fromH: number,
  toW: number,
  toH: number
): Keypoint[] {
  const sx = toW / fromW;
  const sy = toH / fromH;
  return kps.map((k) => ({ x: k.x * sx, y: k.y * sy, score: k.score }));
}
