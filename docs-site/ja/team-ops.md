---
title: Agent Team 実践
description: Agent Team をいつ使うか、どう起動・監視・完了するか、そして使わない方がよい場面。
---

# Agent Team 実践

Agent Team は「多ければ多いほど良い」ものではありません。**分割でき、境界が明確で、並列実行して安全**なタスクに向いています。

live モードでは、Agent Team は **GroupChat Runtime** を使用します：エージェントは共有会話スレッドでラウンド実行されます。planner がタスクを分析し、implementer が並列作業し、reviewer が検証します。エージェントがブロックされると、自動的に re-plan ラウンドがトリガーされます。

1つだけ覚えるなら:

```bash
aios team 3:codex "X を実装し、完了前にテストを実行し、変更を要約"
aios team status --provider codex --watch
```

<figure class="rex-visual">
  <img src="../assets/visual-agent-team-monitoring.svg" alt="Agent Team 開始前チェックリストと HUD 状態監視の図">
  <figcaption>team を開始する前に、本当に並列向きか確認します。監視ウィンドウは進捗を見るだけで、閉じてもメインタスクは停止しません。</figcaption>
</figure>

## team を使うべき時

適している:

- 1つの要件を frontend、backend、tests、docs など比較的独立した部分に分けられる。
- “tests must pass” や “docs updated” など acceptance criteria が分かっている。
- 並列実行に追加 token と待ち時間を使ってよい。
- 複数 worker を HUD/history で追跡したい。

適さない:

- 要件がまだ曖昧で方向探索中。
- 小さな bug、単一ファイル修正、一回きりの command。
- 複数 worker が同じファイルを編集しそう。
- 安定した再現が必要な debugging 中。

迷ったら通常の対話型から始めます:

```bash
codex
```

team を開始する前に3つ確認:

<div class="rex-checklist">
  <div class="rex-checklist__item">2つ以上の独立モジュールに分割できる</div>
  <div class="rex-checklist__item">worker が同じファイル群を編集しない</div>
  <div class="rex-checklist__item">acceptance criteria を1文で説明できる</div>
</div>

## 10分で流れを確認する

### 1) タスクを明確に書く

良いタスク説明には goal、boundary、acceptance criteria が含まれます。

```bash
aios team 3:codex "ログインフォームのエラー表示を改善; auth API は変更しない; 完了前に関連テストを実行し docs を更新"
```

### 2) 監視を始める

```bash
aios team status --provider codex --watch
```

軽量モード:

```bash
aios team status --provider codex --watch --preset minimal --fast
```

### 3) 履歴と失敗を見る

```bash
aios team history --provider codex --limit 20
aios team history --provider codex --quality-failed-only
```

### 4) 完了前に quality gate

```bash
aios quality-gate pre-pr --profile strict
```

quality gate が失敗した場合、まず failure category を確認してください。すぐに worker を増やさないでください。

## worker 数の選び方

| レベル | コマンド | 向いている場面 |
|---|---|---|
| 安定 | `aios team 2:codex "task"` | 初回、ファイル重複の可能性あり |
| 推奨 | `aios team 3:codex "task"` | ほとんどの日常機能 |
| 高スループット | `aios team 4:codex "task"` | モジュールが独立し、テストが明確 |

衝突、重複編集、待ち時間が増えたら、worker を増やすのではなく concurrency を下げます。

## provider の選び方

```bash
aios team 3:codex "task"
aios team 2:claude "task"
aios team 2:gemini "task" --dry-run
```

おすすめ:

- 日常実装は `codex` を優先。
- 長文分析や案の比較は `claude` を試す。
- command の影響が不明なら `--dry-run` を追加。

## resume と retry

実行が中断した場合、まず履歴を確認:

```bash
aios team history --provider codex --limit 5
```

その後 blocked jobs だけ retry:

```bash
aios team --resume <session-id> --retry-blocked --provider codex --workers 2
```

失敗理由を理解しないまま、より大きな team を開始しないでください。

## team と orchestrate の違い

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

## GroupChat Runtime（ラウンドベースの Agent Team）

