---
title: AIOS アーキテクチャ
description: client guidance、ContextDB、Workflow Policy、Team、Harness、browser-use CDP、RL research の接続を説明します。
---

# アーキテクチャ

## まず答え

AIOS は既存の coding client の周囲にローカル境界を提供します。client guidance が project を識別し、ContextDB が evidence を保存・recall し、Workflow Policy が最小の route を選びます。必要に応じて Team、Solo Harness、Orchestrate が task を実行します。ブラウザの既定 path は browser-use CDP で、古い Playwright MCP は compatibility path です。

## コンポーネント

| 層 | 主な入口 | 役割 |
| --- | --- | --- |
| クライアント入口 | scripts/contextdb-shell.zsh、client-sources/、ネイティブ指忚 | プロジェクト説明とルーティングヒント |
| 起動ブリッジ | scripts/contextdb-shell-bridge.mjs、scripts/ctx-agent.mjs | ラッパーか透かを判断してクライアントを起動 |
| ContextDB | mcp-server/src/contextdb/、.aios/context-db/ | セッション・memo・チェックポイント・検索データ・context pack を保存 |
| Workflow Policy | scripts/lib/planning/workflow-policy.mjs、auto-gate.mjs、cli.mjs | noop、direct、guarded、planned の分類 |
| 運用操作 | scripts/aios.mjs、team、harness、orchestrate、HUD | 作業の配布、状態の記録、根拠の提示 |
| Browser | scripts/run-browser-use-mcp.sh、chrome.*、browser.*、page.* | CDP 上の browser-use MCP |
| 研究層 | scripts/lib/rl-core/、rl-* アダプター | RL 実験と評価を分離 |

## 実行チェーン

~~~text
ユーザーコマンド
-> 対応クライアントとネイティブのプロジェクト指引
-> 任意の shell bridge / ctx-agent 互換パス
-> .aios/context-db/index.json レジストリ
-> ContextDB 検索、memo、チェックポイント、context pack
-> Workflow Policy のルート判断
  -> direct、Team、Solo Harness、または Orchestrate
-> 診断、テスト、検証の根拠
~~~

route decision は implementation complete と同じではありません。file edit には pre-edit safety と final verification が必要です。

## ContextDB と保存境界

~~~text
.aios/
  context-db/
    index.json
    sessions/
    index/
    exports/
  memo/
    file/events.jsonl
    split/
~~~

public な model は pull-based です。agent は必要な source だけを検索・recall し、全 history が自動的に渡されるわけではありません。.contextdb-enable と旧 wrapper mode は compatibility として残りますが、primary onboarding ではありません。

## Workflow Policy の境界

| Disposition | 用途 |
| --- | --- |
| noop | action 不要 |
| direct | 回答または inspection。persistent plan なし |
| guarded | 小さく明確な local change。edit と verification は必要 |
| planned | multi-step、risk、delegation、resume、または不明確な task |

plan の persistence は none、reuse、create です。同じ session の acknowledgement と別 client からの explicit resume は別の動作です。[Workflow Policy](workflow-policy.md) を参照してください。

## Team、Solo Harness、Orchestrate

- Agent Team は独立した work package の並列協調です。HUD、status、history、quality category が evidence になります。
- Solo Harness は checkpoint、stage journal、worktree、resume status を持つ一つの長い objective 向けです。
- Orchestrate は staged dispatch DAG と quality-gated phase 向けです。
- dry-run は local simulation であり、live provider や client route が動くことの証明ではありません。
- live subagent は opt-in で、実行前に doctor と command help を確認します。

~~~bash
aios team status --watch
aios harness status --session <session-name> --json
aios orchestrate --help
aios doctor --native --verbose
~~~

## ブラウザランタイム

既定のブラウザパスは

- 起動:
- ブラウザ起動:
- 接続:
- ページ操作:
- profile 設定:

可視 CDP ブラウザを使い、semantic または対象を絞ったテキストを先に読み、read -> act -> verify のループを短く保ちます。mcp-server の Playwright MCP は互換と低レベルの点検用で。

## RL 研究レイヤー（AIOS）

AIOS には通常の AIOS setup とは分離された multi-environment RL research surface もあります。scripts/lib/rl-core/ は campaign state、checkpoint lineage、comparison、replay、teacher signal、trainer entry point を扱い、shell、browser、orchestrator、mixed adapter を提供します。

~~~bash
node scripts/rl-shell-v1.mjs benchmark-generate --count 20
node scripts/rl-shell-v1.mjs train --epochs 5
node scripts/rl-shell-v1.mjs eval
node scripts/rl-mixed-v1.mjs mixed --mixed
node scripts/rl-mixed-v1.mjs mixed-eval
~~~

RL status と benchmark は対象 environment と version に限定した research evidence です。production reliability や公開 performance claim を自動的に証明するものではありません。

## 失敗の境界と復旧

- registry がない：意図した project root で aios init --all。
- native guidance が古い：aios doctor --native --verbose、dry-run、必要なら --fix。
- browser auth：認証 wall では human-in-the-loop を維持。
- live route failure：dry-run と実際の provider / client status を比較。
- verification failure：plan を閉じず、最初の failure command を記録。

## 次に読む

- [クイックスタート](getting-started.md)
- [Workflow Policy](workflow-policy.md)
- [Agent Team](team-ops.md)
- [Solo Harness](solo-harness.md)
- [トラブルシューティング](troubleshooting.md)
