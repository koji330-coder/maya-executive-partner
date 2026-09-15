import { webcrypto } from 'node:crypto';

import { AccessDenied, checkAccess, validateClaims, verifyJwt } from '../access';

const subtle = webcrypto.subtle as unknown as SubtleCrypto;
const TEAM = 'https://example-team.cloudflareaccess.com';
const AUD = 'maya-app-audience';
const NOW = 1_789_300_000;

function b64url(bytes: Uint8Array | string): string {
  const buf = typeof bytes === 'string' ? Buffer.from(bytes) : Buffer.from(bytes);
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function keyPair() {
  return (await subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
}

async function sign(privateKey: CryptoKey, payload: Record<string, unknown>, header = { alg: 'RS256', kid: 'k1' }) {
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = new Uint8Array(await subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(input)));
  return `${input}.${b64url(signature)}`;
}

const good = { aud: [AUD], iss: TEAM, exp: NOW + 600, nbf: NOW - 10 };

describe('validateClaims', () => {
  it('accepts a token for this application from this team, in time', () => {
    expect(() => validateClaims(good, { aud: AUD, iss: TEAM }, NOW)).not.toThrow();
  });

  it('refuses a token issued for another Access application on the same team', () => {
    // cockpit's token must not open MAYA.
    expect(() => validateClaims({ ...good, aud: ['cockpit-audience'] }, { aud: AUD, iss: TEAM }, NOW)).toThrow(
      AccessDenied,
    );
  });

  it('refuses another issuer, an expired token and one not yet valid', () => {
    expect(() => validateClaims({ ...good, iss: 'https://evil.cloudflareaccess.com' }, { aud: AUD, iss: TEAM }, NOW)).toThrow();
    expect(() => validateClaims({ ...good, exp: NOW - 120 }, { aud: AUD, iss: TEAM }, NOW)).toThrow('期限');
    expect(() => validateClaims({ ...good, nbf: NOW + 120 }, { aud: AUD, iss: TEAM }, NOW)).toThrow('まだ有効');
  });

  it('allows the small clock difference between Access and the Worker', () => {
    expect(() => validateClaims({ ...good, exp: NOW - 30 }, { aud: AUD, iss: TEAM }, NOW)).not.toThrow();
  });
});

describe('verifyJwt', () => {
  it('accepts a token signed by the team key', async () => {
    const { privateKey, publicKey } = await keyPair();
    const token = await sign(privateKey, good);
    await expect(verifyJwt(token, { aud: AUD, iss: TEAM }, async () => publicKey, subtle, NOW)).resolves.toMatchObject({
      iss: TEAM,
    });
  });

  it('refuses a token signed by any other key', async () => {
    const team = await keyPair();
    const attacker = await keyPair();
    const token = await sign(attacker.privateKey, good);
    await expect(verifyJwt(token, { aud: AUD, iss: TEAM }, async () => team.publicKey, subtle, NOW)).rejects.toThrow(
      '署名が正しくありません',
    );
  });

  it('refuses a token whose payload was edited after signing', async () => {
    const { privateKey, publicKey } = await keyPair();
    const token = await sign(privateKey, { ...good, aud: ['cockpit-audience'] });
    const [h, , s] = token.split('.');
    const forged = `${h}.${b64url(JSON.stringify(good))}.${s}`;
    await expect(verifyJwt(forged, { aud: AUD, iss: TEAM }, async () => publicKey, subtle, NOW)).rejects.toThrow();
  });

  it('refuses the "none" algorithm and an unknown key', async () => {
    const { privateKey, publicKey } = await keyPair();
    const none = `${b64url(JSON.stringify({ alg: 'none', kid: 'k1' }))}.${b64url(JSON.stringify(good))}.`;
    await expect(verifyJwt(none, { aud: AUD, iss: TEAM }, async () => publicKey, subtle, NOW)).rejects.toThrow('方式');
    const token = await sign(privateKey, good, { alg: 'RS256', kid: 'unknown' });
    await expect(verifyJwt(token, { aud: AUD, iss: TEAM }, async () => null, subtle, NOW)).rejects.toThrow('鍵');
  });
});

describe('checkAccess', () => {
  const request = (headers: Record<string, string> = {}) => new Request('https://maya.example/health', { headers });

  it('refuses everything until the audience is configured, so an early deploy is safe', async () => {
    const response = await checkAccess(request({ 'Cf-Access-Jwt-Assertion': 'anything' }), {
      ACCESS_TEAM_DOMAIN: TEAM,
      ACCESS_AUD: '',
    });
    expect(response?.status).toBe(403);
  });

  it('refuses a request that did not come through Access', async () => {
    const response = await checkAccess(request(), { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD });
    expect(response?.status).toBe(403);
  });

  it('lets the local dev server through only when explicitly disabled', async () => {
    expect(await checkAccess(request(), { ACCESS_DISABLED: 'true' })).toBeNull();
    expect((await checkAccess(request(), { ACCESS_DISABLED: 'yes' }))?.status).toBe(403);
  });
});
