import { sha256 } from '../../utils/hash';
import * as Crypto from 'expo-crypto';

describe('sha256', () => {
  it('calls digestStringAsync with SHA256 algorithm', async () => {
    const result = await sha256('0000');
    expect(Crypto.digestStringAsync).toHaveBeenCalledWith(
      Crypto.CryptoDigestAlgorithm.SHA256,
      '0000'
    );
    expect(result).toBe('mock-hash-value');
  });

  it('passes arbitrary input through to digestStringAsync', async () => {
    await sha256('hunter2');
    expect(Crypto.digestStringAsync).toHaveBeenCalledWith(
      Crypto.CryptoDigestAlgorithm.SHA256,
      'hunter2'
    );
  });
});
