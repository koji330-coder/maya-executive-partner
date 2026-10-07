import { CONNECTED_TOOLS, READY_TOOLS, TOOL_GROUPS } from '../catalog';

describe('the tool manual', () => {
  it('gives every card a distinct id', () => {
    const ids = CONNECTED_TOOLS.map((tool) => tool.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('groups Amazon by job and keeps FIT LOG and VoiceBox as source cards', () => {
    expect(TOOL_GROUPS.map((group) => group.id)).toEqual(['amazon', 'records']);
    expect(TOOL_GROUPS[0]?.tools.map((tool) => tool.id)).toEqual(['sales', 'inventory', 'market', 'ads', 'forecast', 'adchanges']);
    expect(TOOL_GROUPS[1]?.tools.map((tool) => tool.id)).toEqual(['fitlog', 'voicebox']);
  });

  it('teaches every ready tool: what it does, how to ask, what to watch for, where it comes from', () => {
    for (const tool of READY_TOOLS) {
      expect(tool.can.length).toBeGreaterThan(0);
      expect(tool.ask.length).toBeGreaterThan(1);
      expect(tool.notes.length).toBeGreaterThan(0);
      expect(tool.source).not.toBe('');
      expect(tool.serverTools.length).toBeGreaterThan(0);
    }
  });

  it('promises nothing for a tool that is not connected', () => {
    for (const tool of CONNECTED_TOOLS.filter((item) => item.serverTools.length === 0)) {
      expect(tool.can).toEqual([]);
      expect(tool.ask).toEqual([]);
    }
  });

  it('does not describe the same server tool on two cards', () => {
    const serverTools = READY_TOOLS.flatMap((tool) => tool.serverTools);
    expect(new Set(serverTools).size).toBe(serverTools.length);
  });
});
