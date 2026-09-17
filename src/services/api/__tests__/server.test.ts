import { asLlmError } from '@/features/chat/responder';
import { LlmError } from '@/services/llm/geminiClient';

import { normalizeServerUrl, ServerError, toServerError } from '../server';

describe('normalizeServerUrl', () => {
  it('trims what a phone keyboard leaves behind', () => {
    expect(normalizeServerUrl('  http://192.168.11.6:8787/  ')).toBe('http://192.168.11.6:8787');
  });

  it('treats empty as no server, which is the way back to calling Gemini directly', () => {
    expect(normalizeServerUrl('   ')).toBeNull();
  });

  it('refuses an address it could never call, at save time', () => {
    expect(() => normalizeServerUrl('192.168.11.6:8787')).toThrow(ServerError);
    expect(() => normalizeServerUrl('ftp://example.com')).toThrow('http://');
  });
});

describe('toServerError', () => {
  it('keeps the message the server wrote for the president', () => {
    const error = toServerError(400, { error: { kind: 'invalid', message: 'private の記録は保存しません。' } });
    expect(error.message).toBe('private の記録は保存しません。');
    expect(error.status).toBe(400);
    expect(error.serverKind).toBe('invalid');
  });

  it('explains an Access refusal instead of passing on a bare status', () => {
    expect(toServerError(403, null).message).toContain('認証情報');
  });

  it('still says something when the body is not the expected shape', () => {
    expect(toServerError(500, 'oops').message).toContain('500');
  });
});

describe('asLlmError', () => {
  it('turns a server failure into the error the conversation already shows', () => {
    const converted = asLlmError(new ServerError('rejected', '有料キーの1日の上限に達するため', 429, 'limit_reached'));
    expect(converted).toBeInstanceOf(LlmError);
    expect((converted as LlmError).kind).toBe('limit_reached');
    expect((converted as LlmError).message).toContain('上限');
  });

  it('calls an unreachable server a network problem', () => {
    const converted = asLlmError(new ServerError('unreachable', 'MAYAサーバーにつながりません。'));
    expect((converted as LlmError).kind).toBe('network');
  });

  it('leaves a cancel alone so it is not reported as a fault', () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    expect(asLlmError(abort)).toBe(abort);
  });
});
