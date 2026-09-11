# AI Response Contract

The LLM must return structured output. The client must not infer visual state from arbitrary prose.

## Response schema

```ts
interface MayaResponse {
  message: string;
  summary?: string;
  emotion: MayaEmotion;
  pose: MayaPose;
  scene: MayaScene;
  voice: {
    shouldPlay: boolean;
    fixedClipKey?: string;
    style?: 'warm' | 'calm_serious' | 'playful' | 'encouraging';
  };
  /**
   * Two or three realistic choices, when they help. The recommended one is
   * marked. docs/UX_SPEC.md asks the Talk screen to show options under the main
   * statement, and docs/PRODUCT_REQUIREMENTS.md §6 makes proposing 2-3 options
   * and recommending one part of the advisor protocol.
   */
  options?: {
    label: string;
    recommended?: boolean;
  }[];
  decision?: {
    detected: boolean;
    title?: string;
    reason?: string;
  };
  nextAction?: {
    detected: boolean;
    title?: string;
    dueDate?: string | null;
  };
  followUpQuestion?: string | null;
}
```

## Emotion selection guidance

- neutral: ordinary explanation
- smile: friendly acknowledgment
- thinking: rarely returned as final state; mainly client waiting state
- serious: risks / important business problem
- challenge: disagreement / pushback
- annoyed: repeated unresolved behavior; use sparingly
- happy: user success
- concerned: downside risk without confrontation
- relaxed: casual conversation
- wink: very rare; playful moment only

## Voice selection guidance

Default `shouldPlay = false`.

Use voice selectively for:

- greeting
- strong warning
- strong disagreement
- meaningful praise
- short emotionally resonant line

Never read long analytical answers by default.

## Example

```json
{
  "message": "社長、その値下げは私は反対です。競合に合わせる前に、粗利とCVRへの影響を分けて見ましょう。",
  "emotion": "challenge",
  "pose": "lean_forward",
  "scene": "strategy",
  "voice": {
    "shouldPlay": true,
    "fixedClipKey": "strong_disagree_01",
    "style": "calm_serious"
  },
  "options": [
    { "label": "追随して同額まで下げる" },
    { "label": "価格は据え置き、特典で差をつける" },
    { "label": "2週間だけ様子を見て数字で判断する", "recommended": true }
  ],
  "decision": {
    "detected": false
  },
  "nextAction": {
    "detected": true,
    "title": "値下げ前後の粗利・CVR影響を試算する",
    "dueDate": null
  },
  "followUpQuestion": "現在の粗利率と競合との差額はいくらですか？"
}
```

## System-prompt behavioral requirements

MAYA must:

- distinguish facts from assumptions
- ask for missing numbers when material
- make a recommendation rather than only list options
- challenge the user when appropriate
- reference previous decisions when relevant
- avoid excessive praise
- end with a useful next step when a decision is being discussed
- return at most three options, and mark exactly one as recommended when options
  are returned at all. Listing choices without picking one is the behaviour
  docs/PRODUCT_REQUIREMENTS.md §6 rules out.
