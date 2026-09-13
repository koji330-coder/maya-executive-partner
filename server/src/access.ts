/**
 * Checks that a request came through Cloudflare Access.
 *
 * Access sits in front of the Worker and turns away anyone without a valid
 * service token. This is the second lock behind it, for the gap Access leaves
 * open by configuration mistake: the first deploy goes out before the Access
 * application exists, a policy can be edited too broadly, the workers.dev
 * address can be reached some other way. Each of those would otherwise leave the
 * president's keys and memory open to anyone who found the URL.
 *
 * It fails closed. Until the Access application's audience tag is configured,
 * every request is refused, so deploying first and protecting second never
 * leaves a window.
 *
 * Access signs a JWT for each request it lets through and passes it in
 * `Cf-Access-Jwt-Assertion`. Verifying it means checking the RS256 signature
 * against the team's published keys, the audience (this application, not some
 * other Access app on the same team), the issuer, and the time window.
 */

export interface AccessEnv {
  /** `https://<team>.cloudflareaccess.com`. Not a secret. */
  ACCESS_TEAM_DOMAIN?: string;
  /** The Access application's audience tag. Not a secret. Empty until it exists. */
  ACCESS_AUD?: string;
  /** `true` only in `.dev.vars`, for the local dev server that has no Access in front. */
  ACCESS_DISABLED?: string;
}

export interface JwtParts {
  header: { alg?: string; kid?: string };
  payload: {
    aud?: string | string[];
    iss?: string;
    exp?: number;
    nbf?: number;
    common_name?: string;
    email?: string;
  };
  signingInput: string;
  signature: Uint8Array;
}

/** Tolerated clock difference between Access and the Worker, in seconds. */
const CLOCK_SKEW_SECONDS = 60;
/** How long the team's public keys are trusted before being fetched again. */
const KEY_CACHE_MS = 60 * 60 * 1000;

export class AccessDenied extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccessDenied';
  }
}

export function base64UrlDecode(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function parseJwt(token: string): JwtParts {
  const parts = token.split('.');
  if (parts.length !== 3) throw new AccessDenied('トークンの形が正しくありません。');
  const [h, p, s] = parts as [string, string, string];
  try {
    const decoder = new TextDecoder();
    return {
      header: JSON.parse(decoder.decode(base64UrlDecode(h))),
      payload: JSON.parse(decoder.decode(base64UrlDecode(p))),
      signingInput: `${h}.${p}`,
      signature: base64UrlDecode(s),
    };
  } catch {
    throw new AccessDenied('トークンを読めません。');
  }
}

/** Everything except the signature. Pure, so it can be tested without keys. */
export function validateClaims(
  payload: JwtParts['payload'],
  expected: { aud: string; iss: string },
  nowSeconds: number = Math.floor(Date.now() / 1000),
): void {
  const audiences = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
  if (!audiences.includes(expected.aud)) {
    // A token for a different Access application on the same team, cockpit for
    // example, must not open this one.
    throw new AccessDenied('このサーバー宛てのトークンではありません。');
  }
  if (payload.iss !== expected.iss) throw new AccessDenied('発行元が違います。');
  if (typeof payload.exp !== 'number' || payload.exp + CLOCK_SKEW_SECONDS < nowSeconds) {
    throw new AccessDenied('トークンの期限が切れています。');
  }
  if (typeof payload.nbf === 'number' && payload.nbf - CLOCK_SKEW_SECONDS > nowSeconds) {
    throw new AccessDenied('トークンがまだ有効ではありません。');
  }
}

type KeyLookup = (kid: string) => Promise<CryptoKey | null>;

export async function verifyJwt(
  token: string,
  expected: { aud: string; iss: string },
  lookupKey: KeyLookup,
  subtle: SubtleCrypto = crypto.subtle,
  nowSeconds?: number,
): Promise<JwtParts['payload']> {
  const jwt = parseJwt(token);
  if (jwt.header.alg !== 'RS256') throw new AccessDenied('署名の方式が違います。');
  if (!jwt.header.kid) throw new AccessDenied('鍵の指定がありません。');
  const key = await lookupKey(jwt.header.kid);
  if (!key) throw new AccessDenied('署名の鍵が見つかりません。');
  const valid = await subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    jwt.signature,
    new TextEncoder().encode(jwt.signingInput),
  );
  if (!valid) throw new AccessDenied('署名が正しくありません。');
  validateClaims(jwt.payload, expected, nowSeconds);
  return jwt.payload;
}

interface CachedKeys {
  team: string;
  fetchedAt: number;
  keys: Map<string, CryptoKey>;
}

let cache: CachedKeys | null = null;

async function fetchTeamKeys(team: string): Promise<Map<string, CryptoKey>> {
  const response = await fetch(`${team}/cdn-cgi/access/certs`);
  if (!response.ok) throw new AccessDenied('Access の公開鍵を取得できませんでした。');
  const body = (await response.json()) as { keys?: (JsonWebKey & { kid?: string })[] };
  const keys = new Map<string, CryptoKey>();
  for (const jwk of body.keys ?? []) {
    if (!jwk.kid) continue;
    keys.set(
      jwk.kid,
      await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']),
    );
  }
  return keys;
}

/** Keys are cached, and fetched again once if a token names a key not yet seen (rotation). */
function teamKeyLookup(team: string): KeyLookup {
  return async (kid) => {
    const fresh = cache && cache.team === team && Date.now() - cache.fetchedAt < KEY_CACHE_MS;
    if (!fresh || !cache?.keys.has(kid)) {
      cache = { team, fetchedAt: Date.now(), keys: await fetchTeamKeys(team) };
    }
    return cache.keys.get(kid) ?? null;
  };
}

/**
 * Null when the request may proceed, otherwise the response to send.
 *
 * The reason is deliberately vague to the caller. Telling an unauthenticated
 * visitor which check failed would help nobody but someone probing.
 */
export async function checkAccess(request: Request, env: AccessEnv): Promise<Response | null> {
  if (env.ACCESS_DISABLED === 'true') {
    return null;
  }
  const team = env.ACCESS_TEAM_DOMAIN?.trim().replace(/\/+$/, '');
  const aud = env.ACCESS_AUD?.trim();
  if (!team || !aud) {
    return deny();
  }
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) {
    return deny();
  }
  try {
    await verifyJwt(token, { aud, iss: team }, teamKeyLookup(team));
    return null;
  } catch {
    return deny();
  }
}

function deny(): Response {
  return new Response(JSON.stringify({ error: { kind: 'forbidden', message: 'Forbidden' } }), {
    status: 403,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
