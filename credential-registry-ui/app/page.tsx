"use client";

import { useEffect, useMemo, useState } from "react";
import { projects, scanSummary, seedCredentials, services, type CredentialRecord, type ProjectRecord, type Status } from "./registry-data";

type View = "home" | "projects" | "project" | "services" | "service" | "accounts" | "account" | "review";
type Account = { id: string; provider: string; alias: string; purpose: string };
type SavedState = { credentials: CredentialRecord[]; accounts: Account[]; wizardIndex: number };

const STORAGE_KEY = "credential-registry-state-v1";
const nav: { id: View; label: string; mark: string }[] = [
  { id: "home", label: "ホーム", mark: "⌂" },
  { id: "projects", label: "プロジェクト", mark: "P" },
  { id: "services", label: "サービス", mark: "S" },
  { id: "accounts", label: "アカウント", mark: "A" },
  { id: "review", label: "要確認", mark: "!" },
];

const serviceName = (id: string) => services.find((item) => item.id === id)?.name ?? id;
const projectName = (id: string) => projects.find((item) => item.id === id)?.name ?? id;

function StatusPill({ status }: { status: Status | "確認済み" }) {
  const tone = status === "使用中" || status === "確認済み" ? "ok" : status === "要確認" || status === "不明" ? "warn" : "muted";
  return <span className={`status ${tone}`}><i />{status}</span>;
}

