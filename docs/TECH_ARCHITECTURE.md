# Technical Architecture — MAYA v0.1

## 1. Client

Preferred stack:

- Expo
- React Native
- TypeScript
- EAS Build

Reasons:

- iOS-first while retaining future Android optionality
- compatible with Windows-centered development workflow
- simple iteration and cloud builds

## 2. Client modules

Suggested structure:

```text
src/
├ app/
├ components/
├ features/
│  ├ character/
│  ├ chat/
│  ├ company/
│  ├ decisions/
│  └ today/
├ services/
│  ├ api/
│  ├ audio/
│  ├ storage/
│  └ telemetry/
├ state/
├ types/
└ utils/
```

## 3. Character engine

The character engine must be isolated from chat logic.

Core interface:

```ts
export type MayaEmotion =
  | 'neutral'
  | 'smile'
  | 'thinking'
  | 'serious'
  | 'challenge'
  | 'annoyed'
  | 'happy'
  | 'concerned'
  | 'relaxed'
  | 'wink';

export type MayaActivity =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking';

export type MayaPose =
  | 'default'
  | 'thinking'
  | 'arms_crossed'
  | 'lean_forward'
  | 'coffee'
  | 'tablet'
  | 'relaxed';
```

Character renderer should consume state such as:

```ts
interface MayaVisualState {
  emotion: MayaEmotion;
  activity: MayaActivity;
  pose: MayaPose;
  scene: 'morning' | 'work' | 'strategy' | 'casual' | 'late_night';
  isSpeaking: boolean;
}
```

## 4. Blink engine

Client-only.

Guideline:

- random blink interval: 3–7 seconds
- occasional double blink
- sequence: open → half → closed → half → open
- total ~250–350ms

Do not synchronize blinking through the backend.

## 5. Breathing

Client-only.

Use a subtle repeating transform on upper body or complete character group.

Recommended starting point:

- 3–4 second cycle
- scaleY around 1.000 → 1.006 → 1.000

Must remain visually subtle.

## 6. Lip sync

v0.1 uses amplitude-based 3-state lip sync:

- closed
- small
- open

Audio playback should expose amplitude buckets over time.

Lip sync implementation must be abstracted so it can later support visemes without rewriting the character system.

## 7. Audio

Two categories:

### Fixed premium lines
Rendered offline with OmniVoice Studio and shipped as assets.

Examples:

- おはようございます、Gakky。
- Gakky、それは私は反対です。
- ちょっと待ってください。
- 数字を見てみましょう。

### Dynamic response speech
Not required in v0.1.

The architecture must leave room for future real-time TTS.

## 8. Local storage

Use SQLite for:

- local settings
- cached conversations
- cached company profile
- cached decisions
- offline app resilience

The backend remains source-of-truth for cloud-synced user data once authentication is introduced.

## 9. Backend

Simple API service responsible for:

- LLM requests
- system prompt
- company-context injection
- decision extraction
- structured response validation
- persistence

Recommended initial backend:

- Supabase/Postgres or equivalent
- edge/server functions acceptable

Do not call model providers directly from the client in production.

## 10. Security principles

- no provider API keys bundled in iOS app
- server-side secrets only
- user company data scoped by user/account
- logs must avoid unnecessarily storing raw secrets or credentials
