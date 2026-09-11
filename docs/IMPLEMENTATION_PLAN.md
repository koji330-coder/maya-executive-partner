# Implementation Plan

## Phase 0 — Repo bootstrap

Deliverables:

- Expo TypeScript app boots
- navigation shell
- lint / typecheck
- environment config
- local SQLite initialized

## Phase 1 — Character Runtime

Deliverables:

- MAYA rendered on Talk screen
- blink engine
- breathing engine
- character state machine
- placeholder expression switching
- audio playback abstraction
- lip-sync abstraction

No LLM yet.

## Phase 2 — Local conversation prototype

Deliverables:

- chat composer
- mocked MAYA responses
- structured `MayaResponse`
- visual state changes driven by response JSON
- Decisions UI with local mocked records

## Phase 3 — LLM integration

Deliverables:

- backend endpoint
- system prompt
- structured output validation
- company context injection
- real chat responses
- handling of model/network failures

## Phase 4 — Company Brain

Deliverables:

- onboarding company profile
- edit company facts
- inject facts into model context
- local cache

## Phase 5 — Decisions

Deliverables:

- decision detection
- user confirmation/edit
- persistence
- Decisions screen

## Phase 6 — OmniVoice fixed clips

Deliverables:

- clip manifest
- playback
- lip sync
- selective voice behavior

## Phase 7 — Polish

Deliverables:

- transition tuning
- character state timing
- reduced jank
- error states
- first-run experience
- TestFlight-ready build

## Explicitly deferred

- multi-agent architecture
- Live2D
- real-time TTS
- proactive push notifications
- Google integrations
- document ingestion
- subscription billing
