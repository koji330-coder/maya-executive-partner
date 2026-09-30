# Credential Registry データモデル

## 目的

この文書は、Credential Registry の画面で扱う情報と、将来の専用D1へ保存する情報を
定義する。APIキーやトークンなどの秘密値はモデルに含めない。

## 利用者に見せる主要データ

### Project

- 名前
- Repository名／URL
- 説明
- Runtime
- 稼働状態

### Service

- 表示名
- 種別
- 利用Project数
- 認証情報数

### Account

- Provider
- 人間向けの別名
- 種別
- 用途
- メモ

ログインIDやパスワードは保存しない。内部IDよりも「個人メイン」などの別名を
通常画面で優先表示する。

### Credential

- 表示名
- Service
- Account
- 外部Project
- 種類
- 状態
- 最終確認日
- メモ

秘密値、暗号化済みの値、末尾文字列を保存するフィールドは作らない。

### 利用先と保存場所

- 利用Project
- 用途
- 利用Component
- Environment
- 保存場所の種類
- 変数名

## Scannerが使う内部データ

### RepositoryScan

- Application
- Commit SHA
- Scanner version
- 実行日時
- 状態
- 除外パス

### ScanFinding

- 変数名
- Source path
- 行番号（任意）
- 推定Service
- 推定保存場所
- 判定区分
- 人への確認質問
- 解決状態

`ScanFinding` はCredentialの確定記録ではない。同じ変数名が複数Repositoryにあっても、
人が確認するまで同一Credentialへ統合しない。

## 状態

| 内部値 | UI表示 | 意味 |
| --- | --- | --- |
| `ACTIVE` | 使用中 | 利用先と所有関係を確認済み |
| `UNKNOWN` | 不明 | 現在の状態を判断できない |
| `UNUSED` | 未使用 | 現在のコードから利用を確認できない |
| `DEPRECATED` | 廃止予定 | 移行後に停止する予定 |
| `REVOKED` | 廃止 | 無効化済み |
| `ROTATE` | 要対応 | ローテーションが必要 |

Accountまたは外部Projectが未確認の場合、Credential自体が使用中でも要確認一覧に残す。

## 初版UIの保存方式

2026-09-30時点の初版Web UIは、確認作業の結果をブラウザのLocal Storageへ保存する。
これは1台でUIと操作を検証するための暫定方式であり、複数端末間の同期は行わない。

次の段階で専用Workerと専用D1へ移す。MAYAのD1とは接続せず、移行時も秘密値を
受け付けないAPI入力検証を先に実装する。
