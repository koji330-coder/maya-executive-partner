# MAYA server

The Cloudflare Worker the app will talk to instead of calling Gemini itself.
Design: `docs/PLATFORM_ARCHITECTURE.md`.

The prompt, the response schema, the validator and the Gemini client are not
copied here. They are imported from the app (`../src`), so a change to how MAYA
answers lands on the phone and the server at once.

## Run it locally

Nothing here touches Cloudflare. `--local` keeps the Worker and its D1 database
on this machine.

```
cd server
npm install
copy .dev.vars.example .dev.vars      # then put the free key in it
npm run db:migrate:local
npm run dev                            # http://127.0.0.1:8787
```

`.dev.vars` holds secrets and is git-ignored. Restart `npm run dev` after
editing it; the key is read at start-up, not on reload.

## Endpoints

| | |
| --- | --- |
| `GET /health` | Model name, and whether each key is set. Never the key itself |
| `POST /v1/chat` | One consultation turn. Same body as `AskOptions` in `src/features/chat/responder.ts` |

## What is not done yet

- **Access.** In production the Worker sits behind a Cloudflare Access service
  token and `workers_dev` is off. Until that exists, it only runs locally
- **Memory endpoints.** The D1 tables for decisions, projects, journal entries
  and topics exist; nothing reads or writes them yet
- **The app does not call this.** It still calls Gemini directly

Creating the D1 database, setting secrets and deploying all act on the
Cloudflare account, and are done as separate, confirmed steps.

## Things that bit

- **The server's time zone is not the president's.** Cloudflare runs in UTC; the
  local dev server runs in the PC's zone. The first fix assumed UTC and added
  nine hours, so locally MAYA said "朝です" at 21:47. `src/clock.ts` now measures
  the runtime's offset instead of assuming it
- **Stopping `wrangler dev` from a background task can leave its runtime
  running.** Two instances then share port 8787 and requests hang. Stop every
  process under `server/` before restarting
