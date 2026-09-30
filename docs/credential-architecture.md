# Credential Registry アーキテクチャ

## 方針

パスワードマネージャーではなく、MAYA のアプリ用 D1 を拡張するものでもない、
**メタデータ専用の Credential Registry** を独立して構築する。
現在の MAYA Worker は実行時の秘密情報とユーザーデータを扱っている。
ここへ管理台帳を混在させると、将来の管理画面から秘密値へ到達できる経路を
誤って作るおそれがある。

Registry に保存するのは、Credential の識別情報、所有者ラベル、用途、保存場所、
状態、確認記録だけとする。Credential の値、暗号化済みの値、トークン末尾、
Authorization ヘッダー、パスワード、Cookie、アップロードされた dotenv ファイルは
保存しない。

## 配置案

```text
ローカル Repository Scanner（メタデータのみ）
        |
        v
Credential Registry API + 専用 D1 データベース
        |                         |
        |                         +-- スキャン結果 / 要確認一覧
        v
非公開の Registry Web UI
        |
        +-- Provider / Account / Project / Credential / Application 画面
```

Cloudflare Access で保護した専用の Cloudflare Worker と D1 データベースを使う。
MAYA の D1 をバインドせず、MAYA の実行環境用 `Env` を取り込まず、実行時の
Credential 値を受け取らない。Scanner が送信するのは変数名、ソースパス、
リポジトリのメタデータ、判定区分だけとする。

## データモデル

```text
Provider 1--* Account 1--* Project 1--* Credential
Credential 1--* SecretLocation
Application *--* Credential（CredentialUsage）
RepositoryScan 1--* ScanFinding
ScanFinding 0..1 -> Credential（人が紐付けた後）
```

### 主要Entity

| Entity | 必須フィールド |
| --- | --- |
| Provider | `id`, `name`, `kind`, `notes` |
| Account | `id`, `provider_id`, `alias`, `type`, `email_label`, `notes` |
| Project | `id`, `provider_id`, `account_id`, `name`, `external_project_id`, `notes` |
| Credential | `id`, `provider_id`, `account_id?`, `project_id?`, `name`, `credential_type`, `status`, `created_at?`, `expires_at?`, `last_verified_at?`, `notes` |
| SecretLocation | `id`, `credential_id`, `location_type`, `location_name`, `environment`, `variable_name`, `notes` |
| Application | `id`, `name`, `repository_url?`, `local_path?`, `description`, `runtime`, `status` |
| CredentialUsage | `id`, `application_id`, `credential_id`, `environment`, `purpose`, `component`, `detected_by`, `confidence`, `last_verified_at` |
| RepositoryScan | `id`, `application_id`, `repository_commit?`, `scanner_version`, `started_at`, `completed_at`, `status` |
| ScanFinding | `id`, `scan_id`, `variable_name`, `source_path`, `line_number?`, `provider_guess`, `location_guess`, `classification`, `review_question`, `resolution` |

`credential_type` は `API_KEY`、`PAT`、`SERVICE_TOKEN`、`CLIENT_SECRET`、
`ACCESS_TOKEN`、`OTHER` に限定する。`status` は `ACTIVE`、`UNKNOWN`、
`UNUSED`、`DEPRECATED`、`REVOKED`、`ROTATE` に限定する。

## スキャンと確認の流れ

1. ローカル Scanner がソース／設定ファイルから秘密情報への**参照**を探す。
   対象は `process.env`、`import.meta.env`、Wrangler のバインディング、
   Apps Script のプロパティ名、CI 設定など。`.env*`、Secret Store、
   バイナリ、Git メタデータ、依存パッケージ、ビルド出力は除外する。
2. Detector が `ScanFinding` を作る。Provider や保存場所の推定は事実ではなく、
   **INFERRED（コードから推定）**として記録する。
3. `variable_name + application + component` が既存記録と一致する場合は、
   紐付け候補として提示する。変数名が同じという理由だけで、同じ Credential へ
   自動的に紐付けてはいけない。
4. 人が既存 Credential に紐付けるか、メタデータだけの新規Credentialを作り、
   Account／Project の別名と状態を選ぶ。
5. UI に `last_verified_at`、確認者、不確実な点を記録する。人が処理するまでは
   `NEEDS_REVIEW` のままにする。

## 今回の調査から作る初期記録

まず Application として、MAYA、Fit-Log D1、Fit-Log（Apps Script）、VoiceBox、
HAKSAI Central、Character Motion Studio を登録する。

Provider として、Google Gemini、Cloudflare、GitHub、Expo/EAS、Fit Log、
VoiceBox、HAKSAI Central、TypeSafe を登録する。

`credential-audit.md` にある変数参照は、確定済み Credential ではなく、
**要確認の検出結果**として登録する。特に MAYA の2種類の Gemini 変数と、
複数アプリにある `GEMINI_API_KEY` は、Account と Project の対応が確認できるまで
互いに紐付けない。

## UI要件

- Dashboard：Provider／Application数、状態別件数、未解決の確認項目を表示する。
  Credential の件数とソースコード上の参照数を区別する。
- Credential一覧・詳細：値を保持する項目や表示・コピー機能を作らない。
  利用先、保存場所、Account／Projectの別名、状態、確認履歴を表示する。
- Application画面：`CredentialUsage` と未解決の検出結果を使い、
  「このアプリを動かすために何が必要か」を逆引きできるようにする。
- Account／Project画面：それぞれに紐付く利用先を逆引きできるようにする。
- Service／Account詳細：対象を失効した場合に影響するApplicationと認証情報を
  逆引きできるようにする。
- Needs Review画面：質問、確度、根拠、推定Providerを表示し、人が明示的に
  解決操作を行えるようにする。
- Review Wizard：回答を保存したら次の項目へ進み、閉じてもブラウザ内の進捗から
  再開できるようにする。
- Scanner画面：Repository、Commit／実行日、除外パス、検出結果、Scannerの
  バージョンを表示する。ソース本文は保存しない。

## セキュリティ境界と受け入れテスト

- `value`、`secret`、`token`、`password`、`authorization`、`ciphertext`、
  `credential_value` という名前のキーを含む入力は、入れ子になっていても拒否する。
- アプリのログと監査データの書き出しでは、上記に該当する項目をマスクする。
- Registry の UI／API は Cloudflare Access で認証する。更新権限は閲覧権限と
  分けて認可する。
- 実在する dotenv ファイルは読まない。無視対象の dotenv ファイルが存在する
  ことだけは記録できるが、内容は取得しない。
- Provider API を呼び出してキーを「テスト」しない。実施すると Registry 自体が
  Credential を処理するシステムになってしまう。
- 偽のSecretらしい文字列を含むテストデータを用意し、Scanner が変数名とパスしか
  返さないことをテストする。

## 実装順序

初版Web UIの実装場所は `credential-registry-ui/`。確認結果はブラウザ内に保存し、
専用Worker／D1へ移る前の操作検証に使う。

1. Schema、API入力検証、変更不能な確認履歴、手動登録UIを実装する。
2. 今回の監査結果を Application と未解決の検出結果として初期登録する。
3. ローカル Scanner を dry-run で実装し、出力に値が含まれないことを検証する。
4. 確認・紐付けフローと重複候補の警告を追加する。
5. 列挙済みの37作業ツリーをすべてスキャンし、その後 Cloudflare／EAS／GitHub を
   名前だけ取得する情報源として接続する。
6. `last_verified_at` によるローテーション確認を追加する。ソース履歴から
   Credential の作成日や経過日数を推測しない。
