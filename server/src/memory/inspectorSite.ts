const HTML = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#171511">
  <meta name="description" content="MAYAが参照できる記憶とContent Hubの同期状態を確認します。">
  <title>MAYA Memory</title>
  <link rel="manifest" href="/memory/manifest.webmanifest">
  <link rel="icon" href="/memory/icon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/memory/app.css">
</head>
<body>
  <div class="shell">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">M</span>
        <div><p class="eyebrow">MAYA MEMORY</p><h1>記憶の中をのぞく</h1></div>
      </div>
      <div class="header-actions">
        <button class="ghost hidden" id="installButton" type="button">ホーム画面へ</button>
        <button class="icon-button" id="refreshButton" type="button" aria-label="最新の状態に更新">↻</button>
      </div>
    </header>

    <main>
      <section class="hero" aria-labelledby="freshnessTitle">
        <div class="hero-copy">
          <p class="eyebrow">MEMORY FRESHNESS</p>
          <h2 id="freshnessTitle">読み込み中…</h2>
          <p id="freshnessNote" class="muted">ローカルの索引と、MAYAが現在読んでいるD1を照合しています。</p>
        </div>
        <div class="pulse-wrap"><span class="pulse"></span><span id="stateLabel">確認中</span></div>
      </section>

      <section class="metrics" aria-label="記憶の状態">
        <article class="metric"><span>ローカル観測</span><strong id="localEntries">—</strong><small id="localTime">未観測</small></article>
        <article class="metric"><span>MAYAのD1</span><strong id="d1Entries">—</strong><small id="d1Time">未同期</small></article>
        <article class="metric"><span>プロジェクト</span><strong id="projectCount">—</strong><small id="projectSummary">照合中</small></article>
      </section>

      <section class="panel search-panel" aria-labelledby="searchTitle">
        <div class="section-heading">
          <div><p class="eyebrow">NO LLM SEARCH</p><h2 id="searchTitle">MAYAと同じ記憶を検索</h2></div>
          <span class="privacy">検索語はLLMへ送信しません</span>
        </div>
        <form id="searchForm">
          <label class="search-box"><span class="search-icon">⌕</span><input id="query" name="q" placeholder="例：CardScan 開発理由" autocomplete="off"><button type="submit">検索</button></label>
          <div class="filters">
            <div class="checks" aria-label="検索対象">
              <label><input type="checkbox" name="kind" value="activity" checked> 活動</label>
              <label><input type="checkbox" name="kind" value="journal" checked> Journal</label>
              <label><input type="checkbox" name="kind" value="topic" checked> 話題</label>
              <label><input type="checkbox" name="kind" value="decision" checked> 判断</label>
            </div>
            <div class="dates"><label>開始 <input type="date" id="from"></label><label>終了 <input type="date" id="to"></label></div>
          </div>
        </form>
        <div id="searchStatus" class="empty-state">言葉を入れると、MAYAが実際に読める記録だけを最大8件表示します。</div>
        <div id="results" class="results"></div>
      </section>

      <section class="panel" aria-labelledby="projectsTitle">
        <div class="section-heading">
          <div><p class="eyebrow">PROJECT DIFF</p><h2 id="projectsTitle">プロジェクト別の同期状況</h2></div>
          <div class="segmented" role="group" aria-label="表示対象">
            <button class="active" data-filter="changed" type="button">差分</button>
            <button data-filter="all" type="button">すべて</button>
          </div>
        </div>
        <div id="projectList" class="project-list"><div class="empty-state">読み込み中…</div></div>
      </section>
    </main>

    <footer>MAYAが参照する本番データは読み取り専用です。この画面から同期や変更はできません。</footer>
  </div>
  <script src="/memory/app.js" defer></script>
