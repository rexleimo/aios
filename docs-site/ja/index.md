---
title: 概要
description: Harness CLIは、codex、claude、gemini、opencodeに記憶、協調、検証を追加します。ワークフローは変わりません。
---

# Harness CLI (AIOS)

> ローカル agent ワークフローレイヤー。`codex` / `claude` / `gemini` / `opencode` / `hermes` / `grok` に記憶、協調、検証を追加します。

いつものコマンドを使い続けられます。ワークフローは変わりません。ただ、agent に脳、チーム、自己診断が追加されるだけです。

[3分で始める](getting-started.md){ .md-button .md-button--primary }
[実際に見る](use-cases.md){ .md-button }

## コア機能

| 機能 | 説明 | コマンド |
|---|---|---|
| **ContextDB** | イベント、checkpoint、context pack を持つクロスセッションプロジェクト記憶 | `codex` / `claude` / `gemini` / `opencode` / `hermes` / `grok` が自動ロード |
| **Memo Storage** | Git フレンドリーなプロジェクトメモ。デフォルトは追加専用ファイルストレージ | `aios memo add "note"` / `aios memo storage status` |
| **Native Route Shortcuts** | single/subagent/team/harness レーン向けクライアントネイティブルートプロンプト | Claude/Gemini/OpenCode: `/team <task>`; Codex: `/prompts:team <task>` |
| **Native Token Compression** | RTK/Caveman パターンに着想を得た自前入力/出力削減。競合ツールはインストールしません | `context:pack --token-budget 1200 --token-strategy balanced` |
| **Model Router** | Agent Team 向けインテリジェントマルチモデルディスパッチ。能力、コスト、成功率でタスクをマッチング | `node scripts/aios.mjs model-router route --task "..."` |
| **Codemap** | Tree-sitter コード知識グラフ — ワンコマンドで全エージェントがコード構造を即座に理解 | `aios internal codemap install` / `doctor` |
| **Agent Team** | HUD 追跡、smoke 証跡、governance check 付きマルチ agent 並列協調 | `aios team 3:codex "task description"` / `node scripts/aios.mjs agents smoke --json` |
| **Solo Harness** | resume サポートとランジャーナル付き単一 agent 夜通しタスク | `aios harness run --objective "goal" --worktree` |
| **Perception** | コンテンツ成果トラッキング + 統計インサイト + perception インジェクション | `aios perception record` / `insights` / `summary` |
| **Browser MCP** | CDP 経由ステルスブラウザ自動化 | `aios internal browser doctor` |
| **Hermes Agent** | 7番目の AIOS クライアント、MCP ブリッジが 5 つの AIOSツールを公開 | `aios setup --client hermes` → Hermes で `@aios_context_pack` |
| **Superpowers** | 再利用可能なワークフロースキル（brainstorm/plan/debug/verify） | TUI から選択 |
| **Privacy Guard** | 共有前に機密ファイルを自動リダクション | `aios privacy status` |

## 仕組み

```text
User → codex / claude / gemini / opencode / hermes / grok
     → zsh wrapper (透過的)
     → ctx-agent.mjs (ContextDB 統合)
        → contextdb CLI (記憶永続化)
        → launch native CLI (context pack 付き)
     → browser MCP (オプションブラウザ自動化)
```

インストール後は、いつも通り `codex`、`claude`、`gemini`、`opencode`、`hermes`、`grok` を使うだけ。Harness CLI はバックグラウンドでプロジェクト記憶を自動ロードし、クライアントがサポートする場所にルートショートカットをプロビジョニングします。

## クイックツアー

```bash
# TUI を起動
aios

# Git フレンドリーなプロジェクトメモを保存
aios memo add "Remember to keep auth tests strict"
aios memo storage status

# セットアップ後のネイティブクライアント内ルート
# Claude/Gemini/OpenCode: /team <task>
# Codex: /prompts:team <task>

# マルチ agent 協調
aios team 3:codex "Refactor the auth module and run tests"

# 単一 agent 夜通しタスク
aios harness run --objective "Finish the handoff docs for tomorrow" --worktree

# インテリジェントモデルルーティング
node scripts/aios.mjs model-router route --task "Review auth.js for security issues"

# ネイティブ token 圧縮 ContextDB パケット
cd mcp-server && npm run contextdb -- context:pack --session <session_id> --token-budget 1200 --token-strategy balanced

# コンテンツ成果トラッキング
aios perception record --content-id note_001 --platform xiaohongshu --content-type note --title "Test" --metrics '{"likes":100}'

# タスクステータス確認
aios team status --provider codex --watch
```

## 初めての方へ

**始めるなら:** [クイックスタート](getting-started.md) — インストール、設定、初回 agent 実行を約3分で。

**もう設定済み?** 必要なところにジャンプ:

| したいこと | 移動先 |
|---|---|
| agent にプロジェクト記憶を付与 | [ContextDB](contextdb.md) |
| 複数の agent を一緒に使う | [Agent Team](team-ops.md) |
| 1つの agent を夜通し走らせる | [Solo Harness](solo-harness.md) |
| タスクをインテリジェントにルーティング | [Model Router](model-router.md) |
| token 使用量を削減 | [Token Compression](token-compression.md) |
| 適切なコマンドを見つける | [シナリオ別コマンド](use-cases.md) |

## 要件

- Git
- Node.js 24 LTS + npm
- Windows: PowerShell 5.x or 7

## 開発

```bash
git clone https://github.com/rexleimo/harness-cli.git
cd harness-cli
```

確認:

```bash
cd mcp-server
npm test
npm run typecheck
npm run build
```

## ドキュメント

- [クイックスタート](getting-started.md) — インストール、設定、初回実行
- [Model Router](model-router.md) — Agent Team 向けマルチモデルディスパッチ
- [ContextDB](contextdb.md) — プロジェクト記憶システム
- [Agent Team](team-ops.md) — マルチ agent 協調と workflow governance ガイド
- [Solo Harness](solo-harness.md) — 夜通しタスクガイド
- [Perception](perception.md) — コンテンツ成果トラッキング & インサイト
- [アーキテクチャ](architecture.md) — システムアーキテクチャ
- [トラブルシューティング](troubleshooting.md) — よくある問題
- [ユースケース](use-cases.md) — シナリオ別コマンド検索

## ブログハイライト

- [AIOS RL Training System](/blog/ja/rl-training-system/)
- [Agent Governance: Team live 実行の前に証跡を残す](/blog/ja/2026-06-agent-governance/)
- [ContextDB Search Upgrade](/blog/ja/contextdb-fts-bm25-search/)
- [Windows CLI Startup Stability](/blog/ja/windows-cli-startup-stability/)
- [Orchestrate Live](/blog/ja/orchestrate-live/)
