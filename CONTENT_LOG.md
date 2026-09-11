# CONTENT_LOG

このプロジェクトの活動記録。事実のみを書く。推測・誇張・マーケティングコピーは書かない。
不明な点は埋めずに「要確認」と書く。

<!-- 以下、古い順に追記 -->

---
date: 2026-09-11
tags: [新規作成, スターターキット]
sensitivity: home
publishable: unclear
sources: []
---

### やったこと

「MAYA — AI Executive Partner」という、中小企業の経営者・マネージャー向けのiOS優先AIアプリのリポジトリを立ち上げた。事前に用意されたスターターキット（zip）を展開し、`README.md`（プロダクト方針・v0.1スコープ・技術方針）、`docs/`配下10ファイル（PRD・キャラクターバイブル・UX仕様・技術アーキテクチャ・データモデル・AI応答契約・アセットパイプライン・画像生成ガイド・実装計画・受け入れ基準）、`CODEX_BOOTSTRAP.md`（Codexへの実装着手指示）、`PROGRESS.md`、キャラクター参考画像を初回コミットとしてpushした。

### なぜやった

要確認（プロダクトの着想の経緯は本人未確認。README記載のプロダクト方針は明文化された事実として別途記録）。

### 解決方法

READMEに明記された方針：「見た目は、会いたくなるAI美女。頭脳は、社長に反論できる経営参謀。」という2つの価値（親しみやすいAIキャラクターと、会社の文脈を記憶し経営判断に踏み込む参謀機能）を両立させる設計。v0.1は完全な経営管理プラットフォームではなく、「MAYAとの10分間の会話が汎用チャットボットより明確に良い」ことを証明することがマイルストーンと定義されている。技術方針はExpo/React Native/TypeScript/EAS Build、ローカル状態はSQLite、バックエンドAPIでLLMとサーバー側メモリを扱う（PostgreSQL/Supabase許容）。`CODEX_BOOTSTRAP.md`ではPhase 0・Phase 1のみに着手範囲を限定し、キャラクターのビジュアル状態・アニメーション・リップシンク・チャットUI・永続化を明確に分離するアーキテクチャを要求している。

### 成果

リポジトリの初期セットアップ完了。実装はまだ着手していない。

### 使用技術

Expo / React Native / TypeScript / EAS Build / SQLite（予定）/ OmniVoice Studio（音声、voicebox-codex-baseと同様の使用が想定されている）。

### 苦労・失敗

要確認。

### 学び

要確認。

### 素材

`docs/MAYA_CHARACTER_BIBLE.md`、`assets/reference/maya-character-bible.png`。

### コンテンツ候補

要確認。