</body>
</html>`;

const CSS = `:root{color-scheme:dark;--bg:#0d0c0a;--surface:#171511;--surface-2:#211e18;--line:#332f27;--text:#f4eee2;--muted:#aaa294;--gold:#d8b56d;--gold-2:#f0d69c;--green:#79c6a4;--amber:#e7b56f;--red:#e58d80;--blue:#8db8cf;font-family:Inter,"Noto Sans JP","Yu Gothic UI",sans-serif}*{box-sizing:border-box}html{background:var(--bg)}body{margin:0;min-height:100vh;background:radial-gradient(circle at 70% -10%,#3b2d1c 0,transparent 34rem),var(--bg);color:var(--text)}button,input{font:inherit}.shell{width:min(1040px,100%);margin:auto;padding:max(18px,env(safe-area-inset-top)) clamp(16px,4vw,36px) max(28px,env(safe-area-inset-bottom))}.topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:22px}.brand{display:flex;align-items:center;gap:12px}.brand-mark{display:grid;place-items:center;width:42px;height:42px;border:1px solid #7b6742;border-radius:50%;background:linear-gradient(145deg,#342b1e,#17130e);color:var(--gold-2);font-family:Georgia,serif;font-size:22px;box-shadow:0 0 30px #b9893922}.eyebrow{margin:0 0 4px;color:var(--gold);font-size:11px;letter-spacing:.18em;font-weight:700}.brand h1{font-size:16px;margin:0;font-weight:600}.header-actions{display:flex;gap:8px}.ghost,.icon-button,.segmented button{border:1px solid var(--line);background:#171511cc;color:var(--text);border-radius:12px;cursor:pointer}.ghost{padding:9px 13px;font-size:12px}.icon-button{width:42px;height:42px;font-size:22px}.hidden{display:none!important}main{display:grid;gap:18px}.hero{position:relative;overflow:hidden;min-height:190px;display:flex;align-items:flex-end;justify-content:space-between;gap:24px;padding:clamp(24px,5vw,48px);border:1px solid #59492e;border-radius:28px;background:linear-gradient(125deg,#211b13,#171511 58%,#282014);box-shadow:0 20px 60px #0008}.hero:before{content:"";position:absolute;width:260px;height:260px;border:1px solid #d8b56d22;border-radius:50%;right:-45px;top:-95px;box-shadow:0 0 80px #d8b56d14 inset}.hero h2{position:relative;margin:4px 0 8px;font-family:Georgia,"Yu Mincho",serif;font-size:clamp(28px,5vw,48px);font-weight:500}.hero-copy{position:relative;max-width:680px}.muted{color:var(--muted);line-height:1.7;margin:0}.pulse-wrap{position:relative;display:flex;align-items:center;gap:9px;white-space:nowrap;color:var(--gold-2);font-size:13px}.pulse{width:9px;height:9px;border-radius:50%;background:var(--amber);box-shadow:0 0 0 6px #e7b56f18}.state-synced .pulse{background:var(--green);box-shadow:0 0 0 6px #79c6a418}.state-alert .pulse{background:var(--red);box-shadow:0 0 0 6px #e58d8018}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.metric{padding:18px;border:1px solid var(--line);border-radius:18px;background:#171511c9}.metric span,.metric small{display:block;color:var(--muted);font-size:12px}.metric strong{display:block;margin:8px 0 5px;font-family:Georgia,serif;font-size:28px;color:var(--gold-2)}.panel{padding:clamp(18px,4vw,30px);border:1px solid var(--line);border-radius:24px;background:#15130fcc;box-shadow:0 12px 40px #0004}.section-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:20px}.section-heading h2{margin:0;font-size:20px}.privacy{padding:7px 10px;border:1px solid #315044;border-radius:99px;background:#1b2a24;color:var(--green);font-size:11px;white-space:nowrap}.search-box{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:10px;padding:7px 7px 7px 15px;border:1px solid #554a38;border-radius:16px;background:#0f0e0b}.search-box:focus-within{border-color:var(--gold);box-shadow:0 0 0 3px #d8b56d18}.search-icon{font-size:22px;color:var(--gold)}.search-box input{min-width:0;padding:10px 0;border:0;outline:0;background:transparent;color:var(--text);font-size:16px}.search-box button{border:0;border-radius:11px;padding:11px 18px;background:linear-gradient(135deg,#d7b36c,#b98c43);color:#17110a;font-weight:700;cursor:pointer}.filters{display:flex;justify-content:space-between;gap:14px;margin-top:13px}.checks,.dates{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.checks label,.dates label{font-size:12px;color:var(--muted)}input[type=checkbox]{accent-color:var(--gold)}input[type=date]{margin-left:4px;padding:6px;border:1px solid var(--line);border-radius:8px;background:#0f0e0b;color:var(--text);color-scheme:dark}.empty-state{padding:22px 4px;color:var(--muted);font-size:13px;line-height:1.7}.results{display:grid;gap:10px}.result{padding:16px;border:1px solid var(--line);border-radius:15px;background:var(--surface-2)}.result-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px}.kind{padding:4px 8px;border-radius:99px;background:#342b1c;color:var(--gold-2);font-size:10px;text-transform:uppercase;letter-spacing:.08em}.result time{color:var(--muted);font-size:11px}.result h3{margin:0 0 6px;font-size:15px}.result p{margin:0;white-space:pre-wrap;color:#d9d2c7;font-size:13px;line-height:1.65}.segmented{display:flex;padding:3px;border:1px solid var(--line);border-radius:11px}.segmented button{padding:7px 11px;border:0;background:transparent;font-size:11px;color:var(--muted)}.segmented button.active{background:#3b3020;color:var(--gold-2)}.project-list{display:grid;gap:8px}.project-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:12px;padding:13px 14px;border:1px solid var(--line);border-radius:13px;background:#1b1813}.project-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}.project-meta{color:var(--muted);font-size:11px;text-align:right}.badge{min-width:66px;padding:5px 8px;border-radius:99px;text-align:center;font-size:10px;font-weight:700}.badge.synced{background:#183127;color:var(--green)}.badge.different,.badge.local_only{background:#382719;color:var(--amber)}.badge.d1_only{background:#34201e;color:var(--red)}footer{padding:12px 4px;color:#777064;text-align:center;font-size:11px;line-height:1.6}@media(max-width:700px){.shell{padding-left:13px;padding-right:13px}.hero{min-height:220px;align-items:flex-start;flex-direction:column}.pulse-wrap{align-self:flex-start}.metrics{grid-template-columns:1fr 1fr}.metric:last-child{grid-column:1/-1}.section-heading{align-items:flex-start}.privacy{white-space:normal;text-align:center}.filters{align-items:flex-start;flex-direction:column}.dates{width:100%;justify-content:space-between}.project-row{grid-template-columns:minmax(0,1fr) auto}.project-meta{grid-row:2;grid-column:1/-1;text-align:left}.brand h1{display:none}}@media(prefers-reduced-motion:no-preference){.pulse{animation:breathe 2.2s infinite}@keyframes breathe{50%{box-shadow:0 0 0 10px transparent}}}`;

const JS = `'use strict';
const byId=(id)=>document.getElementById(id);
const state={projects:[],filter:'changed'};
const labels={activity:'活動',journal:'Journal',topic:'話題',decision:'判断'};
const projectLabels={synced:'同期済み',different:'差分あり',local_only:'ローカルのみ',d1_only:'D1のみ'};

async function getJson(path,options){
  const response=await fetch(path,Object.assign({headers:{Accept:'application/json'},cache:'no-store'},options||{}));
  if(!response.ok){let message='読み込めませんでした（HTTP '+response.status+'）';try{const body=await response.json();message=body.error&&body.error.message||message}catch(_){}throw new Error(message)}
  return response.json();
}
function time(value){if(!value)return '—';const date=new Date(value);return Number.isNaN(date.getTime())?value:new Intl.DateTimeFormat('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(date)}
function number(value){return typeof value==='number'?value.toLocaleString('ja-JP')+'件':'—'}
function setText(id,value){byId(id).textContent=value}
function statusCopy(summary){
  if(summary.state==='synced')return ['MAYAの記憶は最新です','ローカルで最後に観測した索引と、MAYAが読むD1は同じ世代です。','同期済み','state-synced'];
  if(summary.state==='local_ahead')return ['新しい記録がローカルにあります','ローカルの索引とD1の世代が異なります。Content Hubから同期するとMAYAに届きます。','差分あり','state-alert'];
  if(summary.state==='d1_ahead')return ['PCの観測情報が古くなっています','D1の方が新しい世代です。PCで observe を実行すると、現在のローカル状態と照合できます。','再観測が必要','state-alert'];
  if(summary.state==='diverged')return ['同じ時刻の索引に差分があります','ローカルとD1の生成時刻は同じですが、内容のハッシュが一致しません。再収集して確認してください。','要確認','state-alert'];
  if(summary.state==='d1_empty')return ['MAYA側に活動記録がありません','ローカルの索引は観測済みですが、D1への同期はまだ完了していません。','未同期','state-alert'];
  return ['ローカルの状態はまだ未観測です','PCで maya_sync.py observe を実行すると、スマホから差分を確認できます。','未観測',''];
}
function renderSummary(summary,projects){
  const copy=statusCopy(summary);setText('freshnessTitle',copy[0]);setText('freshnessNote',copy[1]);setText('stateLabel',copy[2]);
  const hero=document.querySelector('.hero');hero.classList.remove('state-synced','state-alert');if(copy[3])hero.classList.add(copy[3]);
  setText('localEntries',number(summary.local&&summary.local.entryCount));setText('localTime',summary.local?'観測 '+time(summary.local.observedAt):'未観測');
  setText('d1Entries',number(summary.d1.entryCount));setText('d1Time',summary.d1.completedAt?'同期 '+time(summary.d1.completedAt):'未同期');
  setText('projectCount',number(summary.d1.projectCount));
  const changed=projects.counts.different+projects.counts.local_only+projects.counts.d1_only;
  setText('projectSummary',changed?changed+'プロジェクトに差分':'全プロジェクト一致');
}
function renderProjects(){
  const root=byId('projectList');root.replaceChildren();
  const visible=state.filter==='all'?state.projects:state.projects.filter((project)=>project.state!=='synced');
  if(!visible.length){const empty=document.createElement('div');empty.className='empty-state';empty.textContent=state.projects.length?'プロジェクトごとの差分はありません。':'比較できるプロジェクトがありません。';root.append(empty);return}
  visible.forEach((project)=>{
    const row=document.createElement('div');row.className='project-row';
    const name=document.createElement('div');name.className='project-name';name.textContent=project.project;
    const meta=document.createElement('div');meta.className='project-meta';meta.textContent='Local '+project.localEntryCount+'件 / D1 '+project.d1EntryCount+'件'+(project.localLatestDate?' ・ 最新 '+project.localLatestDate:'');
    const badge=document.createElement('span');badge.className='badge '+project.state;badge.textContent=projectLabels[project.state]||project.state;
    row.append(name,meta,badge);root.append(row);
  });
}
async function load(){
  byId('refreshButton').disabled=true;
  try{const values=await Promise.all([getJson('/v1/memory-inspector/summary'),getJson('/v1/memory-inspector/projects')]);state.projects=values[1].projects;renderSummary(values[0],values[1]);renderProjects()}
  catch(error){setText('freshnessTitle','記憶の状態を取得できません');setText('freshnessNote',error.message);byId('projectList').innerHTML='<div class="empty-state">更新してもう一度お試しください。</div>'}
  finally{byId('refreshButton').disabled=false}
}
function renderResults(data){
  const root=byId('results');root.replaceChildren();
  setText('searchStatus',data.count?data.count+'件見つかりました。':'該当する記録はありませんでした。');
  data.hits.forEach((hit)=>{
    const card=document.createElement('article');card.className='result';
    const head=document.createElement('div');head.className='result-head';
    const kind=document.createElement('span');kind.className='kind';kind.textContent=labels[hit.kind]||hit.kind;
    const date=document.createElement('time');date.textContent=hit.date;head.append(kind,date);
    if(hit.project){const title=document.createElement('h3');title.textContent=hit.project;card.append(head,title)}else card.append(head);
    const text=document.createElement('p');text.textContent=hit.text;card.append(text);root.append(card);
  });
}
byId('searchForm').addEventListener('submit',async(event)=>{
  event.preventDefault();const params=new URLSearchParams();
  const query=byId('query').value.trim();if(query)params.append('keyword',query);
  document.querySelectorAll('input[name=kind]:checked').forEach((input)=>params.append('kind',input.value));
  if(byId('from').value)params.set('from',byId('from').value);if(byId('to').value)params.set('to',byId('to').value);
  setText('searchStatus','検索中…');byId('results').replaceChildren();
  try{renderResults(await getJson('/v1/memory-inspector/search?'+params.toString()))}catch(error){setText('searchStatus',error.message)}
});
document.querySelectorAll('[data-filter]').forEach((button)=>button.addEventListener('click',()=>{document.querySelectorAll('[data-filter]').forEach((item)=>item.classList.remove('active'));button.classList.add('active');state.filter=button.dataset.filter;renderProjects()}));
byId('refreshButton').addEventListener('click',load);
let installPrompt;window.addEventListener('beforeinstallprompt',(event)=>{event.preventDefault();installPrompt=event;byId('installButton').classList.remove('hidden')});
byId('installButton').addEventListener('click',async()=>{if(!installPrompt)return;installPrompt.prompt();await installPrompt.userChoice;installPrompt=undefined;byId('installButton').classList.add('hidden')});
if('serviceWorker' in navigator)navigator.serviceWorker.register('/memory/sw.js',{scope:'/memory/'}).catch(()=>{});
load();`;

const MANIFEST = JSON.stringify({
  name: 'MAYA Memory',
  short_name: 'MAYA Memory',
  description: 'MAYAが参照できる記憶と同期状態を確認',
  start_url: '/memory/',
  scope: '/memory/',
  display: 'standalone',
  background_color: '#0d0c0a',
  theme_color: '#171511',
  icons: [{ src: '/memory/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
});

const SW = `const CACHE='maya-memory-v1';const SHELL=['/memory/','/memory/app.css','/memory/app.js','/memory/icon.svg','/memory/manifest.webmanifest'];self.addEventListener('install',(event)=>event.waitUntil(caches.open(CACHE).then((cache)=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));self.addEventListener('activate',(event)=>event.waitUntil(caches.keys().then((keys)=>Promise.all(keys.filter((key)=>key!==CACHE).map((key)=>caches.delete(key)))).then(()=>self.clients.claim())));self.addEventListener('fetch',(event)=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.pathname.startsWith('/v1/'))return;if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(()=>caches.match('/memory/')));return}event.respondWith(caches.match(event.request).then((cached)=>cached||fetch(event.request)))})`;

const ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#171511"/><circle cx="256" cy="256" r="174" fill="none" stroke="#d8b56d" stroke-width="8"/><path fill="#f0d69c" d="M144 350V158h40l72 109 72-109h40v192h-43V226l-69 103-69-103v124z"/></svg>`;

const SECURITY = {
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; base-uri 'none'; frame-ancestors 'none'",
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
};

function asset(body: string, contentType: string, cache = 'public, max-age=3600'): Response {
  return new Response(body, { headers: { ...SECURITY, 'content-type': contentType, 'cache-control': cache } });
}

export function memorySite(pathname: string): Response | undefined {
  if (pathname === '/memory') return new Response(null, { status: 308, headers: { location: '/memory/' } });
  if (pathname === '/memory/') return asset(HTML, 'text/html; charset=utf-8', 'no-cache');
  if (pathname === '/memory/app.css') return asset(CSS, 'text/css; charset=utf-8');
  if (pathname === '/memory/app.js') return asset(JS, 'text/javascript; charset=utf-8');
  if (pathname === '/memory/manifest.webmanifest') return asset(MANIFEST, 'application/manifest+json; charset=utf-8');
  if (pathname === '/memory/sw.js') return asset(SW, 'text/javascript; charset=utf-8', 'no-cache');
  if (pathname === '/memory/icon.svg') return asset(ICON, 'image/svg+xml; charset=utf-8');
  return undefined;
}
