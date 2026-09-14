import { generateMayaResponse, MAX_TOOL_ROUNDS, type ToolDeclaration } from '../geminiClient';

const TOOL: ToolDeclaration = { name: 'search_memory', description: 'x', parameters: { type: 'object' } };
const ANSWER = { message: '去年の春に決めていました。' };

function reply(parts: Record<string, unknown>[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { role: 'model', parts }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
    }),
  };
}
const call = (keywords: string[]) => reply([{ functionCall: { name: 'search_memory', args: { keywords } }, thoughtSignature: 'sig' }]);
const final = () => reply([{ text: JSON.stringify(ANSWER) }]);

const bodies = (fetchMock: jest.Mock) => fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body));

describe('generateMayaResponse with tools', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  const base = { apiKey: 'k', systemPrompt: 's', history: [], message: '前に値上げの話をしたよね？' };

  it('runs the tool, returns the model turn untouched, and answers', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(call(['値上げ'])).mockResolvedValueOnce(final());
    global.fetch = fetchMock as unknown as typeof fetch;
    const runTool = jest.fn().mockResolvedValue({ hits: [] });

    const result = await generateMayaResponse({ ...base, tools: [TOOL], runTool });

    expect(result.payload).toEqual(ANSWER);
    expect(runTool).toHaveBeenCalledWith({ name: 'search_memory', args: { keywords: ['値上げ'] } });
    expect(result.toolCalls).toHaveLength(1);
    expect(result.totalTokens).toBe(30);
    const second = bodies(fetchMock)[1];
    // The thought signature survives, or Gemini 3 rejects the follow-up.
    expect(second.contents.at(-2).parts[0].thoughtSignature).toBe('sig');
    expect(second.contents.at(-1).parts[0].functionResponse).toEqual({
      name: 'search_memory',
      response: { result: { hits: [] } },
    });
  });

  it('withdraws the tools after the last round so the model has to answer', async () => {
    const fetchMock = jest.fn();
    for (let i = 0; i < MAX_TOOL_ROUNDS; i += 1) fetchMock.mockResolvedValueOnce(call([`語${i}`]));
    fetchMock.mockResolvedValueOnce(final());
    global.fetch = fetchMock as unknown as typeof fetch;

    await generateMayaResponse({ ...base, tools: [TOOL], runTool: async () => ({}) });

    const sent = bodies(fetchMock);
    expect(sent).toHaveLength(MAX_TOOL_ROUNDS + 1);
    expect(sent[0].tools).toBeDefined();
    expect(sent.at(-1).tools).toBeUndefined();
  });

  it('tells the model when a tool fails instead of failing the consultation', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(call(['採用'])).mockResolvedValueOnce(final());
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await generateMayaResponse({
      ...base,
      tools: [TOOL],
      runTool: async () => {
        throw new Error('D1 が応答しません');
      },
    });

    expect(result.payload).toEqual(ANSWER);
    expect(bodies(fetchMock)[1].contents.at(-1).parts[0].functionResponse.response.result).toEqual({
      error: 'D1 が応答しません',
    });
  });

  it('forces the first call without JSON mode, then answers on the schema', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(call(['値上げ'])).mockResolvedValueOnce(final());
    global.fetch = fetchMock as unknown as typeof fetch;

    await generateMayaResponse({ ...base, tools: [TOOL], runTool: async () => ({}), requireToolFirst: true });

    const [first, second] = bodies(fetchMock);
    // Gemini rejects forced calling together with a JSON response type.
    expect(first.toolConfig.functionCallingConfig.mode).toBe('ANY');
    expect(first.generationConfig.responseMimeType).toBeUndefined();
    expect(second.toolConfig).toBeUndefined();
    expect(second.generationConfig.responseMimeType).toBe('application/json');
  });

  it('sends no tools when none are given, as the app does', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(final());
    global.fetch = fetchMock as unknown as typeof fetch;
    await generateMayaResponse(base);
    expect(bodies(fetchMock)[0].tools).toBeUndefined();
  });
});
