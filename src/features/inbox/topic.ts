/**
 * Topics brought in from outside MAYA, with nothing attached to storage.
 *
 * Shared by the app and the server (`server/`), so a pasted post is split the
 * same way whichever side receives it.
 */

const X_HOSTS = new Set(['x.com', 'twitter.com', 'mobile.twitter.com', 'mobile.x.com']);

/** A link to X. The old twitter.com links still circulate, so both count. */
export function isXLink(url: string): boolean {
  try {
    return X_HOSTS.has(new URL(url).hostname.replace(/^www\./, ''));
  } catch {
    return false;
  }
}

export function linkLabel(url: string): string {
  return isXLink(url) ? 'X で開く' : '開く';
}

/** Pulls the first URL out of pasted text, so a copied post and a bare link both work. */
export function splitTopic(pasted: string): { url: string | null; body: string | null } {
  const text = pasted.trim();
  const match = text.match(/https?:\/\/\S+/);
  if (!match) {
    return { url: null, body: text || null };
  }
  const rest = text.replace(match[0], '').trim();
  return { url: match[0], body: rest || null };
}
