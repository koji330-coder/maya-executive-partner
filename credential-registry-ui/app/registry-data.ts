export type Status = "要確認" | "使用中" | "不明" | "未使用" | "廃止";

export type CredentialRecord = {
  id: string;
  projectId: string;
  serviceId: string;
  name: string;
  variable: string;
  purpose: string;
  location: string;
  source: string;
  account: string;
  cloudProject: string;
  status: Status;
  evidence: "確認済み" | "コードから推定";
  impact: string;
  note?: string;
};

export type ProjectRecord = {
  id: string;
  name: string;
  description: string;
  repository: string;
  runtime: string;
  state: string;
};

export const projects: ProjectRecord[] = [
  { id: "maya", name: "MAYA", description: "AI経営参謀アプリ", repository: "maya-executive-partner", runtime: "Cloudflare Workers / Expo", state: "稼働中" },
  { id: "fitlog-d1", name: "Fit-Log D1", description: "筋トレ・食事記録アプリ", repository: "Fit-Log-D1", runtime: "Cloudflare Workers / Expo", state: "稼働中" },
  { id: "fitlog-gas", name: "Fit-Log Apps Script", description: "トレーニング記録の旧バックエンド", repository: "Fit-Log", runtime: "Google Apps Script", state: "確認中" },
  { id: "voicebox", name: "VoiceBox", description: "音声メモ・会議録音アプリ", repository: "voicebox", runtime: "Cloudflare Workers / Expo", state: "稼働中" },
  { id: "haksai", name: "HAKSAI Central", description: "EC運営データ基盤", repository: "HAKSAI_Central_Backup", runtime: "Google Apps Script / Cloudflare Workers", state: "稼働中" },
  { id: "motion", name: "Character Motion Studio", description: "キャラクター画像生成パイプライン", repository: "character-motion-studio", runtime: "Node CLI", state: "利用中" },
];

export const services = [
  { id: "gemini", name: "Google Gemini", tone: "violet" },
  { id: "cloudflare", name: "Cloudflare", tone: "orange" },
  { id: "github", name: "GitHub", tone: "slate" },
  { id: "expo", name: "Expo / EAS", tone: "slate" },
  { id: "fitlog", name: "Fit Log", tone: "green" },
  { id: "voicebox", name: "VoiceBox", tone: "blue" },
  { id: "haksai", name: "HAKSAI Central", tone: "gold" },
  { id: "typesafe", name: "TypeSafe / Jev", tone: "pink" },
  { id: "gps", name: "GPS Log", tone: "blue" },
  { id: "openrouter", name: "OpenRouter", tone: "green" },
];

