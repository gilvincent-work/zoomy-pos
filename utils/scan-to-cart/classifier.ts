import type { ScanLabel } from './labels';

export type DetectionResult = {
  label: ScanLabel;
  confidence: number;
  classIndex: number;
};

const MSG = 'Product scanning is only available in the mobile web app. Open zoomy-pos in your mobile browser and use Add to Home Screen.';

export async function loadClassifier(): Promise<void> {
  throw new Error(MSG);
}

export async function classifyImage(_canvas: HTMLCanvasElement): Promise<DetectionResult[]> {
  throw new Error(MSG);
}
