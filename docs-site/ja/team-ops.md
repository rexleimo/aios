---
title: Agent Team 実践
description: Agent Team をいつ使うか、どう起動・監視・完了するか、そして使わない方がよい場面。
---

# Agent Team 実践

**One agent is good. Multiple agents working together can be great — but only when the task actually calls for it.**

Agent Team は、複数のコーディングエージェントを並列で動作させ、タスクを分割できる機能です。各エージェントが作業の一部を担当し、リアルタイムで進捗を監視できます。

## The One Command To Remember

```bash
# Start 3 agents on a task
aios team 3:codex "Build the settings page, add tests, and update docs"

# Watch them work
aios team status --provider codex --watch
```

## When To Use Teams (And When Not To)

### Good fit for Agent Team

適している:

- 1つの要件を frontend、backend、tests、docs など比較的独立した部分に分けられる。
- "tests must pass" や "docs updated" など acceptance criteria が分かっている。
- 並列実行に追加 token と待ち時間を使ってよい。
- 複数 worker を HUD/history で追跡したい。

### Bad fit for Agent Team

適さない:

- 要件がまだ曖昧で方向探索中。
- 小さな bug、単一ファイル修正、一回きりの command。
- 複数 worker が同じファイルを編集しそう。
- 安定した再現が必要な debugging 中。

不确定时，先用普通交互式：

```bash
codex
```

### Quick Checklist

team を開始する前に3つ確認:

<div class="rex-checklist">
  <div class="rex-checklist__item">2つ以上の独立モジュールに分割できる</div>
  <div class="rex-checklist__item">worker が同じファイル群を編集しない</div>
  <div class="rex-checklist__item">acceptance criteria を1文で説明できる</div>
</div>

## The 10-Minute Flow

### 1. Write A Clear Task

良いタスク説明には goal、boundary、acceptance criteria が含まれます。

```bash
aios team 3:codex "ログインフォームのエラー表示を改善; auth API は変更しない; 完了前に関連テストを実行し docs を更新"
```

### 2. Start Monitoring

```bash
aios team status --provider codex --watch
```

軽量モード:

```bash
aios team status --provider codex --watch --preset minimal --fast
```

### 3. Check History And Failures

```bash
aios team history --provider codex --limit 20
aios team history --provider codex --quality-failed-only
```

### 4. Run A Quality Check Before Finishing

```bash
aios quality-gate pre-pr --profile strict
```

quality gate が失敗した場合、まず failure category を確認してください。すぐに worker を増やさないでください。

## How Many Agents Should I Use?

| Count | Command | Best for |
|---|---|---|
| 2 | `aios team 2:codex "task"` | 初回、ファイル重複の可能性あり |
| 3 | `aios team 3:codex "task"` | ほとんどの日常機能（推奨） |
| 4 | `aios team 4:codex "task"` | モジュールが独立し、テストが明確な場合 |

衝突、重複編集、待ち時間が増えたら、worker を増やすのではなく concurrency を下げます。

## Choosing A Provider

```bash
aios team 3:codex "task"
aios team 2:claude "task"
aios team 2:gemini "task" --dry-run
```

おすすめ:

- 日常実装は `codex` を優先。
- 長文分析や案の比較は `claude` を試す。
- command の影響が不明なら `--dry-run` を追加。

## If Something Goes Wrong

### A run was interrupted

実行が中断した場合、まず履歴を確認:

```bash
aios team history --provider codex --limit 5
```

その後 blocked jobs だけ retry:

```bash
aios team --resume <session-id> --retry-blocked --provider codex --workers 2
```

失敗理由を理解しないまま、より大きな team を開始しないでください。

## How Team Works Under The Hood

`aios team` を live モードで実行すると、**GroupChat Runtime** が使われます：エージェントが単一の会話スレッドを共有し、独立した one-shot dispatch ではなくラウンドベースで実行されるモデルです。

```
Round 1 → Planner analyzes the task and creates work items
Round 2 → N implementers work in parallel (one per work item)
Round 3 → Reviewer checks the results
```

If an agent gets stuck, the planner **automatically re-plans** the next round.

### Blueprints