function Metric({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return <article className={`metric ${accent ? "metric-accent" : ""}`}><span>{label}</span><strong>{value}</strong></article>;
}

export default function Registry() {
  const [view, setView] = useState<View>("home");
  const [credentials, setCredentials] = useState(seedCredentials);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedProject, setSelectedProject] = useState("maya");
  const [selectedService, setSelectedService] = useState("gemini");
  const [selectedAccount, setSelectedAccount] = useState("");
  const [filter, setFilter] = useState("すべて");
  const [query, setQuery] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardIndex, setWizardIndex] = useState(0);
  const [accountDraft, setAccountDraft] = useState("分からない");
  const [projectDraft, setProjectDraft] = useState("分からない");
  const [nameDraft, setNameDraft] = useState("");
  const [statusDraft, setStatusDraft] = useState<Status>("不明");
  const [hydrated, setHydrated] = useState(false);
  const [firstVisit, setFirstVisit] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) try { const saved = JSON.parse(raw) as SavedState; setCredentials(saved.credentials); setAccounts(saved.accounts); setWizardIndex(saved.wizardIndex ?? 0); } catch { /* 初期状態を使用 */ }
      else setFirstVisit(true);
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify({ credentials, accounts, wizardIndex } satisfies SavedState));
  }, [credentials, accounts, wizardIndex, hydrated]);

  const reviews = credentials.filter((item) => item.status === "要確認" || item.status === "不明" || item.account === "未確認" || item.cloudProject === "未確認");
  const wizardItem = reviews[Math.min(wizardIndex, Math.max(0, reviews.length - 1))];
  const visibleProjects = useMemo(() => projects.filter((project) => {
    const related = credentials.filter((item) => item.projectId === project.id);
    const warning = related.some((item) => item.status === "要確認" || item.status === "不明");
    const filterMatches = filter === "すべて" || (filter === "要確認あり" ? warning : !warning);
    return filterMatches && `${project.name} ${project.repository}`.toLowerCase().includes(query.toLowerCase());
  }), [credentials, filter, query]);

  function go(next: View) { setView(next); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function openProject(id: string) { setSelectedProject(id); go("project"); }
  function openService(id: string) { setSelectedService(id); go("service"); }
  function openAccount(id: string) { setSelectedAccount(id); go("account"); }
  function startWizard(index = 0) {
    const item = reviews[index]; if (!item) return;
    setWizardIndex(index); setAccountDraft(item.account === "未確認" ? "分からない" : item.account); setProjectDraft(item.cloudProject === "未確認" ? "分からない" : item.cloudProject); setNameDraft(item.name); setStatusDraft(item.status === "要確認" ? "不明" : item.status); setWizardOpen(true);
  }
  function saveWizard() {
    if (!wizardItem) return;
    const account = accountDraft === "分からない" ? "未確認" : accountDraft;
    const cloudProject = projectDraft === "分からない" ? "未確認" : projectDraft;
    const unresolved = account === "未確認" || cloudProject === "未確認" || statusDraft === "不明";
    setCredentials((current) => current.map((item) => item.id === wizardItem.id ? { ...item, account, cloudProject, name: nameDraft.trim() || item.name, status: unresolved ? "要確認" : statusDraft } : item));
    if (account !== "未確認" && !accounts.some((item) => item.alias === account)) {
      setAccounts((current) => [...current, { id: `account-${Date.now()}`, provider: serviceName(wizardItem.serviceId), alias: account, purpose: "用途未設定" }]);
    }
    const next = reviews[(wizardIndex + 1) % reviews.length];
    if (!next || next.id === wizardItem.id) { setWizardOpen(false); return; }
    const nextIndex = (wizardIndex + 1) % reviews.length;
    setWizardIndex(nextIndex);
    setAccountDraft(next.account === "未確認" ? "分からない" : next.account);
    setProjectDraft(next.cloudProject === "未確認" ? "分からない" : next.cloudProject);
    setNameDraft(next.name);
    setStatusDraft(next.status === "要確認" ? "不明" : next.status);
  }
  function addAccount() {
    const alias = window.prompt("アカウントの分かりやすい名前を入力してください"); if (!alias?.trim()) return;
    const provider = window.prompt("サービス名", "Google")?.trim() || "未設定";
    setAccounts((current) => [...current, { id: `account-${Date.now()}`, alias: alias.trim(), provider, purpose: "用途未設定" }]);
  }
  function editAccount(account: Account) {
    const alias = window.prompt("表示名", account.alias); if (!alias?.trim()) return;
    const purpose = window.prompt("用途", account.purpose)?.trim() || account.purpose;
    setAccounts((current) => current.map((item) => item.id === account.id ? { ...item, alias: alias.trim(), purpose } : item));
  }
  function editCredential(item: CredentialRecord) {
    const name = window.prompt("認証情報の表示名", item.name); if (!name?.trim()) return;
    const note = window.prompt("メモ", item.note ?? "") ?? item.note;
    const cloudProject = window.prompt("サービス側のProject名（分からない場合は未確認）", item.cloudProject)?.trim() || item.cloudProject;
    const status = window.prompt("状態（使用中 / 不明 / 未使用 / 廃止 / 要確認）", item.status) as Status | null;
    const allowed: Status[] = ["使用中", "不明", "未使用", "廃止", "要確認"];
    const usage = window.prompt(`利用先プロジェクトID（${projects.map((project) => `${project.id}: ${project.name}`).join(" / ")}）`, item.projectId);
    const projectId = projects.some((project) => project.id === usage) ? usage! : item.projectId;
    setCredentials((current) => current.map((row) => row.id === item.id ? { ...row, name: name.trim(), note, cloudProject, status: status && allowed.includes(status) ? status : row.status, projectId } : row));
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">CR</div><div><strong>Credential Registry</strong><span>開発環境の認証情報台帳</span></div></div>
      <nav aria-label="メインナビゲーション">{nav.map((item) => <button key={item.id} className={view === item.id || (view === "project" && item.id === "projects") || (view === "service" && item.id === "services") || (view === "account" && item.id === "accounts") ? "active" : ""} onClick={() => go(item.id)}><b>{item.mark}</b>{item.label}{item.id === "review" && reviews.length > 0 && <em>{reviews.length}</em>}</button>)}</nav>
      <div className="sidebar-note"><span>値は保存しません</span><p>APIキーやトークンの値を入力する場所はありません。</p></div>
    </aside>
    <main><header className="topbar"><div><p>個人開発環境</p><h1>{view === "home" ? "ホーム" : view === "project" ? projectName(selectedProject) : view === "service" ? serviceName(selectedService) : view === "account" ? accounts.find((item) => item.id === selectedAccount)?.alias : nav.find((item) => item.id === view)?.label}</h1></div><div className="safe-badge">● メタデータのみ</div></header>
      {view === "home" && <HomeView credentials={credentials} reviews={reviews} firstVisit={firstVisit} onDismissWelcome={() => setFirstVisit(false)} onReview={(id) => startWizard(Math.max(0, reviews.findIndex((item) => item.id === id)))} onAll={() => go("review")} onProject={openProject} />}
      {view === "projects" && <ProjectsView credentials={credentials} items={visibleProjects} filter={filter} setFilter={setFilter} query={query} setQuery={setQuery} onOpen={openProject} />}
      {view === "project" && <ProjectDetail project={projects.find((item) => item.id === selectedProject)!} credentials={credentials.filter((item) => item.projectId === selectedProject)} onBack={() => go("projects")} onReview={(id) => startWizard(reviews.findIndex((item) => item.id === id))} onEdit={editCredential} />}
      {view === "services" && <ServicesView credentials={credentials} onOpen={openService} />}
      {view === "service" && <ServiceDetail serviceId={selectedService} credentials={credentials} onBack={() => go("services")} onProject={openProject} />}
      {view === "accounts" && <AccountsView accounts={accounts} credentials={credentials} onAdd={addAccount} onEdit={editAccount} onOpen={openAccount} onReview={() => go("review")} />}
      {view === "account" && <AccountDetail account={accounts.find((item) => item.id === selectedAccount)} credentials={credentials} onBack={() => go("accounts")} onProject={openProject} onEdit={editAccount} />}
      {view === "review" && <ReviewView items={reviews} onStart={startWizard} />}
    </main>
    {wizardOpen && wizardItem && <ReviewWizard item={wizardItem} index={wizardIndex} total={reviews.length} accounts={accounts} account={accountDraft} setAccount={setAccountDraft} cloudProject={projectDraft} setCloudProject={setProjectDraft} name={nameDraft} setName={setNameDraft} status={statusDraft} setStatus={setStatusDraft} onClose={() => setWizardOpen(false)} onSave={saveWizard} />}
  </div>;
}

function HomeView({ credentials, reviews, firstVisit, onDismissWelcome, onReview, onAll, onProject }: { credentials: CredentialRecord[]; reviews: CredentialRecord[]; firstVisit: boolean; onDismissWelcome: () => void; onReview: (id: string) => void; onAll: () => void; onProject: (id: string) => void }) {
  return <div className="page">{firstVisit && <section className="welcome"><div><span className="eyebrow">はじめに</span><h2>{scanSummary.repositories}個のプロジェクトを確認しました。</h2><p>現在、{reviews.length}件の認証情報について確認が必要です。まずは分かるものから整理しましょう。</p></div><button className="primary" onClick={() => { onDismissWelcome(); if (reviews[0]) onReview(reviews[0].id); }}>確認を始める</button></section>}<section className="intro"><div><span className="eyebrow">OVERVIEW</span><h2>何を確認すればよいか、ここで分かります。</h2><p>プロジェクトと外部サービスのつながりを、秘密値を持たずに整理します。</p></div><button className="primary" onClick={() => { if (reviews[0]) onReview(reviews[0].id); }} disabled={!reviews.length}>{reviews.length ? "確認を続ける" : "確認済み"}</button></section>
    <section className="metrics"><Metric label="調査対象プロジェクト" value={scanSummary.repositories} /><Metric label="認証情報の参照" value={credentials.length} /><Metric label="要確認" value={reviews.length} accent /><Metric label="利用先不明" value={credentials.filter((item) => !item.projectId).length} /></section>
    <section className="todo"><div className="section-heading"><div><span className="eyebrow">今やること</span><h3>確認が必要</h3></div><button className="text-button" onClick={onAll}>すべて見る →</button></div>{!reviews.length ? <div className="empty-state">現在、確認が必要な項目はありません。</div> : <div className="review-grid">{reviews.slice(0, 5).map((item) => <article className="review-card" key={item.id}><div className="card-top"><span>{projectName(item.projectId)}</span><StatusPill status="要確認" /></div><h4>{serviceName(item.serviceId)}</h4><code>{item.variable}</code><dl><div><dt>アカウント</dt><dd>{item.account}</dd></div><div><dt>Project</dt><dd>{item.cloudProject}</dd></div></dl><button className="secondary" onClick={() => onReview(item.id)}>確認する</button></article>)}</div>}</section>
    <section className="scan-card"><div><span className="eyebrow">プロジェクト調査</span><h3>{scanSummary.repositories}件中 {scanSummary.scanned}件を詳細確認済み</h3><p>最終確認 {scanSummary.lastScanned} ・ 残りは順次スキャン対象</p></div><button className="secondary" onClick={() => onProject("maya")}>確認済みを見る</button></section>
  </div>;
}

function ProjectsView({ credentials, items, filter, setFilter, query, setQuery, onOpen }: { credentials: CredentialRecord[]; items: ProjectRecord[]; filter: string; setFilter: (v: string) => void; query: string; setQuery: (v: string) => void; onOpen: (id: string) => void }) {
  return <div className="page"><PageTitle label="PROJECTS" title="何のサービスを使っているか" text="プロジェクトを開くと、動作に必要な認証情報と未確認項目が分かります。" /><div className="toolbar"><label className="search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="プロジェクト名・Repository名で検索" /></label><div className="segments">{["すべて", "要確認あり", "問題なし"].map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div></div><div className="project-grid">{items.map((project) => { const related = credentials.filter((item) => item.projectId === project.id); const warnings = related.filter((item) => item.status === "要確認" || item.status === "不明").length; const names = [...new Set(related.map((item) => serviceName(item.serviceId)))]; return <article className="project-card" key={project.id}><div className="project-icon">{project.name.slice(0, 1)}</div><div className="card-top"><span>{project.runtime}</span>{warnings ? <StatusPill status="要確認" /> : <StatusPill status="確認済み" />}</div><h3>{project.name}</h3><p>{project.description}</p><div className="project-counts"><div><strong>{related.length}</strong><span>認証情報</span></div><div><strong>{warnings}</strong><span>要確認</span></div></div><div className="tags">{names.map((name) => <span key={name}>{name}</span>)}</div><button className="secondary" onClick={() => onOpen(project.id)}>詳細を見る →</button></article>; })}</div></div>;
}

function ProjectDetail({ project, credentials, onBack, onReview, onEdit }: { project: ProjectRecord; credentials: CredentialRecord[]; onBack: () => void; onReview: (id: string) => void; onEdit: (item: CredentialRecord) => void }) {
  return <div className="page"><button className="back" onClick={onBack}>← プロジェクト一覧</button><section className="project-hero"><div className="project-icon large">{project.name.slice(0, 1)}</div><div><span className="eyebrow">PROJECT</span><h2>{project.name}</h2><p>{project.description}</p></div><StatusPill status={credentials.some((item) => item.status === "要確認") ? "要確認" : "確認済み"} /></section><section className="facts"><div><span>Repository</span><strong>{project.repository}</strong></div><div><span>Runtime</span><strong>{project.runtime}</strong></div><div><span>状態</span><strong>{project.state}</strong></div></section><div className="section-heading"><div><span className="eyebrow">CONNECTIONS</span><h3>使用中のサービス</h3></div></div><div className="connection-list">{credentials.map((item) => <article className="connection" key={item.id}><div className="service-dot">{serviceName(item.serviceId).slice(0, 1)}</div><div className="connection-main"><div className="card-top"><h4>{serviceName(item.serviceId)}</h4><StatusPill status={item.status} /></div><p className="purpose">{item.purpose}</p><div className="detail-grid"><Fact label="認証情報" value={item.name} /><Fact label="アカウント" value={item.account} unknown={item.account === "未確認"} /><Fact label="Project" value={item.cloudProject} unknown={item.cloudProject === "未確認"} /><Fact label="保存場所" value={item.location} /></div><details><summary>詳細情報</summary><div className="tech-details"><code>{item.variable}</code><span>{item.source}</span><span>根拠：{item.evidence}</span></div></details><div className="impact"><span>停止した場合</span><p>{item.impact}</p></div></div><div className="connection-actions"><button className="secondary" onClick={() => onEdit(item)}>名前・メモを編集</button>{item.status === "要確認" && <button className="primary small" onClick={() => onReview(item.id)}>確認する</button>}</div></article>)}</div></div>;
}

function ServicesView({ credentials, onOpen }: { credentials: CredentialRecord[]; onOpen: (id: string) => void }) {
  return <div className="page"><PageTitle label="SERVICES" title="外部サービスの利用先" text="「Geminiをどこで使っていたか」をサービスごとに確認できます。" /><div className="service-list">{services.map((service) => { const related = credentials.filter((item) => item.serviceId === service.id); const projectIds = [...new Set(related.map((item) => item.projectId))]; return <button className="service-row service-button" key={service.id} onClick={() => onOpen(service.id)}><span className={`service-logo ${service.tone}`}>{service.name.slice(0, 1)}</span><span className="service-summary"><strong>{service.name}</strong><small>利用プロジェクト {projectIds.length} ・ 認証情報 {related.length}</small></span><span className="service-projects">{projectIds.length ? projectIds.map((id) => <span key={id}>{projectName(id)}</span>) : <span>現在の利用なし</span>}</span>{related.some((item) => item.status === "要確認") ? <StatusPill status="要確認" /> : <span className="row-arrow">詳細 →</span>}</button>; })}</div></div>;
}

function ServiceDetail({ serviceId, credentials, onBack, onProject }: { serviceId: string; credentials: CredentialRecord[]; onBack: () => void; onProject: (id: string) => void }) {
  const service = services.find((item) => item.id === serviceId);
  const related = credentials.filter((item) => item.serviceId === serviceId);
  const accountNames = [...new Set(related.map((item) => item.account))];
  const projectIds = [...new Set(related.map((item) => item.projectId))];
  if (!service) return null;
  return <div className="page"><button className="back" onClick={onBack}>← サービス一覧</button><section className="entity-hero"><div className={`service-logo ${service.tone}`}>{service.name.slice(0, 1)}</div><div><span className="eyebrow">SERVICE</span><h2>{service.name}</h2><p>利用中のアカウントと、影響するプロジェクトをまとめています。</p></div></section><section className="detail-section"><div className="section-heading"><h3>利用中のアカウント</h3></div><div className="summary-grid">{accountNames.map((account) => { const rows = related.filter((item) => item.account === account); return <article key={account}><span className="provider-label">アカウント</span><h3>{account}</h3><p>認証情報 {rows.length}件 ・ プロジェクト {[...new Set(rows.map((item) => item.projectId))].length}件</p></article>; })}</div></section><section className="detail-section"><div className="section-heading"><h3>利用プロジェクト</h3></div><div className="link-list">{projectIds.map((id) => <button key={id} onClick={() => onProject(id)}><strong>{projectName(id)}</strong><span>{related.filter((item) => item.projectId === id).length}件の認証情報</span><b>詳細 →</b></button>)}</div></section></div>;
}

function AccountsView({ accounts, credentials, onAdd, onEdit, onOpen, onReview }: { accounts: Account[]; credentials: CredentialRecord[]; onAdd: () => void; onEdit: (item: Account) => void; onOpen: (id: string) => void; onReview: () => void }) {
  const unknown = credentials.filter((item) => item.account === "未確認").length;
  return <div className="page"><section className="page-title row"><div><span className="eyebrow">ACCOUNTS</span><h2>アカウントと影響範囲</h2><p>アカウントを失った場合に、どのアプリへ影響するかを確認します。</p></div><button className="primary" onClick={onAdd}>＋ アカウント追加</button></section>{unknown > 0 && <section className="account-warning"><div><strong>{unknown}件</strong><span>アカウントがまだ分かっていません</span></div><button className="secondary" onClick={onReview}>要確認を見る</button></section>}{!accounts.length ? <div className="empty-state tall"><h3>登録済みアカウントはまだありません</h3><p>推測では登録していません。アカウント追加または要確認の回答から登録してください。</p></div> : <div className="account-grid">{accounts.map((account) => { const related = credentials.filter((item) => item.account === account.alias); const used = [...new Set(related.map((item) => item.projectId))]; return <article className="account-card" key={account.id}><span className="provider-label">{account.provider}</span><h3>{account.alias}</h3><p>{account.purpose}</p><div className="project-counts"><div><strong>{used.length}</strong><span>プロジェクト</span></div><div><strong>{related.length}</strong><span>認証情報</span></div></div><div className="tags">{used.map((id) => <span key={id}>{projectName(id)}</span>)}</div><div className="card-actions"><button className="secondary" onClick={() => onOpen(account.id)}>影響範囲を見る</button><button className="text-button" onClick={() => onEdit(account)}>編集</button></div></article>; })}</div>}</div>;
}

function AccountDetail({ account, credentials, onBack, onProject, onEdit }: { account?: Account; credentials: CredentialRecord[]; onBack: () => void; onProject: (id: string) => void; onEdit: (item: Account) => void }) {
  if (!account) return <div className="page"><button className="back" onClick={onBack}>← アカウント一覧</button><div className="empty-state">アカウントが見つかりません。</div></div>;
  const related = credentials.filter((item) => item.account === account.alias);
  const projectIds = [...new Set(related.map((item) => item.projectId))];
  const cloudProjects = [...new Set(related.map((item) => item.cloudProject).filter((item) => item !== "未確認"))];
  return <div className="page"><button className="back" onClick={onBack}>← アカウント一覧</button><section className="entity-hero"><div className="account-symbol">A</div><div><span className="eyebrow">{account.provider}</span><h2>{account.alias}</h2><p>{account.purpose}</p></div><button className="secondary" onClick={() => onEdit(account)}>編集</button></section><section className="facts"><div><span>Project</span><strong>{cloudProjects.length ? cloudProjects.join(" / ") : "未確認"}</strong></div><div><span>利用アプリ</span><strong>{projectIds.length}</strong></div><div><span>認証情報</span><strong>{related.length}</strong></div></section><section className="detail-section"><div className="section-heading"><h3>影響するアプリ</h3></div><div className="link-list">{projectIds.map((id) => <button key={id} onClick={() => onProject(id)}><strong>{projectName(id)}</strong><span>{related.filter((item) => item.projectId === id).map((item) => item.name).join("、")}</span><b>詳細 →</b></button>)}</div></section></div>;
}

function ReviewView({ items, onStart }: { items: CredentialRecord[]; onStart: (index: number) => void }) {
  return <div className="page"><section className="review-hero"><div><span className="eyebrow">NEEDS REVIEW</span><h2>分からなかったことに答える</h2><p>Scannerが判断できなかった項目です。「分からない」のまま後で確認できます。</p></div><div className="review-total"><strong>{items.length}</strong><span>件の確認待ち</span></div></section>{!items.length ? <div className="empty-state tall"><h3>確認待ちはありません</h3><p>すべての項目が整理されています。</p></div> : <><button className="primary start-review" onClick={() => onStart(0)}>1件ずつ確認を始める</button><div className="review-list">{items.map((item, index) => <article key={item.id}><div className="review-number">{String(index + 1).padStart(2, "0")}</div><div><span className="provider-label">{projectName(item.projectId)}</span><h3>{serviceName(item.serviceId)}</h3><code>{item.variable}</code><p>{item.purpose} ・ {item.location}</p></div><div className="missing"><span>未確認</span><strong>{[item.account === "未確認" && "アカウント", item.cloudProject === "未確認" && "Project"].filter(Boolean).join(" / ") || "状態"}</strong></div><button className="secondary" onClick={() => onStart(index)}>確認する</button></article>)}</div></>}</div>;
}

function ReviewWizard({ item, index, total, accounts, account, setAccount, cloudProject, setCloudProject, name, setName, status, setStatus, onClose, onSave }: { item: CredentialRecord; index: number; total: number; accounts: Account[]; account: string; setAccount: (v: string) => void; cloudProject: string; setCloudProject: (v: string) => void; name: string; setName: (v: string) => void; status: Status; setStatus: (v: Status) => void; onClose: () => void; onSave: () => void }) {
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="認証情報の確認"><div className="wizard"><div className="wizard-head"><div><span>{Math.min(index + 1, total)} / {total}</span><div className="progress"><i style={{ width: `${((index + 1) / total) * 100}%` }} /></div></div><button onClick={onClose} aria-label="閉じる">×</button></div><div className="wizard-context"><span>{projectName(item.projectId)}</span><h2>{serviceName(item.serviceId)}</h2><code>{item.variable}</code><p>{item.purpose}<br />{item.source} ・ {item.location}</p></div><div className="form-grid"><label><span>これはどのアカウントですか？</span><input list="account-options" value={account} onChange={(event) => setAccount(event.target.value)} placeholder="分からない" /><datalist id="account-options"><option value="分からない" />{accounts.map((entry) => <option key={entry.id} value={entry.alias} />)}</datalist><small>既存名を選ぶか、新しい分かりやすい名前を入力できます。</small></label><label><span>Projectは？</span><input value={cloudProject} onChange={(event) => setCloudProject(event.target.value)} placeholder="分からない" /><small>新しいProject名も直接入力できます。</small></label><label><span>認証情報名</span><input value={name} onChange={(event) => setName(event.target.value)} /></label><label><span>状態</span><select value={status} onChange={(event) => setStatus(event.target.value as Status)}><option>使用中</option><option>不明</option><option>未使用</option><option>廃止</option></select></label></div><div className="wizard-actions"><button className="text-button" onClick={onClose}>後で確認</button><button className="primary" onClick={onSave}>保存して次へ</button></div></div></div>;
}

function PageTitle({ label, title, text }: { label: string; title: string; text: string }) { return <section className="page-title"><span className="eyebrow">{label}</span><h2>{title}</h2><p>{text}</p></section>; }
function Fact({ label, value, unknown }: { label: string; value: string; unknown?: boolean }) { return <div><span>{label}</span><strong className={unknown ? "unknown" : ""}>{value}</strong></div>; }
