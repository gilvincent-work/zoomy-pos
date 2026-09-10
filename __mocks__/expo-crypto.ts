export const CryptoDigestAlgorithm = { SHA256: 'SHA-256' };
export const digestStringAsync = jest.fn().mockResolvedValue('mock-hash-value');
let _uuidSeq = 0;
export const randomUUID = jest.fn(() => `00000000-0000-4000-8000-${String(++_uuidSeq).padStart(12, '0')}`);
