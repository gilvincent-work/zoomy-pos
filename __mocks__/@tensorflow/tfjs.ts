const mockPredict = jest.fn().mockReturnValue({
  data: jest.fn().mockResolvedValue(new Float32Array(24).fill(0)),
  dispose: jest.fn(),
});

export const ready = jest.fn().mockResolvedValue(undefined);
export const loadLayersModel = jest.fn().mockResolvedValue({ predict: mockPredict });
export const browser = {
  fromPixels: jest.fn().mockReturnValue({
    toFloat: jest.fn().mockReturnThis(),
    div: jest.fn().mockReturnThis(),
    expandDims: jest.fn().mockReturnThis(),
    dispose: jest.fn(),
  }),
};
export const dispose = jest.fn();
