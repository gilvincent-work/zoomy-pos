import { loadClassifier, classifyImage, DetectionResult } from '../../../utils/scan-to-cart/classifier';

// classifier.ts is the native stub — we test it here
describe('classifier (native stub)', () => {
  it('loadClassifier throws with a helpful message', async () => {
    await expect(loadClassifier()).rejects.toThrow(
      'Product scanning is only available in the mobile web app'
    );
  });

  it('classifyImage throws with a helpful message', async () => {
    const fakeCanvas = {} as HTMLCanvasElement;
    await expect(classifyImage(fakeCanvas)).rejects.toThrow(
      'Product scanning is only available in the mobile web app'
    );
  });
});
