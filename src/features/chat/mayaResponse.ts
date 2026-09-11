import {
  MAYA_EMOTIONS,
  MAYA_POSES,
  MAYA_SCENES,
  type MayaEmotion,
  type MayaPose,
  type MayaScene,
} from '@/features/character/mayaTypes';

/**
 * The structured reply MAYA returns, exactly as `docs/AI_RESPONSE_CONTRACT.md`
 * defines it.
 *
 * Nothing downstream reads the prose to decide how MAYA should look or what to
 * save. The character, the decision card and the voice trigger are all driven by
 * these fields.
 */
export type VoiceStyle = 'warm' | 'calm_serious' | 'playful' | 'encouraging';

export interface MayaOption {
  label: string;
  recommended?: boolean;
}

export interface MayaResponse {
  message: string;
  summary?: string;
  emotion: MayaEmotion;
  pose: MayaPose;
  scene: MayaScene;
  voice: {
    shouldPlay: boolean;
    fixedClipKey?: string;
    style?: VoiceStyle;
  };
  options?: MayaOption[];
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

/**
 * A reply either arrives usable or it does not.
 *
 * `warnings` covers what was repaired rather than rejected: an emotion the
 * contract does not list still leaves a perfectly good answer to show, so it is
 * replaced with a safe value and recorded. Phase 3 decides whether to surface
 * repairs, retry, or let them pass; the validator only reports them.
 */
export type ValidationResult =
  | { ok: true; value: MayaResponse; warnings: string[] }
  | { ok: false; errors: string[] };

const VOICE_STYLES: readonly VoiceStyle[] = ['warm', 'calm_serious', 'playful', 'encouraging'];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pickEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
  field: string,
  warnings: string[],
): T {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  warnings.push(
    value === undefined
      ? `${field} was missing; using "${fallback}".`
      : `${field} was ${JSON.stringify(value)}, which the contract does not list; using "${fallback}".`,
  );
  return fallback;
}

function readOptions(value: unknown, warnings: string[]): MayaOption[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    warnings.push('options was not an array; dropped.');
    return undefined;
  }
  const options: MayaOption[] = [];
  for (const entry of value) {
    if (isObject(entry) && typeof entry.label === 'string' && entry.label.trim()) {
      options.push({ label: entry.label.trim(), recommended: entry.recommended === true });
    } else {
      warnings.push('An option without a usable label was dropped.');
    }
  }
  if (options.length === 0) {
    return undefined;
  }
  if (options.length > 3) {
    warnings.push(`${options.length} options were returned; keeping the first three.`);
    options.length = 3;
  }
  // The advisor protocol says recommend one, so a bare list gets the last option
  // marked rather than being shown as an unresolved menu.
  const recommended = options.filter((option) => option.recommended);
  if (recommended.length === 0) {
    warnings.push('No option was marked recommended; marking the last one.');
    options[options.length - 1]!.recommended = true;
  } else if (recommended.length > 1) {
    warnings.push('More than one option was marked recommended; keeping the first.');
    let seen = false;
    for (const option of options) {
      if (option.recommended && seen) {
        option.recommended = false;
      } else if (option.recommended) {
        seen = true;
      }
    }
  }
  return options;
}

function readDetected(
  value: unknown,
  field: string,
  warnings: string[],
): { detected: boolean; title?: string; reason?: string; dueDate?: string | null } | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isObject(value)) {
    warnings.push(`${field} was not an object; dropped.`);
    return undefined;
  }
  const detected = value.detected === true;
  const title = typeof value.title === 'string' && value.title.trim() ? value.title.trim() : undefined;
  if (detected && !title) {
    warnings.push(`${field}.detected was true without a title; treating it as not detected.`);
    return { detected: false };
  }
  return {
    detected,
    ...(title ? { title } : {}),
    ...(typeof value.reason === 'string' && value.reason.trim()
      ? { reason: value.reason.trim() }
      : {}),
    ...(typeof value.dueDate === 'string' || value.dueDate === null
      ? { dueDate: value.dueDate as string | null }
      : {}),
  };
}

/**
 * Turns an untrusted payload into a `MayaResponse`, or explains why it cannot.
 *
 * Only a missing or empty `message` is fatal: without something to say there is
 * no reply to render. Everything else has a defensible default, so a model that
 * gets one enum wrong still produces a usable turn instead of an error screen.
 */
export function validateMayaResponse(payload: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isObject(payload)) {
    return { ok: false, errors: ['The response was not a JSON object.'] };
  }

  const message = typeof payload.message === 'string' ? payload.message.trim() : '';
  if (!message) {
    errors.push('message is required and must be a non-empty string.');
  }

  const voiceRaw = isObject(payload.voice) ? payload.voice : undefined;
  if (payload.voice !== undefined && !voiceRaw) {
    warnings.push('voice was not an object; treating it as silent.');
  }
  const fixedClipKey =
    typeof voiceRaw?.fixedClipKey === 'string' && voiceRaw.fixedClipKey.trim()
      ? voiceRaw.fixedClipKey.trim()
      : undefined;
  const shouldPlay = voiceRaw?.shouldPlay === true;
  if (shouldPlay && !fixedClipKey) {
    warnings.push('voice.shouldPlay was true without a fixedClipKey; staying silent.');
  }
  const style =
    typeof voiceRaw?.style === 'string' && VOICE_STYLES.includes(voiceRaw.style as VoiceStyle)
      ? (voiceRaw.style as VoiceStyle)
      : undefined;

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const value: MayaResponse = {
    message,
    ...(typeof payload.summary === 'string' && payload.summary.trim()
      ? { summary: payload.summary.trim() }
      : {}),
    emotion: pickEnum<MayaEmotion>(payload.emotion, MAYA_EMOTIONS, 'neutral', 'emotion', warnings),
    pose: pickEnum<MayaPose>(payload.pose, MAYA_POSES, 'default', 'pose', warnings),
    scene: pickEnum<MayaScene>(payload.scene, MAYA_SCENES, 'work', 'scene', warnings),
    voice: {
      shouldPlay: shouldPlay && Boolean(fixedClipKey),
      ...(fixedClipKey ? { fixedClipKey } : {}),
      ...(style ? { style } : {}),
    },
  };

  const options = readOptions(payload.options, warnings);
  if (options) {
    value.options = options;
  }
  const decision = readDetected(payload.decision, 'decision', warnings);
  if (decision) {
    value.decision = { detected: decision.detected, ...(decision.title ? { title: decision.title } : {}), ...(decision.reason ? { reason: decision.reason } : {}) };
  }
  const nextAction = readDetected(payload.nextAction, 'nextAction', warnings);
  if (nextAction) {
    value.nextAction = {
      detected: nextAction.detected,
      ...(nextAction.title ? { title: nextAction.title } : {}),
      ...(nextAction.dueDate !== undefined ? { dueDate: nextAction.dueDate } : {}),
    };
  }
  if (typeof payload.followUpQuestion === 'string' && payload.followUpQuestion.trim()) {
    value.followUpQuestion = payload.followUpQuestion.trim();
  } else if (payload.followUpQuestion === null) {
    value.followUpQuestion = null;
  }

  return { ok: true, value, warnings };
}
