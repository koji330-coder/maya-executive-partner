import { requireOptionalNativeModule } from 'expo';
import { Platform, Share } from 'react-native';

/** How the text left the app: straight to the clipboard, or through the share sheet. */
export type CopyOutcome = 'copied' | 'shared' | 'failed';

/**
 * Puts text on the clipboard.
 *
 * expo-clipboard carries native code, so it only works in a build made after it
 * was added. An OTA update reaches older builds too, and importing the package
 * there throws at load. So it is required only once the native half is known to
 * be present; until then the share sheet stands in — it has a コピー button, and
 * Share is part of React Native itself.
 */
export async function copyText(text: string): Promise<CopyOutcome> {
  try {
    if (Platform.OS === 'web') {
      await navigator.clipboard.writeText(text);
      return 'copied';
    }
    if (requireOptionalNativeModule('ExpoClipboard')) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Clipboard = require('expo-clipboard') as typeof import('expo-clipboard');
      await Clipboard.setStringAsync(text);
      return 'copied';
    }
    await Share.share({ message: text });
    return 'shared';
  } catch {
    return 'failed';
  }
}

export type MessageSegment = { kind: 'text'; text: string } | { kind: 'code'; text: string; language: string };

const FENCE = /```([^\n`]*)\n?([\s\S]*?)```/g;

/**
 * Splits a reply into prose and fenced code blocks, so each block can carry its
 * own copy button. Only closed fences count: a reply cut off mid-block stays
 * prose rather than swallowing everything after the opening fence.
 */
export function splitCodeBlocks(message: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  let last = 0;
  for (const match of message.matchAll(FENCE)) {
    const before = message.slice(last, match.index).trim();
    if (before) segments.push({ kind: 'text', text: before });
    segments.push({ kind: 'code', language: (match[1] ?? '').trim(), text: (match[2] ?? '').replace(/\n$/, '') });
    last = match.index + match[0].length;
  }
  const rest = message.slice(last).trim();
  if (rest) segments.push({ kind: 'text', text: rest });
  return segments;
}
