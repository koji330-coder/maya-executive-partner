import { webcrypto } from 'node:crypto';

import type { Env } from '../env';
import {
  checkTypesafeKey,
  deleteTypesafeKey,
  resolveTypesafeKey,
  saveTypesafeKey,
  typesafeKeyStatus,
} from '../memory/typesafeKey';

const kek = () => Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString('base64');
const KEY = 'ts_live_exampleexampleexample9876';

beforeAll(() => {
  // jest-expo's environment may not expose Web Crypto (subtle) globally.
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  }
});

/** server_settings, one row per key. */
function fakeDb() {
  const store = new Map<string, string>();
  const db = {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        first: async () => {
          const value = store.get(args[0] as string);
          return value === undefined ? null : { value };
        },
        run: async () => {
          if (sql.startsWith('DELETE')) store.delete(args[0] as string);
          else store.set(args[0] as string, args[1] as string);
        },
      }),
    }),
  } as unknown as D1Database;
  return { db, store };
}

describe('TypeSafe key', () => {
  it('stores the key encrypted and reads it back', async () => {
    const { db, store } = fakeDb();
    const env = { KEY_ENCRYPTION_KEY: kek() } as Env;
    await saveTypesafeKey(db, env, KEY);
    expect([...store.values()].join('')).not.toContain(KEY);
    await expect(resolveTypesafeKey(db, env)).resolves.toBe(KEY);
    await expect(typesafeKeyStatus(db, env)).resolves.toEqual({ set: true, source: 'app', last4: '9876' });
  });

  it('wins over the Worker secret, which comes back once the entered key is deleted', async () => {
    const { db } = fakeDb();
    const env = { KEY_ENCRYPTION_KEY: kek(), TYPESAFE_API_KEY: 'secret-from-cloudflare-1111' } as Env;
    await saveTypesafeKey(db, env, KEY);
    await expect(resolveTypesafeKey(db, env)).resolves.toBe(KEY);
    await deleteTypesafeKey(db);
    await expect(resolveTypesafeKey(db, env)).resolves.toBe('secret-from-cloudflare-1111');
    await expect(typesafeKeyStatus(db, env)).resolves.toEqual({ set: true, source: 'secret', last4: '1111' });
  });

  it('treats a key it can no longer decrypt as absent', async () => {
    const { db } = fakeDb();
    await saveTypesafeKey(db, { KEY_ENCRYPTION_KEY: kek() } as Env, KEY);
    await expect(resolveTypesafeKey(db, { KEY_ENCRYPTION_KEY: kek() } as Env)).resolves.toBeUndefined();
  });

  it('says nothing is set when there is neither', async () => {
    const { db } = fakeDb();
    await expect(typesafeKeyStatus(db, {} as Env)).resolves.toEqual({ set: false, source: null, last4: null });
  });

  it('checks the key against TypeSafe before it is stored', async () => {
    const respond = (status: number) => (() => Promise.resolve(new Response('{}', { status }))) as unknown as typeof fetch;
    await expect(checkTypesafeKey(KEY, respond(200))).resolves.toEqual({ ok: true });
    await expect(checkTypesafeKey(KEY, respond(401))).resolves.toMatchObject({ ok: false });
    await expect(checkTypesafeKey(KEY, (() => Promise.reject(new TypeError('offline'))) as unknown as typeof fetch)).resolves.toMatchObject({
      ok: false,
    });
  });
});
