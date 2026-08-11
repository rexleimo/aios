---
title: "v5.6.0: 並列マルチエージェントコーディングを1コマンドで — aios work"
description: "v5.6.0 で aios work が登場: 1コマンドでタスクを計画済みの並列マルチエージェントディスパッチに変換 — plan、implement、review、security-check を並列実行しマージゲートで収束。単一エージェントの逐次待ちは不要。"
date: 2026-08-11
tags: ["AIOS", "multi-agent", "parallel", "orchestration", "release", "v5.6.0"]
---

# v5.6.0: 並列マルチエージェントコーディングを1コマンドで — `aios work`

## 問題

単一のコーディングエージェントは逐次動作します: 計画、編集、レビュー、繰り返し。すべてのステップが同じプロセスを待つため、独立した3つの部分からなるタスクは1つの部分の3倍の時間がかかります。AIOS には並列マルチエージェントオーケストレーション（`aios orchestrate`）がすでにありましたが、opt-in で環境変数ゲートがあり、複数のフラグが必要でした。そのため日常の作業のほとんどは依然として単一エージェントで実行されていました。

## クイックアンサー

**`aios work` は、タスクの説明を並列マルチエージェントディスパッチに変える1コマンドです。** タスクを計画し、独立した作業項目に分割し、planner・implementer・reviewer・security-reviewer を並列実行（デフォルト並列度3）し、安全なマージゲートで結果を収束させます。すべて1回の CLI 呼び出しで完結します。live 実行はデフォルトで有効。`--dry-run` で計画をプレビュー、`--serial` で安全な逐次実行を強制できます。既存のオーケストレーションエンジンをラップしているだけなので、新しい部品はありません。エビデンス、所有権、マージゲートのガードはすべてそのまま適用されます。

## 操作手順

1. AIOS を v5.6.0 にアップグレードします（`aios update`）。
2. 任意のタスクを1コマンドで実行:

```bash
aios work --task "Ship the release checklist"
```

3. live 実行前にプレビュー:

```bash
aios work --task "Ship the release checklist" --dry-run --json
```

4. 結合度の高い作業は逐次実行を強制:

```bash
aios work --task "Refactor the auth module" --serial
```

5. 並列度とクライアントを調整:

```bash
aios work --task "Review auth, update tests, write docs" --client codex-cli --concurrency 4
```

## ディスパッチの仕組み

- **自動分解。** タスクタイトルと `--context` ヒントを、所有権ヒント（`docs/`、`scripts/tests/`、`mcp-server/src/`）付きの作業項目に分割します。
- **DAG 実行。** plan と implement フェーズは逐次実行。review と security-review は並列実行。マージゲートが handoff・ファイル所有権・読み取り専用レビュー規則を検証してからマージします。
- **有界並列。** `aios work` はデフォルトで3つのサブエージェントを並列実行（`--concurrency N` で変更、`--serial` で1に）。
- **安全性は緩めない。** preflight readiness、capability manifest、owned path prefixes、file policy、マージゲートはすべて有効です。未知の能力面に対する live 実行は、`--force` で明示的に受け入れない限り拒否されます。既存の `aios team` / `aios orchestrate --execute live` とまったく同じ動作です。
- **フェーズごとのモデルルーティング。** planner・implementer・reviewer・security-reviewer は、デフォルトで model router 経由でそれぞれのモデルを解決します。

## 例

```bash
# デフォルト: live 並列ディスパッチ（並列度3、マージゲート収束）
aios work --task "Refactor mcp-server and add tests"

# ゼロコストプレビュー（モデルクライアントは起動しない）
aios work --task "Ship the release checklist" --dry-run --json

# 複数作業項目の分解ヒント（セミコロン / 改行区切り）
aios work --task "Prepare the release" --context "update changelog; refresh docs; bump version"

# セッションをまたいだ再開 / blocked のリプレイ
aios work --task "Ship the release checklist" --session codex-cli-20260811T... --retry-blocked
```

## なぜ `aios team` や `aios orchestrate` を使わないのか?

それらは今も存在し、動作は変わりません。`aios work` は同じエンジンに**日常使用のデフォルト**を付けたものです: live デフォルト有効、1コマンド、環境変数を覚える必要なし。`aios team` は引き続きステータス/履歴/観測ビュー、`aios orchestrate` は完全に明示的なコントロールサーフェスです。

## FAQ

### `aios work` は実際にモデルクライアントを起動しますか?

はい。live モードは実際の one-shot サブエージェント（codex・claude・gemini・opencode、`--client` / `AIOS_SUBAGENT_CLIENT` で指定）を実行します。ゼロコストのプレビューには `--dry-run`、モデルを呼ばずにパイプラインを試すには `AIOS_SUBAGENT_SIMULATE=1` を設定してください。

### 並列ディスパッチはワークスペースにとって安全ですか?

`aios team` と同じガードが適用されます: preflight readiness、capability manifest チェック、owned-path file policy、並列出力間のファイル所有権の重複をブロックするマージゲート。結合度の高い作業は `--serial` でいつでも逐次に戻せます。

### rex workflow の Command 選択を置き換えますか?

いいえ。`aios work` は並列ディスパッチレーンです。rex workflow（同時に1つの current Command）は引き続き段階的な Provider 選択を担当します。両者は直交しています。

### サポートされるクライアントは?

`codex-cli`、`claude`、`gemini`、`opencode` — subagent runtime と同じクライアントセットです。デフォルトは `codex-cli`。

### 速度は欲しいがコストは抑えたい。どうすれば?

`aios work --task "..." --concurrency 2` で live 並列度を制限し、`--dry-run` で DAG と作業項目を先にプレビュー、`aios learn-eval` で前回のディスパッチエビデンスを次の推奨に変換します。

## 関連

- [Orchestrate Live: 本番環境でサブエージェントを動かす](orchestrate-live.md)
- [並列コーディングエージェントは無料ではない: Git Worktree はファイルを隔離し、状態は隔離しない](2026-08-parallel-coding-agents.md)
- [Agent Governance: Team 実行は live の前に証明する](2026-06-agent-governance.md)
- ドキュメント: [Team Ops](https://cli.rexai.top/ja/team-ops/) · [Route & Concurrency Profiles](https://cli.rexai.top/ja/route-concurrency-profiles/)
