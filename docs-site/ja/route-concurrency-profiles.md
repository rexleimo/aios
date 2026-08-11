---
title: ルーティングと並列プロファイル
description: AIOS のルーティングと並列設定を最小変数で選ぶためのクイックガイド。
---

# ルーティングと並列プロファイル

環境変数をたくさん覚えたくない場合は、このページのプリセットをそのまま使ってください。

## 主要変数

- `CTXDB_INTERACTIVE_AUTO_ROUTE`: interactive 自動ルーティング（`single/subagent/team/harness`）の有効化
- `CTXDB_CODEX_DISABLE_MCP`: wrapper 経由 `codex` の MCP 起動をスキップするか
- `CTXDB_HARNESS_PROVIDER`: 注入される `harness` route の provider（`codex|claude|gemini|opencode|hermes|grok|hermes|grok`、既定は現在の CLI）
- `CTXDB_HARNESS_MAX_ITERATIONS`: 注入される `harness` route の反復予算（既定 `8`）
- `CTXDB_TEAM_WORKERS`: `aios team ...` の並列 worker 数
- `AIOS_SUBAGENT_CONCURRENCY`: `aios orchestrate --execute live` の並列実行数、および GroupChat のラウンドあたり speaker 数（デフォルト: `3`）
- `aios work`: 1コマンドで並列ディスパッチ——既定で live（並列度 `3`、`AIOS_SUBAGENT_CONCURRENCY` に従う）、`--serial` で `1` に強制、`--dry-run` で DAG をプレビュー
- `AIOS_SUBAGENT_TIMEOUT_MS`: live 実行のエージェントターンあたりタイムアウト（ミリ秒）（デフォルト: `600000` = 10 分）
- `AIOS_ALLOW_UNKNOWN_CAPABILITIES`: live 実行時の capability guard をスキップ（`1` = リスク受容）

## 推奨プリセット

### 1) バランス（推奨）

```bash
export CTXDB_INTERACTIVE_AUTO_ROUTE=1
export CTXDB_CODEX_DISABLE_MCP=1
export CTXDB_HARNESS_MAX_ITERATIONS=8
export CTXDB_TEAM_WORKERS=3
export AIOS_SUBAGENT_CONCURRENCY=3
export AIOS_SUBAGENT_TIMEOUT_MS=600000
```

### 2) 高スループット

```bash
export CTXDB_INTERACTIVE_AUTO_ROUTE=1
export CTXDB_CODEX_DISABLE_MCP=1
export CTXDB_HARNESS_MAX_ITERATIONS=12
export CTXDB_TEAM_WORKERS=4
export AIOS_SUBAGENT_CONCURRENCY=4
```

### 3) デバッグ安定モード

```bash
export CTXDB_INTERACTIVE_AUTO_ROUTE=0
export CTXDB_CODEX_DISABLE_MCP=1
export CTXDB_HARNESS_MAX_ITERATIONS=4
export CTXDB_TEAM_WORKERS=1
export AIOS_SUBAGENT_CONCURRENCY=1
```

## クイック切り替えエイリアス（任意）

```bash
alias rex-par3='export CTXDB_INTERACTIVE_AUTO_ROUTE=1 CTXDB_CODEX_DISABLE_MCP=1 CTXDB_HARNESS_MAX_ITERATIONS=8 CTXDB_TEAM_WORKERS=3 AIOS_SUBAGENT_CONCURRENCY=3'
alias rex-par4='export CTXDB_INTERACTIVE_AUTO_ROUTE=1 CTXDB_CODEX_DISABLE_MCP=1 CTXDB_HARNESS_MAX_ITERATIONS=12 CTXDB_TEAM_WORKERS=4 AIOS_SUBAGENT_CONCURRENCY=4'
alias rex-debug='export CTXDB_INTERACTIVE_AUTO_ROUTE=0 CTXDB_CODEX_DISABLE_MCP=1 CTXDB_HARNESS_MAX_ITERATIONS=4 CTXDB_TEAM_WORKERS=1 AIOS_SUBAGENT_CONCURRENCY=1'
```

使用例:

```bash
rex-par3
codex
```

## 注意

- これらの環境変数の変更は**新しいセッション**に反映されます。適用するには `codex`/`claude`/`gemini`/`opencode` を再起動してください。
- 並列数は `CTXDB_TEAM_WORKERS` と `AIOS_SUBAGENT_CONCURRENCY` で制御され、`CTXDB_INTERACTIVE_AUTO_ROUTE` ではありません。
- GroupChat live モードでは、`AIOS_SUBAGENT_CONCURRENCY` がラウンドあたりの並列 speaker 数を制御します。各エージェントは前のラウンドからの共有会話履歴全体を参照できます。
- Harness の自己トリガーは単一 provider ループであり、並列 team ではありません。注入される harness provider を現在の CLI と変えたい時だけ `CTXDB_HARNESS_PROVIDER` を設定してください。
- `AIOS_ALLOW_UNKNOWN_CAPABILITIES=1` は live 実行の capability guard をバイパスします。タスク範囲を信頼でき、dry-run-first 要件をスキップしたい場合に使用してください。
- MCP ツールが必要な実行だけ一時的に:

```bash
CTXDB_CODEX_DISABLE_MCP=0 codex
```
