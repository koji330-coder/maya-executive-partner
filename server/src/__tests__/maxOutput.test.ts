import { DEFAULT_MAX_OUTPUT_TOKENS } from '@/services/llm/geminiClient';

import { readMaxOutputTokens } from '../chat';

describe('readMaxOutputTokens', () => {
  it('keeps today\'s cap when nothing is set', () => {
    expect(readMaxOutputTokens(undefined)).toBe(DEFAULT_MAX_OUTPUT_TOKENS);
    expect(DEFAULT_MAX_OUTPUT_TOKENS).toBe(2048);
  });

  it('takes a sensible number', () => {
    expect(readMaxOutputTokens('8192')).toBe(8192);
  });

  it('falls back rather than send a cap the model would refuse or a typo would make silly', () => {
    for (const bad of ['', 'abc', '12.5', '-1', '0', '100', '999999']) {
      expect(readMaxOutputTokens(bad)).toBe(DEFAULT_MAX_OUTPUT_TOKENS);
    }
  });
});