| Blueprint | Rounds | Best for |
|---|---|---|
| `bugfix` | plan → implement → review | 単一焦点の修正、小規模 |
| `feature` | plan → implement → review + security | quality gate 付き新機能 |
| `refactor` | plan → implement → review | 純粋なリファクタリング、機能変更なし |
| `security` | assess → plan → implement → review | セキュリティ重視の変更 |

タスクに合う最小の blueprint を選んでください。単純なファイル作成には `feature` ではなく `bugfix` で十分です。

Blueprint、ロールカード、runtime manifest、executor manifest、handoff schema は `scripts/lib/specs/` に同伴されています。Team の実行状態と証拠は引き続き `.aios/context-db/` に書き込まれます。`memory/memo/` はプロジェクト memo 専用で、team runtime store ではありません。

### Configuration

```bash
# live 実行に必須
export AIOS_EXECUTE_LIVE=1
export AIOS_SUBAGENT_CLIENT=codex-cli   # または claude-code, gemini-cli, opencode-cli

# 並列数（ラウンドあたりの speaker 数��
export AIOS_SUBAGENT_CONCURRENCY=3      # デフォルト: 3

# エージェントターンあたりのタイムアウト（ms）
export AIOS_SUBAGENT_TIMEOUT_MS=600000  # デフォルト: 10 分

# capability preflight なしで live 実行を許可（注意して使用）
export AIOS_ALLOW_UNKNOWN_CAPABILITIES=1
```

GroupChat の live 実行は `AIOS_EXECUTE_LIVE=1` でゲートされています。これがない場合、`aios team` は dispatch プランの dry-run プレビューにフォールバックします。

## Team vs. Harness vs. Orchestrate

| 機能 | 向いている用途 |
|---|---|
| `aios team ...` | 1つのタスクで複数 worker をすぐ使う |
| `aios orchestrate ... --execute dry-run` | staged DAG と gates を preview |
| `aios orchestrate ... --execute live` | 厳密な段階実行が必要なメンテナー |

新規ユーザーは `team` を優先してください。`orchestrate live` は明示的な opt-in が必要です:

```bash
export AIOS_EXECUTE_LIVE=1
export AIOS_SUBAGENT_CLIENT=codex-cli
aios orchestrate --session <session-id> --dispatch local --execute live
```

## Command Reference

```bash
# team を開始（デフォルトは dry-run プレビュー）
aios team 3:codex "Ship X"

# GroupChat live 実行で team を開始
AIOS_EXECUTE_LIVE=1 AIOS_SUBAGENT_CLIENT=codex-cli aios team 3:codex "Ship X"

# 現在状態を監視
aios team status --provider codex --watch

# 最近の履歴
aios team history --provider codex --limit 20

# 失敗だけを見る
aios team history --provider codex --quality-failed-only

# 現在セッション HUD
aios hud --provider codex

# blocked jobs を retry
aios team --resume <session-id> --retry-blocked --provider codex --workers 2

# GroupChat runtime で orchestrate（完全なラウンドベース実行）
AIOS_EXECUTE_LIVE=1 AIOS_SUBAGENT_CLIENT=codex-cli \
  aios orchestrate bugfix --task "Fix X" --execute live --preflight none
```

## Advanced Operations Reference

次のコマンドは、初心者フローに慣れた後で使うものです。

### HUD Presets

| Preset | 用途 |
|---|---|
| `minimal` | 長時間の watch |
| `compact` | ターミナル向け要約 |
| `focused` | バランスの取れた既定値 |
| `full` | 完全診断 |

```bash
aios hud --provider codex
aios hud --watch --preset focused
aios hud --session <session-id> --json
```

### Skill Candidates

Skill candidates は失敗したセッションから抽出される改善提案です。オンボーディングの最初ではなく、失敗の振り返り時に確認してください。

```bash
aios team status --show-skill-candidates
aios team skill-candidates list --session <session-id>
aios team skill-candidates export --session <session-id> --output ./candidate.patch.md
```

適用前に必ず手動レビューしてください。特に skills、hooks、MCP 設定を変更する提案には注意します。

## Where To Go Next

- [シナリオ別コマンド](use-cases.md)
- [HUD ガイド](hud-guide.md)
- [Skill Candidates](skill-candidates.md)
- [ルーティングと並列プロファイル](route-concurrency-profiles.md)
- [トラブルシューティング](troubleshooting.md)