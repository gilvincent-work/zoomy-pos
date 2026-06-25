import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';
import { SCAN_LABELS } from './labels';

export type DetectionResult = {
  label: (typeof SCAN_LABELS)[number];
  confidence: number;
  classIndex: number;
};

let model: tf.LayersModel | null = null;

export async function loadClassifier(): Promise<void> {
  if (model) return;
  await tf.ready();
  model = await tf.loadLayersModel('/ml-model/model.json');
}

export async function classifyImage(canvas: HTMLCanvasElement): Promise<DetectionResult[]> {
  if (!model) throw new Error('Call loadClassifier() before classifyImage()');

  const tensor = tf.browser
    .fromPixels(canvas)
    .toFloat()
    .div(255.0)
    .expandDims(0) as tf.Tensor4D; // [1, 224, 224, 3]

  const raw = model.predict(tensor) as tf.Tensor2D;
  const probabilities = await raw.data();

  tensor.dispose();
  raw.dispose();

  return Array.from(probabilities)
    .map((confidence, classIndex) => ({
      label: SCAN_LABELS[classIndex],
      confidence,
      classIndex,
    }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);
}
