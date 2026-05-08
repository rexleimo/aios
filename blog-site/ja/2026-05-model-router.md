---
title: "Model Router：Agent Team のためのインテリジェントなマルチモデルディスパッチ"
description: "Model Router の紹介 — 能力、コスト、成功率に基づいてサブタスクを最適なモデルにマッチングし、CLI プロトコルを自動選択するインテリジェントディスパッチレイヤー。"
date: 2026-05-08
tags: ["model-router", "multi-model", "Agent Team", "orchestration", "dispatch", "AIOS"]
---

# Model Router：Agent Team のためのインテリジェントなマルチモデルディスパッチ

すべての coding agent には得意分野があります。Claude Opus はコードレビューとアーキテクチャ設計に優れています。DeepSeek-V4 は実装において高速かつ低コストです。Gemini-3-Pro は 100 万トークンの研究ドキュメントを処理できます。GPT-5.5 はあらゆるタスクをそつなくこなすオールラウンダーです。

しかし、ここに問題があります：**オーケストレーターはどのモデルがどのタスクに最適かを覚えておく必要があり**、さらに各モデルの CLI コマンドを正しく構築しなければなりません。`claude --model <name>` vs `codex --yolo -m <name>` vs `gemini -m <name>`。8 つのモデル、12 種類のタスクタイプ、コストを考慮したフォールバックチェーン — ツールなしではどんな人間（あるいはエージェント）も把握しきれません。

**Model Router** は、エージェントが直接呼び出せるシンプルなディスパッチレイヤーでこの問題を解決します。

## 仕組み

Model Router は 4 ステップのパイプラインです：

1. **分析** — サブタスクの説明を読み取り、タスクタイプ（コードレビュー、実装、リサーチなど）にマッチング
2. **ルーティング** — 能力マッチでプライマリモデルを選択し、コスト昇順のフォールバックチェーンを付与
3. **ディスパッチ** — モデルのプロバイダー（claude/codex/gemini）に応じて正しい CLI コマンドを生成
4. **学習** — ディスパッチ結果を ContextDB に記録し、成功率のフィードバックに活用

```bash
# 説明からタスクタイプを自動検出
node scripts/aios.mjs model-router route --task "Review auth.js for security vulnerabilities"
# → security-review → Claude Opus (優先)
# → フォールバックチェーン: GPT-5.5 → GLM-5.1

node scripts/aios.mjs model-router route --task "Implement a user login endpoint"
# → implementation → DeepSeek-V4 (優先)
# → フォールバックチェーン: GPT-5.5 → Claude Sonnet

node scripts/aios.mjs model-router route --task "Research React 19 migration strategies"
# → research → Gemini-3-Pro (優先)
# → フォールバックチェーン: GPT-5.5 → Kimi K2.6
```

## モデル能力レジストリ

ルーターには 8 モデルの能力レジストリが同梱されています：

| モデル | 得意分野 | コスト |
|------|--------|------|
| **Claude Opus 4.7** | コードレビュー、アーキテクチャ設計、セキュリティ監査 | 最高 |
| **Claude Sonnet 4.6** | 日常開発、RAG、ラピッドプロトタイピング | 中 |
| **GPT-5.5** | オールラウンダー：自動化、推論、汎用 | 最高 |
| **DeepSeek-V4-Pro** | アルゴリズム実装、コアロジック、バッチ処理 | 最低 |
| **GLM-5.1** | 数学推論、自律ループ、システムプランニング | 低 |
| **Kimi K2.6** | マルチエージェント編成、フロントエンド UI | 低 |
| **MiniMax-M2.7** | 自己修復、本番障害復旧 | 低 |
| **Gemini-3-Pro** | マルチモーダル分析、長文ドキュメント研究、1M コンテキスト | 中 |

## 3 つの CLI プロトコル、自動選択

| プロトコル | CLI テンプレート | 使用者 |
|----------|---------------|--------|
| **codex** | `codex --yolo -m <model> -p "<prompt>"` | GPT-5.5 |
| **gemini** | `gemini -m gemini-3-pro -p "<prompt>"` | Gemini-3-Pro |
| **claude** | `claude --model <model> -p "<prompt>"` | その他すべて |

`-m` だっけ `--model` だっけ？という混乱はもう不要です。

## 環境変数による上書き

```bash
export AIOS_MODEL_PLANNER=claude-opus
export AIOS_MODEL_IMPLEMENTATION=deepseek-v4
export AIOS_MODEL_REVIEWER=claude-opus
export AIOS_MODEL_SECURITY_REVIEWER=claude-opus
```

解決優先度：**環境変数** > **preferredModel** (エージェントカード) > **model** (フォールバック)。

## 知覚フィードバックループ

すべてのディスパッチが `model.dispatch` イベントとして記録されます：

```json
{
  "kind": "model.dispatch",
  "modelId": "claude-opus",
  "taskType": "code-review",
  "success": true,
  "latencyMs": 4500,
  "costEstimate": "high"
}
```

## クイックスタート

```bash
# 全モデルと能力を表示
node scripts/aios.mjs model-router list

# タスクを最適なモデルにルーティング
node scripts/aios.mjs model-router route --task "あなたのタスク"

# ディスパッチ統計を表示
node scripts/aios.mjs model-router stats
```

Model Router は RexCLI v1.8.0 以降で利用可能です。詳細は[ドキュメント](https://cli.rexai.top/ja/model-router/)をご覧ください。
