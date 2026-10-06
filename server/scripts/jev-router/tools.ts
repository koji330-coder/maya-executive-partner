/**
 * The tools the router chooses between — imported from the production
 * declarations, not copied, so the eval always sees the same names and
 * descriptions Gemini sees. Only name and description go to the router; nothing
 * here runs a tool.
 */
import { FITLOG_TOOLS } from '../../src/fitlog.ts';
import { HAKSAI_ADS_TOOL, HAKSAI_INVENTORY_TOOL, HAKSAI_MARKET_TOOL, HAKSAI_SALES_TOOL } from '../../src/haksai.ts';
import { SEARCH_MEMORY_TOOL } from '../../src/memory/search.ts';
import { VOICE_TOOLS } from '../../src/voicebox.ts';
import type { ToolDeclaration } from '@/services/llm/geminiClient';

export const NONE = 'none';

export interface RouterTool {
  name: string;
  description: string;
}

/** Same order chat.ts builds allAvailableTools in, with every source connected. */
export const TOOL_DECLARATIONS: ToolDeclaration[] = [
  SEARCH_MEMORY_TOOL,
  HAKSAI_INVENTORY_TOOL,
  HAKSAI_SALES_TOOL,
  HAKSAI_ADS_TOOL,
  HAKSAI_MARKET_TOOL,
  ...FITLOG_TOOLS,
  ...VOICE_TOOLS,
];

export const EVAL_TOOLS: RouterTool[] = TOOL_DECLARATIONS.map(({ name, description }) => ({ name, description }));

export const OPTIONS: string[] = [...EVAL_TOOLS.map((tool) => tool.name), NONE];

export type Domain = 'memory' | 'haksai' | 'fitlog' | 'voice' | 'none';

export function domainOf(tool: string): Domain {
  if (tool === SEARCH_MEMORY_TOOL.name) return 'memory';
  if (tool.startsWith('haksai_')) return 'haksai';
  if (tool.startsWith('fitlog_')) return 'fitlog';
  if (tool.startsWith('voice_')) return 'voice';
  return 'none';
}
