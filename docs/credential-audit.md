# Credential 利用状況調査

調査日：2026-09-30
区分：メタデータのみの調査。APIキー、トークン、パスワード、Cookie、
Authorization ヘッダーなどの値は読み取らず、記録もしていない。

## 調査範囲と方法

アクセス可能な `Documents` 配下から、ローカルの Git 作業ツリーを37件確認した。
名前とRemoteは列挙したが、それだけをデプロイ状況や所有権の証拠にはしていない。

静的調査では、MAYAサーバーが直接連携している次のアプリを優先した。

- MAYA
- Fit-Log / Fit-Log D1
- VoiceBox
- HAKSAI Central
- Character Motion Studio

`.env*` の内容、ローカルのSecret Store、Cloudflare／GitHubの管理画面は
意図的に調査対象から外した。

判定区分は次のとおり。

- **CONFIRMED**：チェックアウト済みコードに宣言または利用箇所がある
- **INFERRED**：周辺のコードやコメントから用途を直接推定できる
- **UNKNOWN**：コードからは判断できない
- **NEEDS_REVIEW**：管理画面またはアカウント所有者による確認が必要

## 集計

| 項目 | 結果 | 判定 |
| --- | ---: | --- |
| 列挙したローカルGit作業ツリー | 37 | CONFIRMED |
| 優先して静的調査したアプリ | 5 | CONFIRMED |
| Credential参照が見つかったProvider／Service | 7 | CONFIRMED |
| MAYA WorkerのSecret変数名 | 13 | CONFIRMED |
| クライアントへ直接埋め込む公開設定名 | 2 | CONFIRMED |
| 優先調査中に無視対象のローカルdotenvを確認したRepository | 2 | CONFIRMED |
| MAYA内のGitHub Actions Workflow | 0 | CONFIRMED |
| Account／Projectまで紐付けを確定できたCredential | 0 | CONFIRMED |

ここで数えているのはCredentialの実体数ではなく、コード上の**参照数**である。
同じ変数名があっても、同じCredentialが入っているとは断定しない。

## ProviderとApplication

| Application | Provider／Service | Credential参照 | Environment／保存場所 | Runtime | 用途 | 状態 |
| --- | --- | --- | --- | --- | --- | --- |
| MAYA | Google Gemini | `GEMINI_API_KEY_FREE`, `GEMINI_API_KEY_PAID` | Cloudflare Worker Secret。利用者入力のキーを端末キーチェーンへ保存する経路もある | Worker / Expo | 会話生成、無料／有料枠の切替 | NEEDS_REVIEW |
| MAYA | Cloudflare | `KEY_ENCRYPTION_KEY` | Cloudflare Worker Secret | Worker + D1 | D1へ保存する利用者入力キーの暗号化 | CONFIRMED |
| MAYA | Fit Log | `FITLOG_API_KEY` または `FITLOG_CLIENT_ID` + `FITLOG_CLIENT_SECRET` | Cloudflare Worker Secret | Worker | 健康・トレーニングデータの読み取り | CONFIRMED |
| MAYA | HAKSAI Central | `HAKSAI_MCP_CLIENT_ID` + `HAKSAI_MCP_CLIENT_SECRET` | Cloudflare Worker Secret | Worker | 読み取り専用MCPの呼び出し | CONFIRMED |
| MAYA | HAKSAI経由のKeepa | `HAKSAI_KEEPA_CLIENT_ID` + `HAKSAI_KEEPA_CLIENT_SECRET`、またはHAKSAI用の組を流用 | Cloudflare Worker Secret | Worker | 商品データMCPの呼び出し | CONFIRMED |
| MAYA | VoiceBox | `VOICEBOX_VAULT_CLIENT_ID` + `VOICEBOX_VAULT_CLIENT_SECRET` | Cloudflare Worker Secret | Worker | 保管庫の読み取り専用アクセス | CONFIRMED |
| MAYA | TypeSafe / Jev | `TYPESAFE_API_KEY` | Cloudflare Worker Secret。D1に暗号化保存した利用者入力値が優先される場合もある | Worker | Tool経路の判定 | CONFIRMED |
| Fit-Log D1 | Google Gemini | `GEMINI_API_KEY` | Worker Secret／ローカル開発用Secretファイル | Cloudflare Worker | AIテキスト生成 | CONFIRMED |
| Fit-Log D1 | MAYA／内部クライアント | `FITLOG_API_KEY` | Worker Secret | Cloudflare Worker | APIリクエスト認証 | CONFIRMED |
| Fit-Log D1 | GPS Log | `GPS_LOG_WEBHOOK_KEY` | Worker Secret | Cloudflare Worker | Webhook認証 | CONFIRMED |
| Fit-Log（Apps Script） | Google Gemini | `Gemini_API_KEY` | Apps Script Properties Service | Apps Script | テキスト／コメント生成 | CONFIRMED |
| Character Motion Studio | Google Gemini | `GEMINI_API_KEY` | ローカル `.env.local`（Git対象外）。`.env.example`のみ追跡 | Node CLI | 画像生成パイプライン | CONFIRMED |
| VoiceBox | Cloudflare Access | `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` | デプロイ／ローカル設定。正確な保存場所はUNKNOWN | Worker / App | 認証付き保管庫アクセス | INFERRED |

