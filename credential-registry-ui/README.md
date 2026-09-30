# Credential Registry

開発プロジェクトと外部サービス、アカウント、認証情報の関係を確認するための
メタデータ専用Web UIです。APIキーやトークンの値は保存・表示しません。

## 現在できること

- ホームで要確認件数と「今やること」を確認
- プロジェクトから利用中のサービスを逆引き
- サービスから利用プロジェクトを逆引き
- アカウントの追加・編集
- 要確認項目を1件ずつ処理するReview Wizard
- 認証情報名とメモの編集
- 確認内容とWizardの進捗をブラウザ内に保存

初期データは `docs/credential-audit.md` の確認済み範囲から作成しています。
AccountとGoogle Cloud Projectは推測せず、すべて要確認から始まります。

## 開発

```bash
npm install
npm run dev
npm run build
```

初版はLocal Storageを使います。専用D1とRepository Scannerは次の段階です。
