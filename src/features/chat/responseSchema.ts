import { MAYA_EMOTIONS, MAYA_POSES, MAYA_SCENES } from '@/features/character/mayaTypes';

/**
 * The response contract expressed as a Gemini `responseSchema`.
 *
 * `summary` is in the contract but is deliberately not requested here. Nothing
 * renders it, and asking for it produced a real failure: the model looped inside
 * that field, ran into the output cap, and returned JSON truncated mid-string.
 * Fields nobody reads are not free.
 *
 * Constraining the model is not a substitute for validating what comes back:
 * `validateMayaResponse` still runs on the result. The schema reduces how often
 * a repair is needed; the validator is what keeps a bad turn from reaching the
 * screen.
 */
export const MAYA_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    message: { type: 'string' },
    emotion: { type: 'string', enum: [...MAYA_EMOTIONS] },
    pose: { type: 'string', enum: [...MAYA_POSES] },
    scene: { type: 'string', enum: [...MAYA_SCENES] },
    voice: {
      type: 'object',
      properties: {
        shouldPlay: { type: 'boolean' },
        fixedClipKey: { type: 'string' },
        style: { type: 'string', enum: ['warm', 'calm_serious', 'playful', 'encouraging'] },
      },
      required: ['shouldPlay'],
    },
    options: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          recommended: { type: 'boolean' },
        },
        required: ['label', 'recommended'],
      },
    },
    decision: {
      type: 'object',
      properties: {
        detected: { type: 'boolean' },
        // A hard cap, because asking for a short title in prose did not hold:
        // the model wrote its reasoning about the rule into the field instead.
        title: { type: 'string', maxLength: 60 },
        reason: { type: 'string', maxLength: 300 },
      },
      // Both are required so the model cannot answer by cramming the reasoning
      // into the title, which is what it did when only `detected` was required.
      // When nothing was decided it fills them with empty strings and the
      // validator ignores them.
      required: ['detected', 'title', 'reason'],
    },
    nextAction: {
      type: 'object',
      properties: {
        detected: { type: 'boolean' },
        title: { type: 'string', maxLength: 80 },
      },
      required: ['detected'],
    },
    followUpQuestion: { type: 'string', maxLength: 200 },
  },
  required: ['message', 'emotion', 'pose', 'scene', 'voice'],
  propertyOrdering: [
    'message',
    'emotion',
    'pose',
    'scene',
    'voice',
    'options',
    'decision',
    'nextAction',
    'followUpQuestion',
  ],
} as const;
