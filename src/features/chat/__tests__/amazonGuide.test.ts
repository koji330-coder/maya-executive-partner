import { AMAZON_GUIDE, buildSystemPrompt } from '../systemPrompt';

describe('the Amazon guide in the prompt', () => {
  it('is left out unless the server can actually read Amazon', () => {
    expect(buildSystemPrompt(undefined, [], new Date(), undefined, true, false)).not.toContain('haksai_inventory');
    expect(buildSystemPrompt(undefined, [], new Date(), undefined, true)).not.toContain('haksai_inventory');
  });

  it('is offered when it can, and says to read before asking to be shown the screen', () => {
    const prompt = buildSystemPrompt(undefined, [], new Date(), undefined, true, true);
    expect(prompt).toContain(AMAZON_GUIDE);
    expect(AMAZON_GUIDE).toContain('画面やデータを見せてほしいと頼む前に、まず道具で読みます');
  });

  it('makes the caveat travel with the number, and forbids filling a gap', () => {
    expect(AMAZON_GUIDE).toContain('月の途中');
    expect(AMAZON_GUIDE).toContain('推測で足しません');
  });
});
