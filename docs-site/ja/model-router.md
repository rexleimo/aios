---
title: モデルルーター
description: マルチモデル Agent Team のためのインテリジェントなモデルディスパッチ — 能力、コスト、成功率に基づいてタスクを最適なモデルに振り分けます。
---

# モデルルーター

> 各モデルの CLI コマンドを暗記しないでください。Agent にタスクを適切なモデルに自動ルーティングさせましょう。

モデルルーターは、マルチモデル Agent Team のためのインテリジェントなディスパッチレイヤーです。モデル能力レジストリを管理し、サブタスクを最適なモデルにマッチングし、正しいプロトコルで CLI コマンドを生成し、知覚フィードバックループを通じてディスパッチ履歴から学習します。

## モデル能力レジストリ

| モデル | プロトコル | 得意分野 | コスト |
|------|----------|--------|------|
| **Claude Opus 4.7** | claude | コードレビュー、アーキテクチャ設計、セキュリティ監査 | 最高 |
| **Claude Sonnet 4.6** | claude | 日常開発、RAG、ラピッドプロトタイピング | 中 |
| **GPT-5.5** | codex | オールラウンダー：自動化、推論、コード実行 | 最高 |
| **DeepSeek-V4-Pro** | claude | アルゴリズム実装、コアロジック、バッチ処理 | 最低 |
| **GLM-5.1** | claude | 数学推論、自律ループ、システムプランニング | 低 |
| **Kimi K2.6** | claude | マルチエージェント編成、フロントエンドUI、長時間実行 | 低 |
| **MiniMax-M2.7** | claude | 自己修復、本番障害復旧 | 低 |
| **Gemini-3-Pro** | gemini | マルチモーダル分析、長文ドキュメント研究、1Mコンテキスト | 中 |

## CLI プロトコル

| プロトコル | CLI | 使用者 |
|----------|-----|---------|
| **codex** | `codex --yolo -m <model> -p "<prompt>"` | GPT-5.5 |
| **gemini** | `gemini -m gemini-3-pro -p "<prompt>"` | Gemini-3-Pro |
| **claude** | `claude --model <model> -p "<prompt>"` | その他すべてのモデル |

## ルーティングルール

| タスクタイプ | 優先モデル | フォールバックチェーン |
|-------------|----------|---------------------|
| コードレビュー | Claude Opus | GPT-5.5 → GLM-5.1 |
| セキュリティ監査 | Claude Opus | GPT-5.5 → GLM-5.1 |
| アーキテクチャ | Claude Opus | GPT-5.5 → GLM-5.1 |
| 実装 | DeepSeek-V4 | GPT-5.5 → Claude Sonnet |
| ブラウザ自動化 | GPT-5.5 | Kimi K2.6 → Claude Sonnet |
| リサーチ | Gemini-3-Pro | GPT-5.5 → Kimi K2.6 |
| プランニング | GLM-5.1 | GPT-5.5 → Claude Opus |
| テスト | Claude Sonnet | GPT-5.5 → DeepSeek-V4 |
| ドキュメント | Claude Sonnet | GPT-5.5 → Kimi K2.6 |
| フロントエンド | Kimi K2.6 | GPT-5.5 → Claude Sonnet |
| 自己修復 | MiniMax-M2.7 | GLM-5.1 → GPT-5.5 |
| 汎用 | GPT-5.5 | Claude Sonnet → DeepSeek-V4 |

## クイックスタート

```bash
# レジストリを表示
node scripts/aios.mjs model-router list

# タスクを最適なモデルにルーティング
node scripts/aios.mjs model-router route --task "auth.js のセキュリティレビュー"

# ディスパッチ統計を表示
node scripts/aios.mjs model-router stats
```

## 環境変数による上書き

```bash
export AIOS_MODEL_PLANNER=claude-opus
export AIOS_MODEL_IMPLEMENTATION=deepseek-v4
export AIOS_MODEL_REVIEWER=claude-opus
```

## 設定ファイル

| ファイル | 用途 |
|------|---------|
| `memory/specs/model-registry.json` | モデル能力、ルーティングルール、CLIプロトコル設定 |
| `memory/specs/orchestrator-agents.json` | Agent ロール→preferredModel マッピング |
| `.claude/skills/model-router/SKILL.md` | Agent 呼び出し可能なセルフサービスルーティングスキル |
| `scripts/lib/model-router.mjs` | ルーターロジック：マッチング、フォールバック、CLIビルド、統計 |
