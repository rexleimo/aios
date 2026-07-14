---
title: Harness CLI 概要
description: Harness CLI は codex、claude、gemini、opencode、hermes、grok にプロジェクト記憶、協調、ルーティング、検証を追加します。
---

# Harness CLI (AIOS)

Harness CLI はローカル優先の agent ワークフローレイヤーです。普段使っている codex、claude、gemini、opencode、hermes、grok（Grok Build）を置き換えず、セッション間のプロジェクト記憶、並列協調、再開可能な実行、検証ゲートを追加します。

[クイックスタート](getting-started.md){ .md-button .md-button--primary }
[ユースケースを見る](use-cases.md){ .md-button }
[Workflow Policy を読む](workflow-policy.md){ .md-button }
[ブログを読む](/blog/ja/){ .md-button }
[GitHub](https://github.com/rexleimo/harness-cli){ .md-button }

## まず答え

複数のセッションやクライアントでプロジェクトの事実を共有したい場合、独立した作業を複数の agent に分けたい場合、または長い作業を一時停止して後で再開したい場合に Harness CLI が役立ちます。基底の coding client を置き換えるものではなく、すべての履歴を毎回の prompt に自動注入するものでもありません。

## コア機能

| 機能 | 役割 | 入口 |
|---|---|---|
| **ContextDB** | 必要なときに読むプロジェクト記憶、memo、checkpoint、context pack | aios init / [ContextDB](contextdb.md) |
| **Workflow Policy** | noop、direct、guarded、planned からリスクに合う route を選ぶ | [Workflow Policy](workflow-policy.md) |
| **Agent Team** | governance と HUD 証跡を伴う独立作業の並列協調 | aios team / [Agent Team](team-ops.md) |
| **Solo Harness** | journal と再開入口を持つ長時間タスク | aios harness run / [Solo Harness](solo-harness.md) |
| **RTK / Caveman** | ローカル出力ノイズと response style を別々に扱う | [Token Intelligence](token-compression.md) |
| **Headroom MCP** | 対応 MCP client から明示的に圧縮・取得する | [Token Intelligence](token-compression.md) |
| **Verification / Privacy** | doctor、テスト、quality gate、機密情報の redaction | [トラブルシューティング](troubleshooting.md) |

## 今すぐ実行

~~~bash
# プロジェクトルートで client guidance と marker を初期化。
aios init --all

# native sync、runtime、安全チェックを確認。
aios doctor --native --verbose
~~~

marker は .aios/context-db/index.json を指します。ContextDB は pull-based で、必要な project material だけを検索します。起動ごとに全履歴を読み込む仕組みではありません。

## 目的別の入口

| 目的 | 推奨 |
|---|---|
| 質問や読み取りだけを行う | [Workflow Policy](workflow-policy.md) の direct |
| 小さく明確なローカル変更 | guarded と verification |
| 複数ファイル、長い作業、再開可能な作業 | planned / [Solo Harness](solo-harness.md) |
| 独立した作業パッケージを並列化 | [Agent Team](team-ops.md) |
| 段階的な quality-gated orchestration | [Use Cases](use-cases.md) |

## 実行境界

~~~text
ユーザー
  -> codex / claude / gemini / opencode / hermes / grok
  -> native guidance + .aios/context-db/index.json
  -> ContextDB の検索 / memo / checkpoint
  -> Team、Solo Harness、Orchestrate（必要な場合）
  -> browser-use CDP（ブラウザ作業の場合）
~~~

Playwright MCP は compatibility path として残り、ブラウザの既定ドキュメントは browser-use CDP を使います。RTK、Caveman、Headroom MCP にはそれぞれ別の install、consent、verification 境界があります。

## 初回の流れ

1. [クイックスタート](getting-started.md) で aios init --all を実行します。
2. aios doctor --native --verbose の evidence を確認します。
3. 対応する client を通常どおり起動します。
4. 記憶の詳細は [ContextDB](contextdb.md)、route の選び方は [Workflow Policy](workflow-policy.md) を読みます。

## 関連ページ

- [Windows ガイド](windows-guide.md) - PowerShell の install と recovery。
- [アーキテクチャ](architecture.md) - runtime と compatibility の境界。
- [ケースライブラリ](case-library.md) - cross-client、browser、privacy の再現可能な例。
- [Friends](friends.md) - 関連プロジェクトと ecosystem。
- [ブログ](/blog/ja/) - チュートリアル、リリース、deep dive。

## ブログの注目記事

- [4.0.0 Adaptive Workflow Policy](/blog/ja/2026-07-v400-adaptive-workflow-policy/)
- [Agent workflow の選び方](/blog/ja/2026-07-choose-agent-workflow/)
- [Raw CLI から reliable workflow へ](/blog/ja/2026-07-raw-cli-to-reliable-workflow/)
- [ContextDB Search Upgrade](/blog/ja/contextdb-fts-bm25-search/)

## コア記事

- [AIOS RL Training System](/blog/ja/rl-training-system/)
- [ContextDB Search Upgrade](/blog/ja/contextdb-fts-bm25-search/)
- [Windows CLI Startup Stability](/blog/ja/windows-cli-startup-stability/)
- [Orchestrate Live](/blog/ja/orchestrate-live/)
