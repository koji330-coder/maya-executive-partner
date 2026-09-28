/**
 * What the current MAYA does with the same case, for comparison. SNAPSHOT of the
 * selection logic inline in server/src/chat.ts (as of this commit), with every
 * source connected. It uses the real refersTo* matchers; only the few lines
 * that combine them are copied. If chat.ts changes, update this.
 *
 * Today's routing is two stages: this regex narrows the tools Gemini sees and
 * decides whether a tool call is forced, then Gemini picks the tool. Only the
 * first stage can be measured offline, so the comparison is at that level:
 * is the expected tool still on offer, and is a tool forced when none was right.
 */
import { refersToFitness } from '../../src/fitlog.ts';
import { refersToAmazon } from '../../src/haksai.ts';
import { refersToPast } from '../../src/memory/search.ts';
import { refersToVoice } from '../../src/voicebox.ts';
import type { RouterCase } from './cases.ts';
import { EVAL_TOOLS } from './tools.ts';

export interface BaselineSelection {
  offered: string[];
  forceTool: boolean;
}

const HAKSAI = ['haksai_inventory', 'haksai_sales', 'haksai_market'];
const FITLOG = ['fitlog_day', 'fitlog_progress', 'fitlog_weekly', 'fitlog_exercise'];

export function currentMayaSelection(testCase: RouterCase): BaselineSelection {
  const message = testCase.message;
  // chat.ts reads request.history, which holds both sides of the conversation.
  const history = testCase.context ?? [];
  const askingAboutAmazon = refersToAmazon(message);
  const recentFitnessContext = history.slice(-4).some((turn) => refersToFitness(turn.text));
  const fitnessFollowUp = /^(じゃあ|では|それ|その|先週|今週|昨日|最近|前回|どう|もっと|詳しく)/.test(message.trim());
  const askingAboutFitness = refersToFitness(message) || (fitnessFollowUp && recentFitnessContext);
  const askingAboutRememberedConversation = /覚えて|話した|言ってた|決めた|決めてた|経緯/.test(message);
  const askingAboutVoice = refersToVoice(message);

  let offered = EVAL_TOOLS.map((tool) => tool.name);
  if (askingAboutFitness && !askingAboutRememberedConversation && !askingAboutAmazon) {
    offered = FITLOG;
  } else if (askingAboutAmazon && !refersToPast(message) && !askingAboutFitness) {
    offered = HAKSAI;
  }
  return {
    offered,
    forceTool: refersToPast(message) || askingAboutAmazon || askingAboutFitness || askingAboutVoice,
  };
}
