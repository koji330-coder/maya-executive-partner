# Acceptance Criteria — MAYA v0.1

## Character

- MAYA remains visible during normal Talk-screen use.
- Blink timing is not obviously periodic.
- Breathing is visible only when observed, not distracting.
- Character switches to thinking state within 200ms of send action.
- Expression changes when structured response arrives.
- Mouth returns to closed state after audio ends.

## Chat

- User can send text and receive a valid MAYA response.
- Duplicate send while waiting is prevented.
- Failed requests can be retried without losing typed content.
- Response JSON is schema-validated.

## Company Brain

- User can create and edit company profile.
- Company profile persists across app restart.
- Model responses can reference saved company facts.

## Decisions

- User can save an extracted decision.
- User can edit decision title/reason before save.
- Decisions persist across restart.
- Decisions screen loads without network when cached.

## Audio

- Fixed OmniVoice clips can be played.
- Lip sync reacts while the clip is playing.
- Audio can be stopped.
- Long responses are not automatically voiced.

## UX

- First consultation can be completed without external instructions.
- No screen depends on a placeholder developer control in release mode.
- App is usable on a current iPhone portrait layout.
