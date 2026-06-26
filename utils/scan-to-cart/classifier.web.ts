import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';
import { SCAN_LABELS } from './labels';

export type DetectionResult = {
  label: (typeof SCAN_LABELS)[number];
  confidence: number;
  classIndex: number;
};

// Keras 3 exports a Rescaling layer that TF.js doesn't register by default.
// Model was trained with Rescaling(scale=2.0, offset=-1.0) to convert [0,1]→[-1,1].
class RescalingLayer extends tf.layers.Layer {
  private readonly scaleVal: number;
  private readonly offsetVal: number;
  constructor(config: { scale: number; offset: number; name?: string }) {
    super(config as tf.serialization.ConfigDict);
    this.scaleVal = config.scale;
    this.offsetVal = config.offset;
  }
  call(inputs: tf.Tensor | tf.Tensor[]): tf.Tensor {
    const x = Array.isArray(inputs) ? inputs[0] : inputs;
    return x.mul(this.scaleVal).add(this.offsetVal);
  }
  getConfig(): tf.serialization.ConfigDict {
    return { ...super.getConfig(), scale: this.scaleVal, offset: this.offsetVal };
  }
  static get className() { return 'Rescaling'; }
}
tf.serialization.registerClass(RescalingLayer);

// MobileNetV3's hard_swish activation. Keras 3 serializes it as 'hard_silu',
// which TF.js camelCases to 'hardSilu' during deserialization. TF.js 4.22
// does not ship this activation, so we register it manually.
// Formula: x * clip(x + 3, 0, 6) / 6
class HardSilu extends tf.serialization.Serializable {
  apply(x: tf.Tensor): tf.Tensor {
    return tf.tidy(() => tf.mul(x, tf.div(tf.clipByValue(tf.add(x, 3), 0, 6), 6)));
  }
  getConfig(): tf.serialization.ConfigDict { return {}; }
  static get className(): string { return 'hardSilu'; }
}
tf.serialization.registerClass(HardSilu);

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
