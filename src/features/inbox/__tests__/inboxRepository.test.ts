import { isXLink, linkLabel, splitTopic } from '../inboxRepository';

describe('splitTopic', () => {
  it('takes the link out of a copied post and keeps the rest as the body', () => {
    expect(splitTopic('面白い見方だった https://x.com/someone/status/123 あとで読む')).toEqual({
      url: 'https://x.com/someone/status/123',
      body: '面白い見方だった  あとで読む',
    });
  });

  it('accepts a bare link', () => {
    expect(splitTopic('  https://example.com/a  ')).toEqual({ url: 'https://example.com/a', body: null });
  });

  it('accepts text with no link', () => {
    expect(splitTopic('リンクの無いメモ')).toEqual({ url: null, body: 'リンクの無いメモ' });
  });

  it('returns nothing for an empty paste', () => {
    expect(splitTopic('   ')).toEqual({ url: null, body: null });
  });
});

describe('isXLink / linkLabel', () => {
  it('recognises X links, including the old twitter.com ones', () => {
    for (const url of [
      'https://x.com/someone/status/123',
      'https://twitter.com/someone/status/123',
      'https://www.x.com/someone',
      'https://mobile.twitter.com/someone/status/123',
    ]) {
      expect(isXLink(url)).toBe(true);
      expect(linkLabel(url)).toBe('X で開く');
    }
  });

  it('treats everything else as an ordinary link', () => {
    expect(isXLink('https://example.com/x.com')).toBe(false);
    expect(isXLink('https://notx.com/a')).toBe(false);
    expect(linkLabel('https://example.com')).toBe('開く');
  });

  it('does not throw on something that is not a URL', () => {
    expect(isXLink('not a url')).toBe(false);
  });
});
