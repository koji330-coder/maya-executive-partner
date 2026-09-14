import { webcrypto } from 'node:crypto';

import type { Env } from '../env';
import { ApiError } from '../http';
import { decryptKey, encryptKey, readKeyText, readTier } from '../memory/apiKeys';

const subtle = webcrypto.subtle as unknown as SubtleCrypto;
const kek = () => Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString('base64');
const env = (key?: string) => ({ KEY_ENCRYPTION_KEY: key }) as Env;
const KEY = 'AIzaSyExampleExampleExample1234';

beforeAll(() => {
  // jest-expo's environment may not expose Web Crypto globally.
  if (!globalThis.crypto?.getRandomValues) {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  }
});

describe('key encryption', () => {
  it('round-trips, and the stored form does not contain the key', async () => {
    const e = env(kek());
    const stored = await encryptKey(e, KEY, subtle);
    expect(stored.ciphertext).not.toContain(KEY);
    await expect(decryptKey(e, stored, subtle)).resolves.toBe(KEY);
  });

  it('cannot be read with a different encryption key', async () => {
    const stored = await encryptKey(env(kek()), KEY, subtle);
    await expect(decryptKey(env(kek()), stored, subtle)).rejects.toThrow();
  });

  it('refuses to store anything when the encryption key is missing or the wrong size', async () => {
    for (const bad of [undefined, Buffer.from('short').toString('base64')]) {
      const error = await encryptKey(env(bad), KEY, subtle).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(503);
    }
  });
});

describe('reading input', () => {
  it('accepts a key with surrounding whitespace and rejects paste mistakes', () => {
    expect(readKeyText(`  ${KEY}\n`)).toBe(KEY);
    expect(() => readKeyText('AIza with spaces inside of it here')).toThrow(ApiError);
    expect(() => readKeyText('short')).toThrow(ApiError);
    expect(() => readKeyText(42)).toThrow(ApiError);
  });

  it('knows only the two tiers', () => {
    expect(readTier('paid')).toBe('paid');
    expect(() => readTier('admin')).toThrow(ApiError);
  });
});
