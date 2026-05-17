---
title: アーキテクチャ
description: wrapper / runner / ContextDB の構成。
---

# アーキテクチャ

## Components

- `scripts/contextdb-shell.zsh`: CLI ラッパー
- `scripts/contextdb-shell-bridge.mjs`: wrap / passthrough 判定ブリッジ
- `scripts/ctx-agent.mjs`: 実行ランナー
- `mcp-server/src/contextdb/*`: ContextDB 実装

## Runtime Flow

```text
ユーザーコマンド -> zsh wrapper -> contextdb-shell-bridge.mjs -> ctx-agent.mjs -> contextdb CLI -> ネイティブ CLI
```

## Storage Model

各ラップされたワークスペースは独立したローカルストレージを持ちます（git ルートがある場合はそれを使用、なければカレントディレクトリ）：

```text
.aios/context-db/
  manifest.json
  index/sessions.jsonl
  sessions/<session_id>/
  exports/<session_id>-context.md
```

## Isolation Controls

`CTXDB_WRAP_MODE` でラッパースコープを設定：

- `all`：全ワークスペースで有効化（非 git ディレクトリを含む）
- `repo-only`：`ROOTPATH` ワークスペースのみ
- `opt-in`：マーカー（`.contextdb-enable`）が存在するワークスペースのみ
- `off`：ラップ無効

`opt-in` はプロジェクト単位の厳格制御が必要な場合に推奨されます。

## Harness Layer (AIOS)

AIOS は ContextDB の上にオペレータ向け harness を提供します:

- `aios orchestrate` は blueprints からローカル dispatch DAG を生成
- `dry-run` は `local-dry-run` を使用 (トークン消費なし)
- `live` は `subagent-runtime` を使用し、外部 CLI (`codex`) でフェーズを実行 (現状 codex-cli のみ)
- `AIOS_SUBAGENT_CLIENT=codex-cli` の場合、AIOS は `codex exec` の構造化出力 (`--output-schema`, `--output-last-message`, stdin) を優先して JSON handoff を安定化します (旧版はフォールバック)。

`live` はデフォルトで無効です。以下が必要です:

- `AIOS_EXECUTE_LIVE=1`
- `AIOS_SUBAGENT_CLIENT=codex-cli`

### Browser MCP (browser-use CDP)

2026-04-10 より、デフォルトのブラウザ MCP ランタイムは **browser-use MCP over CDP** です:

- ランチャー：`scripts/run-browser-use-mcp.sh`
- マイグレーション：`aios internal browser mcp-migrate`
- ツール：`chrome.launch_cdp`、`browser.connect_cdp`、`page.*`、`diagnostics.sannysoft`
- プロファイル設定：`config/browser-profiles.json`
- スクリーンショットタイムアウトガード：`BROWSER_USE_SCREENSHOT_TIMEOUT_MS`（デフォルト：15 秒）

レガシー Playwright MCP (`mcp-server/`) は互換性のために残されていますが、デフォルトではありません。

## RL Training Layer (AIOS)

AIOS にはマルチ環境の強化学習システムが含まれており、シェル、ブラウザ、オーケストレータータスク間で共有生徒ポリシーを継続的に改善します。

### Shared Control Plane (`scripts/lib/rl-core/`)

```
campaign-controller.mjs   # epoch オーケストレーション（収集 + 監視）
checkpoint-registry.mjs  # active / pre_update_ref / last_stable の系列追跡
comparison-engine.mjs     # better / same / worse / comparison_failed
control-state-store.mjs  # 再起動安全な制御スナップショット
epoch-ledger.mjs         # epoch 状態 + 劣化 streak
replay-pool.mjs          # 4レーンルーティング（positive/neutral/negative/diagnostic）
reward-engine.mjs        # 環境 reward + teacher 成形融合
teacher-gateway.mjs      # Codex/Claude/Gemini/opencode からの正規化出力
schema.mjs               # 共有コントラクト検証
trainer.mjs              # PPO エントリーポイント（online + offline）
```

### Environment Adapters

| Adapter | Path | Training Focus |
|---------|------|---------------|
| Shell RL | `scripts/lib/rl-shell-v1/` | 合成バグ修正タスク → 実リポジトリ |
| Browser RL | `scripts/lib/rl-browser-v1/` | 管理された実際のウェブフロー |
| Orchestrator RL | `scripts/lib/rl-orchestrator-v1/` | 高価値制御意思決定 |
| Mixed RL | `scripts/lib/rl-mixed-v1/` | 跨環境連合トレーニング |

### Key RL Concepts

- **Episode contract**: 全環境で統一の構造化出力（taskId, trajectory, outcome, reward, comparison）
- **3ポインター checkpoint 系列**：`active` → `pre_update_ref` → `last_stable`、劣化時に自動ロールバック
- **4レーン replay pool**：positive / neutral / negative / diagnostic_only — 比較結果による確定的ルーティング
- **Teacher gateway**：Codex CLI、Claude Code、Gemini CLI、OpenCode からの正規化信号

### Running RL

```bash
# Shell RL パイプライン
node scripts/rl-shell-v1.mjs benchmark-generate --count 20
node scripts/rl-shell-v1.mjs train --epochs 5
node scripts/rl-shell-v1.mjs eval

# 混合環境 campaign
node scripts/rl-mixed-v1.mjs mixed --mixed
node scripts/rl-mixed-v1.mjs mixed-eval
```

### RL Status

- RL Core：安定（40+ テスト）
- Shell RL V1：安定（Phase 1–3）
- Browser RL V1：beta
- Orchestrator RL V1：beta
- Mixed RL：実験的（エンドツーエンド検証済み）
