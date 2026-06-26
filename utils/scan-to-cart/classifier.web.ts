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

// MobileNetV3's SE hard_sigmoid decomposes as (x+3) then (relu6/6).
// Keras 3 serializes these as Add/Multiply with a scalar second arg, which
// TF.js's merge layers can't handle. We rename them ScalarAdd/ScalarMultiply
// in model.json and register them here.
class ScalarAdd extends tf.layers.Layer {
  private readonly scalar: number;
  constructor(config: { scalar: number; [k: string]: unknown }) {
    super(config as tf.serialization.ConfigDict);
    this.scalar = config.scalar as number;
  }
  call(inputs: tf.Tensor | tf.Tensor[]): tf.Tensor {
    const x = Array.isArray(inputs) ? inputs[0] : inputs;
    return tf.add(x, this.scalar);
  }
  getConfig(): tf.serialization.ConfigDict {
    return { ...super.getConfig(), scalar: this.scalar };
  }
  static get className(): string { return 'ScalarAdd'; }
}
tf.serialization.registerClass(ScalarAdd);

class ScalarMultiply extends tf.layers.Layer {
  private readonly scalar: number;
  constructor(config: { scalar: number; [k: string]: unknown }) {
    super(config as tf.serialization.ConfigDict);
    this.scalar = config.scalar as number;
  }
  call(inputs: tf.Tensor | tf.Tensor[]): tf.Tensor {
    const x = Array.isArray(inputs) ? inputs[0] : inputs;
    return tf.mul(x, this.scalar);
  }
  getConfig(): tf.serialization.ConfigDict {
    return { ...super.getConfig(), scalar: this.scalar };
  }
  static get className(): string { return 'ScalarMultiply'; }
}
tf.serialization.registerClass(ScalarMultiply);

// TF.js 4.22's GlobalAveragePooling2D ignores keepdims=True, always outputting
// a 2D tensor. MobileNetV3's Squeeze-and-Excite blocks need keepdims=True so
// the output stays 4D ([batch,1,1,C]) for the subsequent Conv2D. We overwrite
// the built-in registration — tf.serialization.registerClass silently replaces
// any previously registered class with the same className.
class GlobalAveragePooling2DKeepdims extends tf.layers.Layer {
  private readonly keepdims: boolean;
  private readonly dataFmt: string;

  constructor(config: { keepdims?: boolean; data_format?: string; [k: string]: unknown }) {
    super(config as tf.serialization.ConfigDict);
    this.keepdims = (config.keepdims as boolean) ?? false;
    this.dataFmt = (config.data_format as string) ?? 'channels_last';
  }

  computeOutputShape(inputShape: tf.Shape | tf.Shape[]): tf.Shape | tf.Shape[] {
    const s = inputShape as tf.Shape;
    if (this.keepdims) {
      return this.dataFmt === 'channels_last'
        ? [s[0], 1, 1, s[3]]
        : [s[0], s[1], 1, 1];
    }
    return this.dataFmt === 'channels_last'
      ? [s[0], s[3]]
      : [s[0], s[1]];
  }

  call(inputs: tf.Tensor | tf.Tensor[]): tf.Tensor {
    return tf.tidy(() => {
      const x = (Array.isArray(inputs) ? inputs[0] : inputs) as tf.Tensor4D;
      const axes = this.dataFmt === 'channels_last' ? [1, 2] : [2, 3];
      return tf.mean(x, axes, this.keepdims);
    });
  }

  getConfig(): tf.serialization.ConfigDict {
    return { ...super.getConfig(), keepdims: this.keepdims, data_format: this.dataFmt };
  }

  static get className(): string { return 'GlobalAveragePooling2D'; }
}
tf.serialization.registerClass(GlobalAveragePooling2DKeepdims);

let model: tf.LayersModel | null = null;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms),
    ),
  ]);
}

export async function loadClassifier(): Promise<void> {
  if (model) return;

  await withTimeout(tf.ready(), 15_000, 'tf.ready()');

  const ioHandler = tf.io.http('/ml-model/model.json');
  const artifacts = await withTimeout(
    (ioHandler as { load: () => Promise<tf.io.ModelArtifacts> }).load(),
    60_000,
    'artifact fetch',
  );

  const loaded = await withTimeout(
    tf.loadLayersModel(tf.io.fromMemory(artifacts)),
    60_000,
    'model build',
  );

  model = loaded;
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
