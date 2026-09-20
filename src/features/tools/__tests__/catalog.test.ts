import { CONNECTED_TOOLS, READY_TOOLS } from '../catalog';

describe('the tool manual', () => {
  it('has one card per tool, each with a distinct id', () => {
    const ids = CONNECTED_TOOLS.map((tool) => tool.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('teaches every ready tool: what it does, how to ask, what to watch for, where it comes from', () => {
    for (const tool of READY_TOOLS) {
      expect(tool.can.length).toBeGreaterThan(0);
      expect(tool.ask.length).toBeGreaterThan(1);
      expect(tool.notes.length).toBeGreaterThan(0);
      expect(tool.source).not.toBe('');
    }
  });

  it('promises nothing for a tool that is not connected', () => {
    for (const tool of CONNECTED_TOOLS.filter((item) => item.serverTool === null)) {
      expect(tool.can).toEqual([]);
      expect(tool.ask).toEqual([]);
    }
  });
});
