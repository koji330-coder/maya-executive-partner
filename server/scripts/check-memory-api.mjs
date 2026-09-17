/**
 * 手元の MAYA サーバーの記憶 API を一通り叩く。Gemini は呼ばない。
 *
 * `npm run dev` を動かしたまま `npm run check:api` で流す。手元の D1 に
 * テスト用の行が残るので、気になるなら README の手順で消す。
 */
const BASE = 'http://127.0.0.1:8787';
let failures = 0;

async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json; charset=utf-8' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

function check(label, ok, detail = '') {
  console.log(`${ok ? '  ok ' : '  NG '} ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures += 1;
}

console.log('== 判断');
const bad = await call('POST', '/v1/decisions', { draft: { title: '' } });
check('題の無い判断は断る', bad.status === 400, bad.data?.error?.message);
const badDate = await call('POST', '/v1/decisions', { draft: { title: 'x', dueDate: '2026-02-30' } });
check('存在しない日付は断る', badDate.status === 400, badDate.data?.error?.message);

const created = await call('POST', '/v1/decisions', {
  draft: { title: '競合の値下げに追随しない', reason: '粗利が持たない', actionTitle: '主要3社に伝える', dueDate: '2026-09-20' },
  conversationId: 'conv-test',
  sourceMessageId: 'maya-test-1',
});
check('判断と次の一手を保存', created.status === 201 && created.data?.id, created.data?.id);
const decisionId = created.data?.id;

const list = await call('GET', '/v1/decisions');
const saved = list.data?.decisions?.find((d) => d.id === decisionId);
check('一覧に次の一手つきで出る', saved?.action?.title === '主要3社に伝える', saved?.action?.dueDate);

const marks = await call('GET', '/v1/decisions/saved?conversationId=conv-test');
check('保存元の返答が分かる', marks.data?.messageIds?.includes('maya-test-1'));

const status = await call('PATCH', `/v1/decisions/${decisionId}`, { status: 'reconsider' });
check('状態を見直しにする', status.status === 200);
const badStatus = await call('PATCH', `/v1/decisions/${decisionId}`, { status: 'thinking' });
check('知らない状態は断る', badStatus.status === 400);
const missing = await call('PATCH', '/v1/decisions/decision-nope', { status: 'active' });
check('無い判断は 404', missing.status === 404);
const actionDone = await call('PATCH', `/v1/actions/${saved?.action?.id}`, { status: 'done' });
check('次の一手を完了にする', actionDone.status === 200);

console.log('== Journal');
const mangled = `---\n\ndate: 2026-09-13\ntopic: "サーバー経由の記録"\nrelated_projects:\n\n* "maya-executive-partner"\n  source_type: conversation\n  source: "Claude"\n  sensitivity: home\n  context:\n* "スキルから直接送った。"\n  ai_feedback:\n  interpretation: "受け箱が一本化された。"\n  accepted: null\n  reason: ""\n\n---\n\n# Notes\n\nメモ。\n`;
const j = await call('POST', '/v1/journal', { rawText: mangled });
check('崩れた生テキストだけで保存できる（サーバーが読む）', j.status === 201, j.data?.entry?.topic);
check('項目を取り戻せている', j.data?.entry?.source === 'Claude' && j.data?.entry?.context?.length === 1);
const journalId = j.data?.id;

const priv = await call('POST', '/v1/journal', { rawText: mangled.replace('sensitivity: home', 'sensitivity: private') });
check('private は保存しない', priv.status === 400, priv.data?.error?.message);

const dup = await call('GET', `/v1/journal/duplicate?date=2026-09-13&topic=${encodeURIComponent('サーバー経由の記録')}`);
check('同じ日付と題を見つける', dup.data?.id === journalId);

const verdict = await call('PATCH', `/v1/journal/${journalId}`, { verdict: 'accepted', reason: '合っている' });
check('AIの解釈を受け入れる', verdict.status === 200);
const journals = await call('GET', '/v1/journal');
const stored = journals.data?.entries?.find((e) => e.id === journalId);
check('受け入れが保存に反映される', stored?.entry?.aiVerdict === 'accepted' && stored?.entry?.aiReason === '合っている');

console.log('== 話題');
const t = await call('POST', '/v1/topics', { pasted: '面白い https://x.com/someone/status/1', note: 'あとで読む' });
check('リンクつきの話題を保存', t.status === 201);
const topics = await call('GET', '/v1/topics');
const topic = topics.data?.topics?.find((x) => x.id === t.data?.id);
check('リンクと本文が分かれる', topic?.url === 'https://x.com/someone/status/1' && topic?.body === '面白い');
const emptyTopic = await call('POST', '/v1/topics', { pasted: '   ' });
check('空の話題は断る', emptyTopic.status === 400);

console.log('== プロジェクト');
const p = await call('POST', '/v1/projects', { name: 'MAYA', description: '個人専用のAI秘書', aliases: ['キャラ動かす', 'AI秘書'] });
check('別名つきで作る', p.status === 201);
const projectId = p.data?.id;
const src = await call('POST', `/v1/projects/${projectId}/sources`, { kind: 'github', ref: 'maya-executive-partner' });
check('情報源を足す', src.status === 201);
const badSrc = await call('POST', `/v1/projects/${projectId}/sources`, { kind: 'dropbox', ref: 'x' });
check('知らない情報源は断る', badSrc.status === 400);

const byAlias = await call('GET', `/v1/projects?q=${encodeURIComponent('あのキャラ動かすやつ')}`);
check('「あのキャラ動かすやつ」で引ける', byAlias.data?.projects?.[0]?.id === projectId);
const byWidth = await call('GET', `/v1/projects?q=${encodeURIComponent('ＭＡＹＡ')}`);
check('全角でも引ける', byWidth.data?.projects?.[0]?.id === projectId);

const pause = await call('PATCH', `/v1/projects/${projectId}`, { status: 'paused' });
check('休止にする', pause.status === 200);
const removed = await call('DELETE', `/v1/projects/${projectId}/aliases/${encodeURIComponent('AI秘書')}`);
check('別名を外す', removed.status === 200);
const projects = await call('GET', '/v1/projects');
const project = projects.data?.projects?.find((x) => x.id === projectId);
check('反映されている', project?.status === 'paused' && !project.aliases.includes('AI秘書') && project.sources.length === 1);

console.log('== その他');
const nf = await call('GET', '/v1/nothing');
check('知らない場所は 404', nf.status === 404);
const notJson = await fetch(`${BASE}/v1/topics`, { method: 'POST', body: 'not json' });
check('JSON でない本文は 400', notJson.status === 400);

console.log(failures === 0 ? '\nすべて通過' : `\n${failures} 件失敗`);
process.exit(failures === 0 ? 0 : 1);
