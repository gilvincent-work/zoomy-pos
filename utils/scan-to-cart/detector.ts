import type { ScanLabel } from './labels';

export type DetectedProduct = {
  bbox: { x: number; y: number; w: number; h: number };
  classIndex: number;
  label: ScanLabel;
  confidence: number;
};

const MSG =
  'Product scanning is only available in the mobile web app. Open zoomy-pos in your mobile browser and use Add to Home Screen.';

export async function loadDetector(): Promise<void> {
  throw new Error(MSG);
}

export async function detectProducts(
  _canvas: HTMLCanvasElement,
): Promise<DetectedProduct[]> {
  throw new Error(MSG);
}
