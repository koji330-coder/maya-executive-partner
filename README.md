# MAYA — AI Executive Partner

MAYA is an iOS-first AI executive partner for owners and managers of small and mid-sized businesses.

The product deliberately combines two things:

- A visually attractive AI woman users want to open and talk to every day.
- A serious executive-advisor brain that remembers company context, challenges weak decisions, and turns conversations into actions.

The first milestone is not a full business-management platform. It is to prove that a 10-minute conversation with MAYA feels materially better than a generic chatbot for management decisions.

## Product principle

> 見た目は、会いたくなるAI美女。頭脳は、社長に反論できる経営参謀。

## v0.1 target

The first usable iPhone build must support:

- MAYA character on screen
- natural blinking
- subtle breathing motion
- 3-stage lip sync during audio playback
- text chat with an LLM
- structured emotion/state response from the backend
- automatic expression changes
- thinking state while waiting for the model
- fixed high-quality voice clips rendered with OmniVoice Studio
- company profile memory
- decision extraction and storage
- local persistence for conversations and user settings

v0.1 is complete as of 2026-09-13. What comes after it — a Cloudflare server, data from sales, health records, project logs and GitHub — is designed in `docs/PLATFORM_ARCHITECTURE.md`.

Not in v0.1:

- Gmail / Calendar / Drive integration
- multi-agent routing
- Live2D
- full-time voice conversation
- real-time arbitrary TTS generation
- finance document ingestion

## Technical direction

- React Native
- Expo
- TypeScript
- EAS Build
- SQLite for local state/cache
- Backend API for LLM and server-side memory
- PostgreSQL/Supabase is acceptable for the first backend

## Development

```bash
npm install
npm start          # Expo dev server; press i for the iOS simulator
npm run ios        # iOS simulator directly
npm run web        # browser, for fast layout iteration only

npm run check      # typecheck + lint + tests
```

Copy `.env.example` to `.env` and fill in `EXPO_PUBLIC_API_BASE_URL` once the
Phase 3 backend exists. Only `EXPO_PUBLIC_*` variables reach the client, and
they are embedded in the bundle — never put a provider API key there.

## The phone build

The president's iPhone runs a standalone preview build (EAS Build, ad hoc, profile
`preview`). Two ways to get a change onto it:

- **Update, minutes.** `npm run update:ios` publishes the JavaScript and images to
  the `preview` channel. The app picks it up on its next launch (open, close,
  open again). Covers screens, wording, prompts, expressions.
- **Build, tens of minutes.** `npx eas build --platform ios --profile preview`.
  Needed for anything native: icon, app name, splash, config plugins, a new
  native package, an Expo SDK upgrade.

`runtimeVersion` follows the app version. **After a native change, raise
`version` in `app.json` before building.** Otherwise an update made from the new
code is also offered to the old build, which lacks the native part and can crash.

The server address and `EXPO_PUBLIC_ENV` come from the EAS `preview` environment
(`npx eas env:list --environment preview`), for both builds and updates. An
update published without `--environment preview` would ship with no server
address and quietly switch the phone back to calling Gemini directly, so use the
npm script.

Source layout follows `docs/TECH_ARCHITECTURE.md` §2. Routes live in `src/app/`
(expo-router). The character runtime in `src/features/character/` is isolated
from chat and business logic and is driven only through the types in
`mayaTypes.ts`.

Current state of the build is tracked in `PROGRESS.md`.

## Repo documents

Read in this order:

1. `docs/PRODUCT_REQUIREMENTS.md`
2. `docs/MAYA_CHARACTER_BIBLE.md`
3. `docs/UX_SPEC.md`
4. `docs/TECH_ARCHITECTURE.md`
5. `docs/DATA_MODEL.md`
6. `docs/AI_RESPONSE_CONTRACT.md`
7. `docs/ASSET_PIPELINE.md`
8. `docs/IMAGE_GENERATION_GUIDE.md`
9. `docs/REFERENCE_IMAGE_REQUEST.md`
10. `docs/SCENE_PLATE_REQUEST.md`
11. `docs/LLM_INTEGRATION.md`
12. `docs/NANO_BANANA_PIPELINE.md`
13. `docs/PIPELINE_PORTABILITY.md`
14. `docs/IMPLEMENTATION_PLAN.md`
15. `docs/ACCEPTANCE_CRITERIA.md`
16. `CODEX_BOOTSTRAP.md`
