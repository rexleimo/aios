---
title: ブログハブ
description: Harness CLI — codex、claude、gemini、opencodeに記憶、協調、検証を追加するローカルagentワークフローレイヤーについてのストーリー、チュートリアル、深い考察。
---

# ブログ

AI coding agent をより賢く、より可靠に、より使いやすくするためのストーリー、チュートリアル、深い考察。

Harness CLI（AIOS とも呼ばれます）はローカル agent ワークフローレイヤーです。新しい coding agent ではなく、既存の `codex`、`claude`、`gemini`、`opencode` に記憶、チームワーク、自己診断を追加するレイヤーです。

## ここから始める

Harness CLI を初めて使う方へ。これらの投稿で概要を把握できます:

- [Harness CLI のストーリー](launch-post.md) — なぜ作られたか、どんな問題を解決するか
- [CLI 比較：生 vs. Harness CLI](cli-comparison-post.md) — レイヤーを追加すると何が変わるか
- [自動化プレイブック](automation-playbook-post.md) — 日次使用的パタン

## 最新記事

- [v1.50.1: All-Client Token Compression Compliance](2026-06-v1501-token-compression-compliance.md)
- [v1.50.0：記憶、ドキュメント、計画、コードを横断する統合 AIOS 検索](2026-06-v150-unified-aios-search.md)
- [Codemap：AIエージェントにコードベースの地図を](2026-05-codemap-crg.md)
- [ContextDB Token 圧縮：より小さな context pack と安全な recall](2026-05-token-compression.md)
- [ネイティブ Token 圧縮：Harness CLI が RTK や Caveman をインストールしない理由](2026-05-native-token-compression.md)
- [Model Router：すべてのタスクに適切なモデル](2026-05-model-router.md)
- [aios memo GUI：Agent の記憶を生きたグラフとして可視化](2026-05-aios-memo-gui.md)
- [Solo Harness: 1つの Agent を夜通し動かしても制御を失わない](2026-04-solo-harness.md)
- [debug-hub: Agent が自らデバッグする時代](2026-05-debug-hub-mcp.md)
- [Browser MCP 改善：より賢いページ読み取り](2026-04-browser-mcp-weak-model-upgrade.md)
- [高度なデザインスキルでページ制作：曖昧プロンプトを本番 UI に](advanced-design-skills-page-building.md)
- [Harness CLI TUI リファクタリング：React Ink によるモダンなターミナルUI](2026-04-rexcli-ink-tui-refactor.md)
- [Windows CLI 起動安定性アップデート](windows-cli-startup-stability.md)

## 深い考察

- [AIOS RL Training System: Agent に学習させる](rl-training-system.md)
- [ContextDB 検索：履歴の中からを見つける](contextdb-fts-bm25-search.md)
- [Orchestrate Live：本番で Subagent を実行する](orchestrate-live.md)

## FAQ

### どこから始めたらいいですか？
まず [Harness CLI のストーリー](launch-post.md) を読み、次に [クイックスタート](https://cli.rexai.top/ja/getting-started/) ガイドを試してください。

### 記憶とコンテキスト管理を大事にしたい
[Token 圧縮](2026-05-token-compression.md) から始めて、[ContextDB 検索](contextdb-fts-bm25-search.md) を読んでください。

### agent を夜通し走らせたい
[Solo Harness](2026-04-solo-harness.md) を読んでから、[Solo Harness ドキュメント](https://cli.rexai.top/ja/solo-harness/) を確認してください。

### agent に自らデバッグさせたい
[debug-hub](2026-05-debug-hub-mcp.md) を読んでから、[debug-hub ドキュメント](https://cli.rexai.top/ja/debug-hub/) を確認してください。

### Harness CLI は新しい coding agent ですか？
いいえ。`codex`、`claude`、`gemini`、`opencode` をラップして記憶、チームワーク、自己診断を追加します。ワークフローは変わりません。
