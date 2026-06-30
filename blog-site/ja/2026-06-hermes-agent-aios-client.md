---
title: "Hermes Agent が AIOS のファーストクラスクライアントに昇格"
description: "Harness CLI が Hermes Agent (Nous Research) をファーストクラス AIOS クライアントとして登録。MCP ブリッジサーバーが 5 つのコアツール（context-pack、doctor、token compression、skill validation、skill installation）を Hermes セッション内で直接利用可能に。"
date: 2026-06-30
tags: ["Hermes Agent", "AIOS", "MCP", "クライアント", "Skills", "Token Compression"]
---

# Hermes Agent が AIOS のファーストクラスクライアントに昇格

Hermes Agent（Nous Research のオープンソース CLI AI Agent）が、Codex CLI、Claude Code、Gemini CLI、OpenCode、Crush に次ぐ7番目のファーストクラス AIOS クライアントになりました。

これは単なる設定追加ではありません。今回の統合の核心は **MCP ブリッジサーバー** — AIOS の最も価値ある 5 つの能力を Hermes が直接呼び出せる MCPツールとして公開しています。

## なぜ Hermes Agent にこれが必要だったのか

Hermes には `session_search`、`memory`、`delegate_task`、`skill_manage`、`cronjob` といった内蔵ツールがあります。しかし他の AIOS クライアントと同じく、3 つの領域で体系的なサポートが不足しています：

1. **戦略的コンテキスト再呼び出し** — Hermes はセッション履歴を検索できますが、token budget に基づく優先順位ソートでの切り詰めはできません。長いセッションでは低価値の履歴が context window を溢します。
2. **環境ヘルス自己診断** — MCP 設定の誤り、Node バージョンの不一致、skill ディレクトリの破損 — こうした無言の問題がワークフロー全体を低下させますが、Hermes には自動検出・修復の手段がありません。
3. **大規模出力の圧縮** — ブラウザスクリーンショット、長いシェル出力、HTML dumps が context window に直接入ると token が浪費されます。Hermes には中間層の intercept がありません。

AIOS MCP ブリッジがこの 3 つのギャップを埋めます。

## 5 つの MCP ツール

`scripts/aios-mcp-server.mjs` が新しい MCP ブリッジサーバーです。5 つのツールを公開します：

### aios_context_pack

token budget 対応のコンテキスト圧縮。3 つのストラテジー：

| ストラテジー | 動作 | 利用場面 |
|------------|------|----------|
| `legacy` | 末尾切り詰め | 単純場面、優先順位不要 |
| `balanced` | 優先順位ソート後切り詰め | 日常使用、重要情報を保持 |
| `aggressive` | 重要信号のみ | harness/checkpoint モード、最大圧縮 |

```bash
aios_context_pack(query="auth bug fix history", token_budget=2000, strategy="balanced")
```

### aios_doctor_suite

完全ヘルスチェック — MCP 設定、Node バージョン、ContextDB 状態、skill ディレクトリ、クライアント接続性。`--fix` で自動修復対応。

```bash
aios_doctor_suite(workspace="/path/to/project", fix=true)
```

### aios_intercept_compress

大規模ツール出力の圧縮。3 つの圧縮モード：

| モード | 圧縮レベル | 利用場面 |
|------|-----------|----------|
| `tight` | バランス | デフォルト |
| `ultra` | 最大 | harness/checkpoints |
| `precise` | 最小 | 安全重要操作 |

```bash
aios_intercept_compress(text="<raw browser output>", mode="tight", tool_name="page.screenshot")
```

### aios_skill_validate

Hermes/AIOS skill ディレクトリ構造の検証 — SKILL.md frontmatter 必須フィールド（name、description、version、author）、内容完全性、参照ファイル存在性をチェック。

```bash
aios_skill_validate(skill_path="/path/to/.hermes/skills/my-skill")
```

### aios_skill_install

AIOS skill-sources から Hermes の `.hermes/skills/` ディレクトリに skill をインストール。`copy`（ポータブル）と `link`（ローカル開発）の 2 つのインストールモード。

```bash
aios_skill_install(skill_name="context-pack", install_mode="copy")
```

## クライアント登録詳細

Hermes は `CLIENT_DEFINITIONS` に以下の情報で登録されています：

| プロパティ | 値 | 注記 |
|----------|----|----|
| capabilities | skills, native, harness, superpowers | team/agents はまだ未対応 |
| commandName | hermes | CLI コマンド |
| runtimeClientId | hermes-agent | ランタイム識別子 |
| projectSkillRoot | `.hermes/skills` | skill インストールディレクトリ |
| instructionFileName | AGENTS.md | Hermes はプロジェクトルートの AGENTS.md を自動ロード |
| modelArgFlag | `--model` | モデル選択フラグ |
| unattendedArgs | 空 | Hermes に `--yolo` モードはない |

MCP 設定の 2 スコープ：

| スコープ | ファイル | 注記 |
|---------|---------|------|
| プロジェクト | `.mcp.json` | Claude Code と共有 |
| ホーム | `config.yaml` (`~/.hermes/` 内) | Hermes YAML 設定 |

## 有効化方法

### Step 1: AIOS がインストール済みか確認

```bash
aios doctor
```

### Step 2: Setup を実行

```bash
aios          # TUI → Setup → hermes を選択
```

または直接：

```bash
aios setup --client hermes
```

### Step 3: MCP ブリッジを確認

```bash
aios doctor --fix
# Doctor が aios-mcp-server を Hermes MCP 設定に自動登録します
```

### Step 4: Hermes 内で使用

プロジェクトで Hermes を起動。5 つの AIOS MCPツールが自動的に利用可能になります：

```bash
hermes
# 会話内：@aios_context_pack query="..." token_budget=2000 strategy="balanced"
```

## 他クライアントとの違い

| 特徴 | Codex/Claude | Hermes |
|------|-------------|--------|
| Skills ディレクトリ | `.codex/skills` / `.claude/skills` | `.hermes/skills` |
| 指示ファイル | AGENTS.md / CLAUDE.md | AGENTS.md（共有） |
| 無人モード | `--yolo` / `--dangerously-skip-permissions` | なし（`delegate_task` 使用） |
| MCP 設定 | JSON / TOML | JSON + YAML デュアルスコープ |
| Team オーケストレーション | 対応 | 未対応（将来拡張） |

## 次のステップ

- **Hermes ネイティブ skill の抽出** — `context-pack`、`hermes-doctor` 等を AIOS skill-sources から `.hermes/skills/` 形式に抽出
- **Team オーケストレーション拡張** — Hermes の `delegate_task` は既にサブエージェントディスパッチをサポート；将来 AIOS 多クライアント Team オーケストレーションと統合
- **ACP サブエージェントブリッジ** — Hermes は ACP (例: Copilot CLI) をサポート；AIOS `delegate_task` との融合でクロスクライアントオーケストレーションが可能

---

完全なガイドは [AIOS ドキュメント](https://cli.rexai.top/ja/) を参照。多クライアントワークフローの安全性については [Agent Governance](/blog/ja/2026-06-agent-governance/) を確認してください。