export const seedCredentials: CredentialRecord[] = [
  { id: "maya-gemini-free", projectId: "maya", serviceId: "gemini", name: "MAYA Gemini Free", variable: "GEMINI_API_KEY_FREE", purpose: "通常会話・AI生成", location: "Cloudflare Worker", source: "server/src/chat.ts", account: "未確認", cloudProject: "未確認", status: "要確認", evidence: "確認済み", impact: "MAYAのAI会話が利用できなくなる可能性があります。" },
  { id: "maya-gemini-paid", projectId: "maya", serviceId: "gemini", name: "MAYA Gemini Paid", variable: "GEMINI_API_KEY_PAID", purpose: "有料フォールバック", location: "Cloudflare Worker", source: "server/src/chat.ts", account: "未確認", cloudProject: "未確認", status: "要確認", evidence: "確認済み", impact: "無料枠の上限到達後に会話を継続できなくなる可能性があります。" },
  { id: "maya-encryption", projectId: "maya", serviceId: "cloudflare", name: "MAYA 暗号化キー", variable: "KEY_ENCRYPTION_KEY", purpose: "利用者が登録した認証情報の暗号化", location: "Cloudflare Worker", source: "server/src/memory/apiKeys.ts", account: "未確認", cloudProject: "未確認", status: "要確認", evidence: "確認済み", impact: "新しい認証情報を安全に保存できなくなる可能性があります。" },
  { id: "maya-fitlog", projectId: "maya", serviceId: "fitlog", name: "MAYA Fit Log 接続", variable: "FITLOG_API_KEY", purpose: "健康・筋トレデータ取得", location: "Cloudflare Worker", source: "server/src/fitlog.ts", account: "未確認", cloudProject: "未確認", status: "要確認", evidence: "確認済み", impact: "MAYAがFit Logのデータを参照できなくなる可能性があります。" },
  { id: "maya-haksai", projectId: "maya", serviceId: "haksai", name: "MAYA HAKSAI 接続", variable: "HAKSAI_MCP_CLIENT_ID", purpose: "在庫・売上データ取得", location: "Cloudflare Worker", source: "server/src/haksai.ts", account: "未確認", cloudProject: "未確認", status: "要確認", evidence: "確認済み", impact: "MAYAがEC運営データを参照できなくなる可能性があります。" },
  { id: "maya-keepa", projectId: "maya", serviceId: "haksai", name: "MAYA Keepa 接続", variable: "HAKSAI_KEEPA_CLIENT_ID", purpose: "商品データ取得", location: "Cloudflare Worker", source: "server/src/haksai.ts", account: "未確認", cloudProject: "未確認", status: "要確認", evidence: "確認済み", impact: "MAYAが商品データを取得できなくなる可能性があります。" },
  { id: "maya-voicebox", projectId: "maya", serviceId: "voicebox", name: "MAYA VoiceBox 接続", variable: "VOICEBOX_VAULT_CLIENT_ID", purpose: "会議・音声メモの読み取り", location: "Cloudflare Worker", source: "server/src/voicebox.ts", account: "未確認", cloudProject: "未確認", status: "要確認", evidence: "確認済み", impact: "MAYAがVoiceBoxの記録を参照できなくなる可能性があります。" },
  { id: "maya-jev", projectId: "maya", serviceId: "typesafe", name: "MAYA Jev", variable: "TYPESAFE_API_KEY", purpose: "相談に必要なデータの判定", location: "Cloudflare Worker / 暗号化D1", source: "server/src/jevRouter.ts", account: "未確認", cloudProject: "未確認", status: "要確認", evidence: "確認済み", impact: "道具の選択が従来経路へ戻る可能性があります。" },
  { id: "fitlog-gemini", projectId: "fitlog-d1", serviceId: "gemini", name: "Fit Log Gemini", variable: "GEMINI_API_KEY", purpose: "食事・運動コメント生成", location: "Cloudflare Worker", source: "server/src/env.ts", account: "未確認", cloudProject: "未確認", status: "要確認", evidence: "確認済み", impact: "Fit LogのAIコメントを生成できなくなる可能性があります。" },
  { id: "fitlog-api", projectId: "fitlog-d1", serviceId: "fitlog", name: "Fit Log API 認証", variable: "FITLOG_API_KEY", purpose: "APIリクエスト認証", location: "Cloudflare Worker", source: "server/src/env.ts", account: "未確認", cloudProject: "未確認", status: "要確認", evidence: "確認済み", impact: "MAYAなど外部アプリからの接続が失敗する可能性があります。" },
  { id: "fitlog-gps", projectId: "fitlog-d1", serviceId: "gps", name: "Fit Log GPS Webhook", variable: "GPS_LOG_WEBHOOK_KEY", purpose: "GPS Logへの通知", location: "Cloudflare Worker", source: "server/src/env.ts", account: "未確認", cloudProject: "未確認", status: "要確認", evidence: "確認済み", impact: "GPS Logとの連携が失敗する可能性があります。" },
  { id: "fitlog-gas-gemini", projectId: "fitlog-gas", serviceId: "gemini", name: "Fit Log Apps Script Gemini", variable: "Gemini_API_KEY", purpose: "テキスト・コメント生成", location: "Apps Script Properties", source: "backend/コード.js", account: "未確認", cloudProject: "未確認", status: "要確認", evidence: "確認済み", impact: "旧Fit LogのAI生成が停止する可能性があります。" },
  { id: "motion-gemini", projectId: "motion", serviceId: "gemini", name: "Motion Studio Gemini", variable: "GEMINI_API_KEY", purpose: "キャラクター画像生成", location: "ローカル .env.local", source: "src/cli.ts", account: "未確認", cloudProject: "未確認", status: "要確認", evidence: "確認済み", impact: "画像生成パイプラインを実行できなくなる可能性があります。" },
  { id: "voicebox-access", projectId: "voicebox", serviceId: "cloudflare", name: "VoiceBox Access", variable: "CF_ACCESS_CLIENT_ID", purpose: "保管庫への認証付きアクセス", location: "保存場所を確認中", source: "worker/src", account: "未確認", cloudProject: "未確認", status: "要確認", evidence: "コードから推定", impact: "保管庫への接続に影響する可能性があります（推定）。" },
];

export const scanSummary = { repositories: 37, scanned: 5, lastScanned: "2026-09-30", commit: "bf88776", scannerVersion: "manual-audit-1" };
