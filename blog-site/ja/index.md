---
title: ブログハブ
description: AIOS — codex、claude、gemini、opencode、Grok Build に記憶、協調、検証を追加するローカル agent ワークフローレイヤーの解説。
---

# ブログ

AI coding agent をより賢く、より可靠に、より使いやすくするためのストーリー、チュートリアル、深い考察。

AIOS はローカル agent ワークフローレイヤーです。新しい coding agent ではなく、既存の `codex`、`claude`、`gemini`、`opencode` に記憶、チームワーク、自己診断を追加するレイヤーです。

## ここから始める

AIOS を初めて使う方へ。これらの投稿で概要を把握できます:

- [AIOS のストーリー](launch-post.md) — なぜ作られたか、どんな問題を解決するか
- [CLI 比較：生 vs. AIOS](cli-comparison-post.md) — レイヤーを追加すると何が変わるか
- [自動化プレイブック](automation-playbook-post.md) — 日次使用的パタン
- [v4.0 適応型ワークフローポリシー](2026-07-v400-adaptive-workflow-policy.md) — ルートと計画の選び方
- [AI エージェントのワークフローはどう選ぶ？](2026-07-choose-agent-workflow.md) — 判断表と具体例
- [素の CLI から信頼できるワークフローへ](2026-07-raw-cli-to-reliable-workflow.md) — 再現可能な境界の作り方

## 最新の記事

- [v5.8.1: エージェントがフリーズしない — aios-shell 停止修正と LLM の意味判断による要件明確化](2026-08-v581-stall-fix-llm-judged-grilling.md)
- [v5.8.0: AIOS が安全に自己進化する — Session Memory、証拠ゲート、ロールバック可能な昇格](2026-08-v580-governed-self-evolution.md)
- [v5.6.1: プラン駆動のマルチエージェントディスパッチ — aios work がプランを読む](2026-08-v561-aios-work-plan-driven-dispatch.md)
- [v5.6.0: 並列マルチエージェントコーディングを1コマンドで — aios work](2026-08-v560-aios-work-concurrent-dispatch.md)
- [Graph Engine とローカルエージェント：AIOS が Loop Engineering を Graph Engineering へ接続する仕組み](2026-08-10-aios-loop-graph-engineering.md)
- [v5.5.1：証拠駆動の Agent ライフサイクル昇格](2026-08-v551-agent-lifecycle-promotion.md)
- [v5.5.0: Ask-First 要件アライメント——エージェントが不要なものを届けなくなる](2026-08-v550-ask-first-requirements-alignment.md)
- [v5.4.4：エージェントスモークテストの信頼性——出力コントラクトクライアントとタイムアウト自動エスカレーション](2026-08-v544-agent-smoke-reliability.md)
- [v5.4.3：CRG 決定チェックポイント、Worker Journal リネーム、冪等な aios init](2026-08-v543-crg-decision-checkpoints.md)
- [v5.4.1：Windows で「aios update」が壊れていた理由と、自己更新の修正](2026-08-v541-windows-self-update-safety.md)
- [並列コーディングエージェントは無料ではない: Git Worktree はファイルを隔離し、状態は隔離しない](2026-08-parallel-coding-agents.md)
- [Agent セキュリティは状態機械の問題: Codex セキュリティスレッドが見逃したもの](2026-08-ai-agent-security.md)
- [AI コーディングコストは制御不能: Cursor は数字を隠し、Amazon は 180 万ドルを溶かし、ローカルレイヤーが変えるもの](2026-08-ai-coding-cost-crisis.md)
- [v5.4.0：ワークフローイテレーション v2.1 — Activation の安全性、型付き Evidence 契約、全 Skill 監査](2026-08-v540-workflow-iteration-v21.md)
- [v4.0 適応型ワークフローポリシー](2026-07-v400-adaptive-workflow-policy.md)
- [AI エージェントのワークフローはどう選ぶ？](2026-07-choose-agent-workflow.md)
- [素の CLI コマンドから信頼できる AI エージェントワークフローへ](2026-07-raw-cli-to-reliable-workflow.md)
- [v3.6.0：Headroom と Ponytail でより安全な Token インテリジェンス workflow を作る](2026-07-headroom-token-intelligence.md)
- [v3.2.0：Harness 信頼性とスキルライフサイクル向上](2026-07-v320-harness-reliability-upgrade.md)
- [Grok Build が AIOS のファーストクラスクライアントに](2026-07-grok-build-aios-client.md)
- [Hermes Agent が AIOS ファーストクラスクライアントに昇格](2026-06-hermes-agent-aios-client.md)
- [v2.0.2: より安全な Skill Health Records とよりクリーンな Crush Config](2026-06-v202-ecc-uplift.md)
- [Agent Governance: Team live 実行の前に証跡を残す](2026-06-agent-governance.md)
- [v1.52.0: 決定論的 Shell 出力圧縮 (MCP 経由)](2026-06-v152-aios-shell-mcp.md)
- [v1.50.1: All-Client Token Compression Compliance](2026-06-v1501-token-compression-compliance.md)
- [v1.50.0：記憶、ドキュメント、計画、コードを横断する統合 AIOS 検索](2026-06-v150-unified-aios-search.md)
- [Codemap：AIエージェントにコードベースの地図を](2026-05-codemap-crg.md)
- [ContextDB Token 圧縮：より小さな context pack と安全な recall](2026-05-token-compression.md)
- [Model Router：すべてのタスクに適切なモデル](2026-05-model-router.md)
- [aios memo GUI：Agent の記憶を生きたグラフとして可視化](2026-05-aios-memo-gui.md)
- [Solo Harness: 1つの Agent を夜通し動かしても制御を失わない](2026-04-solo-harness.md)
- [debug-hub: Agent が自らデバッグする時代](2026-05-debug-hub-mcp.md)
- [Browser MCP 改善：より賢いページ読み取り](2026-04-browser-mcp-weak-model-upgrade.md)
- [高度なデザインスキルでページ制作：曖昧プロンプトを本番 UI に](advanced-design-skills-page-building.md)
- [AIOS TUI リファクタリング：React Ink によるモダンなターミナルUI](2026-04-rexcli-ink-tui-refactor.md)
- [Windows CLI 起動安定性アップデート](windows-cli-startup-stability.md)

## 深い考察

- [AIOS RL Training System: Agent に学習させる](rl-training-system.md)
- [ContextDB 検索：履歴の中からを見つける](contextdb-fts-bm25-search.md)
- [Orchestrate Live：本番で Subagent を実行する](orchestrate-live.md)

## FAQ

### どこから始めたらいいですか？
まず [AIOS のストーリー](launch-post.md) を読み、次に [クイックスタート](https://cli.rexai.top/ja/getting-started/) ガイドを試してください。

### 記憶とコンテキスト管理を大事にしたい
[Token 圧縮](2026-05-token-compression.md) から始めて、[ContextDB 検索](contextdb-fts-bm25-search.md) を読んでください。

### agent を夜通し走らせたい
[Solo Harness](2026-04-solo-harness.md) を読んでから、[Solo Harness ドキュメント](https://cli.rexai.top/ja/solo-harness/) を確認してください。

### agent に自らデバッグさせたい
[debug-hub](2026-05-debug-hub-mcp.md) を読んでから、[debug-hub ドキュメント](https://cli.rexai.top/ja/debug-hub/) を確認してください。

### AIOS は新しい coding agent ですか？
いいえ。`codex`、`claude`、`gemini`、`opencode` をラップして記憶、チームワーク、自己診断を追加します。ワークフローは変わりません。