`EXPO_PUBLIC_API_BASE_URL` と `EXPO_PUBLIC_ENV` はSecretではなく公開設定である。
意図的にクライアントへ埋め込まれるため、Registry上のCredentialにはしない。

## MAYAの利用関係

```text
Credential参照
  -> MAYA Workerの利用コンポーネント
  -> 用途

GEMINI_API_KEY_FREE / GEMINI_API_KEY_PAID
  -> server/src/chat.ts、server/src/memory/apiKeys.ts
  -> Geminiへの会話リクエスト。暗号化保存された利用者キーがない場合は
     Worker Secretを予備として使う。

FITLOG_API_KEY または FITLOG_CLIENT_ID + FITLOG_CLIENT_SECRET
  -> server/src/fitlog.ts
  -> Fit Logへのサーバー間リクエスト。

HAKSAI_MCP_CLIENT_ID + HAKSAI_MCP_CLIENT_SECRET
  -> server/src/haksai.ts
  -> Cloudflare Accessで認証された、読み取り専用のHAKSAI MCP呼び出し。

VOICEBOX_VAULT_CLIENT_ID + VOICEBOX_VAULT_CLIENT_SECRET
  -> server/src/voicebox.ts
  -> Cloudflare Accessで認証された、読み取り専用のVoiceBox保管庫呼び出し。

KEY_ENCRYPTION_KEY
  -> server/src/memory/apiKeys.ts、server/src/memory/typesafeKey.ts
  -> 利用者が入力し、D1へ保存されるキーを暗号化するための鍵。
```

## AccountとProjectの対応

| Provider | Account | Project | 対応状況 | 人による確認作業 |
| --- | --- | --- | --- | --- |
| Google / Gemini（MAYA） | UNKNOWN | UNKNOWN | NEEDS_REVIEW | 無料／有料それぞれのキー参照を、Google AI Studio／Cloud Console上のAccount別名・Project別名へ紐付ける |
| Google / Gemini（Fit-Log D1） | UNKNOWN | UNKNOWN | NEEDS_REVIEW | Tier／Project／Billingの表示用ラベルが現在も正しいか確認する。変数名から推測しない |
| Google / Gemini（Apps Script／Motion Studio） | UNKNOWN | UNKNOWN | NEEDS_REVIEW | 配置済みの各キーを発行したAccountとProjectを確認する |
| Cloudflare | UNKNOWN | MAYA用D1の設定は確認済み。AccountはUNKNOWN | NEEDS_REVIEW | Cloudflare Accountの別名とWorker／Projectの別名を登録する |
| GitHub | UNKNOWN | ローカルRepositoryは列挙済み | NEEDS_REVIEW | Organization／User SecretとActions Environmentを別途確認する |

## リスクと確認待ち

1. **すべてのCredential参照で、AccountとProjectの実体が未確認。**
   ソースコード上の名前だけでは、発行者や所有Accountを証明できない。
2. **同名変数が複数アプリに存在する。** `GEMINI_API_KEY` が複数箇所にあるが、
   同じCredentialを使い回している証拠ではない。「重複の可能性」として確認する。
3. **保存場所の調査は未完了。** ソースコード上の契約は確認できるが、実際の
   Cloudflare Secrets、EAS Secrets、GitHub Secrets、Google Secret Manager、
   Apps Script Propertiesの登録名一覧は取得していない。
4. **MAYAには正当な2種類のキー経路がある。** Worker側の予備キーと、端末の
   キーチェーンに置く利用者キーは、別々の保存場所として管理する必要がある。
5. **暗号化D1をSecret Vaultとして扱わない。** これは既存アプリの動作であり、
   Registryへ暗号化済みデータや実値を取り込んではいけない。
6. **Repository調査は段階的に実施中。** 列挙した残り32作業ツリーは、同じScannerを
   実行するまで「調査済み」にしない。

## Git管理の確認

MAYAの `.gitignore` は `.env` と `.env.*` を除外し、`.env.example` だけを許可している。
テンプレートに含まれるのは公開用のExpo設定だけである。

Character Motion Studioも `.env.example` だけを追跡し、ローカルの `.env.local` は
Git対象外になっている。確認したdotenvファイルについては現在の除外規則で対応できて
いるため、`.gitignore` は変更していない。

## 次に確認すること

1. Cloudflare Workers Secrets、EAS Environment、GitHub Actions Secrets、
   Apps Script Propertiesから、値ではなく**登録名だけ**を取得する。
2. Account別名とProject別名を作り、提案した確認フローで各Credential参照へ紐付ける。
3. 列挙したすべてのRepositoryへScannerを実行し、実行日、Commit SHA、除外パスを残す。
4. 所有者、用途、最終確認日のいずれかを確認できないCredentialは、ローテーション候補にする。
