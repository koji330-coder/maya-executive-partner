import type { JournalEntry } from '@/features/inbox/journal';

import { answer, parseChatRequest } from './chat';
import type { Env } from './env';
import { ApiError, json, notFound, readJson, str } from './http';
import {
  createDecision,
  listDecisions,
  readDraft,
  savedSourceMessages,
  setActionStatus,
  setDecisionStatus,
} from './memory/decisions';
import {
  createJournal,
  createTopic,
  deleteTopic,
  findSameJournal,
  listJournals,
  listTopics,
  setJournalVerdict,
} from './memory/inbox';
import { deleteKey, keyStatuses, readKeyText, readTier, resolveKeys, saveKey } from './memory/apiKeys';
import { loadCostPolicy, parseCostPatch, saveCostPolicy } from './memory/settings';
import { checkApiKey } from '@/services/llm/geminiClient';
import {
  addAlias,
  addSource,
  createProject,
  listProjects,
  matchProjects,
  removeAlias,
  updateProject,
} from './memory/projects';

type Handler = (ctx: { request: Request; env: Env; params: string[]; url: URL }) => Promise<Response>;

interface Route {
  method: string;
  pattern: RegExp;
  handle: Handler;
}

const ID = '([^/]+)';

/**
 * The server's API.
 *
 * Memory lives here from v0.2 on (docs/PLATFORM_ARCHITECTURE.md). Conversations
 * do not: they stay on the phone, so the conversation id and message id a
 * decision was saved from are passed in, not looked up.
 */
