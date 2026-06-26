import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';
import { SCAN_LABELS } from './labels';

export type DetectedProduct = {
  bbox: { x: number; y: number; w: number; h: number }; // normalized 0-1
  classIndex: number;
  label: (typeof SCAN_LABELS)[number];
  confidence: number;
};

const CONF_THRESHOLD  = 0.30;
const IOU_THRESHOLD   = 0.45;
const MAX_DETECTIONS  = 20;
const MODEL_INPUT_SIZE = 640;

let detector: tf.GraphModel | null = null;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms),
    ),
  ]);
}

export async function loadDetector(): Promise<void> {
  if (detector) return;
  await withTimeout(tf.ready(), 15_000, 'tf.ready()');
  detector = await withTimeout(
    tf.loadGraphModel('/ml-model/model.json'),
    90_000,
    'detector load',
  );
}

export async function detectProducts(
  canvas: HTMLCanvasElement,
): Promise<DetectedProduct[]> {
  if (!detector) throw new Error('Call loadDetector() before detectProducts()');

  // Input: [1, 640, 640, 3] float32 in [0, 1]
  const imgTensor = tf.browser
    .fromPixels(canvas)
    .toFloat()
    .div(255)
    .expandDims(0) as tf.Tensor4D;

  // Raw output: [1, 28, 8400]
  // Indices 0–3: cx, cy, w, h in pixels (0–640)
  // Indices 4–27: per-class sigmoid scores (0–1)
  const rawOutput = detector.predict(imgTensor) as tf.Tensor3D;
  imgTensor.dispose();

  const pred       = rawOutput.squeeze([0]) as tf.Tensor2D; // [28, 8400]
  rawOutput.dispose();
  const transposed = pred.transpose() as tf.Tensor2D;       // [8400, 28]
  pred.dispose();

  const rawBoxes    = transposed.slice([0, 0], [-1, 4]) as tf.Tensor2D; // [8400, 4]
  const classScores = transposed.slice([0, 4], [-1, -1]) as tf.Tensor2D; // [8400, 24]
  transposed.dispose();

  const maxScores = classScores.max(1) as tf.Tensor1D;   // [8400]
  const classIds  = classScores.argMax(1) as tf.Tensor1D; // [8400]
  classScores.dispose();

  // Convert cx,cy,w,h (pixels) → [y1, x1, y2, x2] normalized for tf.image.nonMaxSuppression
  const nmsBoxes = tf.tidy((): tf.Tensor2D => {
    const s  = MODEL_INPUT_SIZE;
    const cx = rawBoxes.slice([0, 0], [-1, 1]).squeeze([1]).div(s) as tf.Tensor1D;
    const cy = rawBoxes.slice([0, 1], [-1, 1]).squeeze([1]).div(s) as tf.Tensor1D;
    const bw = rawBoxes.slice([0, 2], [-1, 1]).squeeze([1]).div(s) as tf.Tensor1D;
    const bh = rawBoxes.slice([0, 3], [-1, 1]).squeeze([1]).div(s) as tf.Tensor1D;
    return tf.stack(
      [cy.sub(bh.div(2)), cx.sub(bw.div(2)), cy.add(bh.div(2)), cx.add(bw.div(2))],
      1,
    ) as tf.Tensor2D;
  });

  const selectedIdx = await tf.image.nonMaxSuppressionAsync(
    nmsBoxes,
    maxScores,
    MAX_DETECTIONS,
    IOU_THRESHOLD,
    CONF_THRESHOLD,
  );
  nmsBoxes.dispose();

  const gatheredBoxes   = rawBoxes.gather(selectedIdx);
  const gatheredScores  = maxScores.gather(selectedIdx);
  const gatheredClasses = classIds.gather(selectedIdx);

  const [boxData, scoreData, classData] = await Promise.all([
    gatheredBoxes.array()   as Promise<number[][]>,
    gatheredScores.array()  as Promise<number[]>,
    gatheredClasses.array() as Promise<number[]>,
  ]);

  gatheredBoxes.dispose();
  gatheredScores.dispose();
  gatheredClasses.dispose();
  rawBoxes.dispose();
  maxScores.dispose();
  classIds.dispose();
  selectedIdx.dispose();

  const s = MODEL_INPUT_SIZE;
  return scoreData.map((confidence, i) => {
    const [cxPx, cyPx, wPx, hPx] = boxData[i];
    return {
      bbox: {
        x: (cxPx - wPx / 2) / s,
        y: (cyPx - hPx / 2) / s,
        w: wPx / s,
        h: hPx / s,
      },
      classIndex: classData[i],
      label: SCAN_LABELS[classData[i]],
      confidence,
    };
  });
}
