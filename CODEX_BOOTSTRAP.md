# Codex Bootstrap Instruction

You are implementing MAYA, an iOS-first AI executive partner.

Before writing code, read every document in `/docs` and the root `README.md`.

## Immediate objective

Implement **Phase 0 and Phase 1 only** from `docs/IMPLEMENTATION_PLAN.md`.

Do not jump ahead into backend LLM integration.

## Product constraint

MAYA is not a generic chat app with a character pasted on top. The character runtime is a first-class subsystem and must remain isolated from chat/business logic.

## Technical constraints

- Expo
- React Native
- TypeScript
- iOS-first
- must remain buildable through EAS
- avoid native dependencies unless clearly justified
- prefer maintainable code over clever abstractions

## Required initial architecture

Create a clear separation between:

- character visual state
- animation timing
- audio/lip sync
- chat UI
- persistence

At minimum implement:

```text
src/features/character/
  CharacterStage.tsx
  CharacterStateMachine.ts
  BlinkController.ts
  BreathingController.ts
  LipSyncController.ts
  mayaTypes.ts
```

Naming may change if a better architecture is justified, but the separation must remain.

## Placeholder assets

If final MAYA assets are not present, use simple local placeholder layers/shapes. Do not block development waiting for art assets.

The final asset pipeline is defined in `docs/ASSET_PIPELINE.md`.

## Phase 0 acceptance

- app boots
- navigation works
- TypeScript passes
- lint passes
- SQLite bootstrap exists

## Phase 1 acceptance

- Talk screen shows MAYA placeholder character stage
- blink runs at randomized intervals
- breathing animation loops subtly
- state machine supports idle/thinking/speaking
- expression can be changed through a temporary developer control
- audio layer has an interface ready for future OmniVoice files
- lip-sync interface supports three mouth states

## Development behavior

After each phase:

1. run typecheck/lint/tests available in the repo
2. fix failures
3. document what changed in `PROGRESS.md`
4. list remaining known issues

Do not implement deferred features unless explicitly instructed.