const ROUTES: Route[] = [
  {
    method: 'GET',
    pattern: /^\/health$/,
    handle: async ({ env }) => {
      // Says which keys exist, never what they are.
      const keys = await resolveKeys(env.MAYA_DB, env);
      return json({ status: 'ok', model: env.MODEL, keys: { free: Boolean(keys.free), paid: Boolean(keys.paid) } });
    },
  },
  {
    method: 'POST',
    pattern: /^\/v1\/chat$/,
    handle: async ({ request, env }) => json(await answer(env, parseChatRequest(await readJson(request)))),
  },

  // ---- decisions
  {
    method: 'GET',
    pattern: /^\/v1\/decisions$/,
    handle: async ({ env }) => json({ decisions: await listDecisions(env.MAYA_DB) }),
  },
  {
    method: 'POST',
    pattern: /^\/v1\/decisions$/,
    handle: async ({ request, env }) => {
      const body = await readJson(request);
      const id = await createDecision(env.MAYA_DB, {
        draft: readDraft(body.draft),
        conversationId: str(body, 'conversationId') || null,
        sourceMessageId: str(body, 'sourceMessageId') || null,
        projectId: str(body, 'projectId') || null,
      });
      return json({ id }, 201);
    },
  },
  {
    method: 'GET',
    pattern: /^\/v1\/decisions\/saved$/,
    handle: async ({ env, url }) =>
      json({ messageIds: await savedSourceMessages(env.MAYA_DB, url.searchParams.get('conversationId') ?? '') }),
  },
  {
    method: 'PATCH',
    pattern: new RegExp(`^/v1/decisions/${ID}$`),
    handle: async ({ request, env, params }) => {
      await setDecisionStatus(env.MAYA_DB, params[0] ?? '', str(await readJson(request), 'status'));
      return json({ ok: true });
    },
  },
  {
    method: 'PATCH',
    pattern: new RegExp(`^/v1/actions/${ID}$`),
    handle: async ({ request, env, params }) => {
      await setActionStatus(env.MAYA_DB, params[0] ?? '', str(await readJson(request), 'status'));
      return json({ ok: true });
    },
  },

  // ---- journal
  {
    method: 'GET',
    pattern: /^\/v1\/journal$/,
    handle: async ({ env }) => json({ entries: await listJournals(env.MAYA_DB) }),
  },
  {
    method: 'POST',
    pattern: /^\/v1\/journal$/,
    handle: async ({ request, env }) => {
      const body = await readJson(request);
      const checked =
        typeof body.entry === 'object' && body.entry !== null ? (body.entry as JournalEntry) : undefined;
      return json(await createJournal(env.MAYA_DB, str(body, 'rawText'), checked), 201);
    },
  },
  {
    method: 'GET',
    pattern: /^\/v1\/journal\/duplicate$/,
    handle: async ({ env, url }) =>
      json({
        id: await findSameJournal(
          env.MAYA_DB,
          url.searchParams.get('date') ?? '',
          url.searchParams.get('topic') ?? '',
        ),
      }),
  },
  {
    method: 'PATCH',
    pattern: new RegExp(`^/v1/journal/${ID}$`),
    handle: async ({ request, env, params }) => {
      const body = await readJson(request);
      await setJournalVerdict(env.MAYA_DB, params[0] ?? '', str(body, 'verdict'), str(body, 'reason'));
      return json({ ok: true });
    },
  },

  // ---- topics
  {
    method: 'GET',
    pattern: /^\/v1\/topics$/,
    handle: async ({ env }) => json({ topics: await listTopics(env.MAYA_DB) }),
  },
  {
    method: 'POST',
    pattern: /^\/v1\/topics$/,
    handle: async ({ request, env }) => {
      const body = await readJson(request);
      return json({ id: await createTopic(env.MAYA_DB, str(body, 'pasted'), str(body, 'note')) }, 201);
    },
  },
  {
    method: 'DELETE',
    pattern: new RegExp(`^/v1/topics/${ID}$`),
    handle: async ({ env, params }) => {
      await deleteTopic(env.MAYA_DB, params[0] ?? '');
      return json({ ok: true });
    },
  },

  // ---- projects
  {
    method: 'GET',
    pattern: /^\/v1\/projects$/,
    handle: async ({ env, url }) => {
      const projects = await listProjects(env.MAYA_DB);
      const q = url.searchParams.get('q');
      return json({ projects: q ? matchProjects(projects, q) : projects });
    },
  },
  {
    method: 'POST',
    pattern: /^\/v1\/projects$/,
    handle: async ({ request, env }) => {
      const body = await readJson(request);
      const aliases = Array.isArray(body.aliases) ? body.aliases.filter((a) => typeof a === 'string') : [];
      const id = await createProject(env.MAYA_DB, {
        name: str(body, 'name'),
        description: str(body, 'description'),
        aliases,
      });
      return json({ id }, 201);
    },
  },
  {
    method: 'PATCH',
    pattern: new RegExp(`^/v1/projects/${ID}$`),
    handle: async ({ request, env, params }) => {
      const body = await readJson(request);
      const pick = (key: string) => (typeof body[key] === 'string' ? (body[key] as string) : undefined);
      await updateProject(env.MAYA_DB, params[0] ?? '', {
        name: pick('name'),
        status: pick('status'),
        description: pick('description'),
      });
      return json({ ok: true });
    },
  },
  {
    method: 'POST',
    pattern: new RegExp(`^/v1/projects/${ID}/aliases$`),
    handle: async ({ request, env, params }) => {
      await addAlias(env.MAYA_DB, params[0] ?? '', str(await readJson(request), 'alias'));
      return json({ ok: true }, 201);
    },
  },
  {
    method: 'DELETE',
    pattern: new RegExp(`^/v1/projects/${ID}/aliases/${ID}$`),
    handle: async ({ env, params }) => {
      await removeAlias(env.MAYA_DB, params[0] ?? '', decodeURIComponent(params[1] ?? ''));
      return json({ ok: true });
    },
  },
  // ---- settings
  //
  // The cost rules the server actually applies. wrangler.jsonc holds the
  // starting values; these two let the settings screen move them without a
  // redeploy, which is what the president asked for on 2026-09-14.
  {
    method: 'GET',
    pattern: /^\/v1\/settings\/cost$/,
    handle: async ({ env }) => json(await loadCostPolicy(env.MAYA_DB, env)),
  },
  {
    method: 'PUT',
    pattern: /^\/v1\/settings\/cost$/,
    handle: async ({ request, env }) => {
      await saveCostPolicy(env.MAYA_DB, parseCostPatch(await readJson(request)));
      // Return what now applies, so the screen shows the clamped value rather
      // than whatever was typed.
      return json(await loadCostPolicy(env.MAYA_DB, env));
    },
  },

  // Gemini keys. Write-only: nothing here returns a key, only whether one is set.
  {
    method: 'GET',
    pattern: /^\/v1\/settings\/keys$/,
    handle: async ({ env }) => json(await keyStatuses(env.MAYA_DB, env)),
  },
  {
    method: 'PUT',
    pattern: /^\/v1\/settings\/keys\/(free|paid)$/,
    handle: async ({ request, env, params }) => {
      const tier = readTier(params[0]);
      const key = readKeyText((await readJson(request)).key);
      // Proved before it is stored, so a mistyped key fails here, on the
      // settings screen, and not in the middle of the next consultation.
      const check = await checkApiKey(key, env.MODEL);
      if (!check.ok) {
        throw new ApiError(400, 'key_rejected', `このキーでは ${env.MODEL} を呼べませんでした。${check.detail}`);
      }
      await saveKey(env.MAYA_DB, env, tier, key);
      return json(await keyStatuses(env.MAYA_DB, env));
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/v1\/settings\/keys\/(free|paid)$/,
    handle: async ({ env, params }) => {
      await deleteKey(env.MAYA_DB, readTier(params[0]));
      return json(await keyStatuses(env.MAYA_DB, env));
    },
  },

  {
    method: 'POST',
    pattern: new RegExp(`^/v1/projects/${ID}/sources$`),
    handle: async ({ request, env, params }) => {
      const body = await readJson(request);
      await addSource(env.MAYA_DB, params[0] ?? '', str(body, 'kind'), str(body, 'ref'));
      return json({ ok: true }, 201);
    },
  },
];

export async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  for (const r of ROUTES) {
    if (r.method !== request.method) continue;
    const match = url.pathname.match(r.pattern);
    if (match) {
      return r.handle({ request, env, url, params: match.slice(1).map((p) => decodeURIComponent(p)) });
    }
  }
  throw notFound('Not found');
}