`aios team` を live モードで実行すると、**GroupChat Runtime** が使われます：エージェントが単一の会話スレッドを共有し、独立した one-shot dispatch ではなくラウンドベースで実行されるモデルです。

### 従来の並列 dispatch との違い

| | 従来の並列 | GroupChat Runtime |
|---|---|---|
| エージェント間通信 | 独立；依存出力のみ | 共有会話履歴 |
| 実行順序 | 静的 DAG フェーズ | ラウンド（逐次）、各ラウンドで並列 speaker |
| ブロック復帰 | 手動 retry | 自動 re-plan（planner が再評価） |
| 作業項目の拡張 | 固定キュー | planner の発見が並列作業項目に |
| 終了条件 | 全 job 完了 | 合意または最大ラウンド数 |

### ラウンドの流れ

GroupChat は blueprint のフェーズをラウンドにマッピングします。各ラウンド内で speaker は同時実行されます（`AIOS_SUBAGENT_CONCURRENCY` で制御）。ラウンド終了後、次のラウンドの全エージェントが蓄積された全履歴を参照できます。

```
Round 1 → planner（分析、作業項目の生成）
Round 2 → N × implementer（並列、作業項目ごとに1つ）
Round 3 → reviewer（+ security-reviewer が並列）
```

implementer が `blocked` または `needs-input` を報告すると、**re-plan ラウンド**が自動挿入されます：planner が全履歴を参照して状況を再評価し、次のステップを決定します。

### Blueprint の選択

| Blueprint | ラウンド数 | 向いている用途 |
|---|---|---|
| `bugfix` | plan → implement → review | 単一焦点の修正、小規模 |
| `feature` | plan → implement → review + security | quality gate 付き新機能 |
| `refactor` | plan → implement → review | 純粋なリファクタリング、機能変更なし |
| `security` | assess → plan → implement → review | セキュリティ重視の変更 |

タスクに合う最小の blueprint を選んでください。単純なファイル作成には `feature` ではなく `bugfix` で十分です。

Blueprint、ロールカード、runtime manifest、executor manifest、handoff schema は `scripts/lib/specs/` に同梱されています。Team の実行状態と証拠は引き続き `.aios/context-db/` に書き込まれます。`memory/memo/` はプロジェクト memo 専用で、team runtime store ではありません。

### 設定

```bash
# live 実行に必須
export AIOS_EXECUTE_LIVE=1
export AIOS_SUBAGENT_CLIENT=codex-cli   # または claude-code, gemini-cli, opencode-cli

# 並列数（ラウンドあたりの speaker 数）
export AIOS_SUBAGENT_CONCURRENCY=3      # デフォルト: 3

# エージェントターンあたりのタイムアウト（ms）
export AIOS_SUBAGENT_TIMEOUT_MS=600000  # デフォルト: 10 分

# capability preflight なしで live 実行を許可（注意して使用）
export AIOS_ALLOW_UNKNOWN_CAPABILITIES=1
```

GroupChat の live 実行は `AIOS_EXECUTE_LIVE=1` でゲートされています。これがない場合、`aios team` は dispatch プランの dry-run プレビューにフォールバックします。

## よく使うコマンド

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

## 高度な運用リファレンス

次のコマンドは、初心者フローに慣れた後で使うものです。

### HUD presets

| Preset | 用途 |
|---|---|
| `minimal` | 長時間の watch |
| `compact` | ターミナル向け要約 |
| `focused` | バランスの取れた既定値 |
| `full` | 完全診断 |

### Skill candidates

Skill candidates は失敗したセッションから抽出される改善提案です。オンボーディングの最初ではなく、失敗の振り返り時に確認してください。

```bash
aios team status --show-skill-candidates
aios team skill-candidates list --session <session-id>
aios team skill-candidates export --session <session-id> --output ./candidate.patch.md
```

適用前に必ず手動レビューしてください。特に skills、hooks、MCP 設定を変更する提案には注意します。


## 関連文書

- [シナリオ別コマンド](use-cases.md)
- [HUD ガイド](hud-guide.md)
- [Skill Candidates](skill-candidates.md)
- [ルーティングと並列プロファイル](route-concurrency-profiles.md)
- [トラブルシューティング](troubleshooting.md)
