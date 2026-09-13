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
| `POST /v1/chat` | One consultation turn. Past decisions are read from D1, not sent by the app |
| `GET/POST /v1/decisions` | List, or save a decision with its next action in one batch |
| `GET /v1/decisions/saved?conversationId=` | Which replies in a conversation already have a saved decision |
| `PATCH /v1/decisions/:id`, `PATCH /v1/actions/:id` | Change a status |
| `GET/POST /v1/journal` | List, or save. Send `rawText` alone and the server parses it with the app's parser |
| `GET /v1/journal/duplicate?date=&topic=` | An entry with the same date and topic |
| `PATCH /v1/journal/:id` | Record whether the AI's interpretation was accepted |
| `GET/POST /v1/topics` | List, or save a pasted link or post |
| `GET/POST /v1/projects` | List (`?q=` matches name and aliases), or create |
| `PATCH /v1/projects/:id` | Rename, pause, finish |
| `POST /v1/projects/:id/aliases`, `DELETE .../aliases/:alias` | What the president calls it |
| `POST /v1/projects/:id/sources` | `github`, `folder` or `dataset` |

`npm run check:api` exercises all of these against the running dev server
without calling Gemini. To clear what it leaves in the local D1:

```
npx wrangler d1 execute MAYA_DB --local --command "DELETE FROM actions; DELETE FROM decisions; DELETE FROM journal_entries; DELETE FROM topics; DELETE FROM project_sources; DELETE FROM project_aliases; DELETE FROM projects;"
```

## What is not done yet

- **Access.** In production the Worker sits behind a Cloudflare Access service
  token and `workers_dev` is off. Until that exists, it only runs locally
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
