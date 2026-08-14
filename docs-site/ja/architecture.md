---
title: AIOS アーキテクチャ
description: client guidance、ContextDB、Workflow Policy、Team、Harness、browser-use CDP、RL research の接続を説明します。
---

# アーキテクチャ

## まず答え

AIOS は既存の coding client の周囲にローカル境界を提供します。client guidance が project を識別し、ContextDB が evidence を保存・recall し、Workflow Policy が最小の route を選びます。必要に応じて Team、Solo Harness、Orchestrate が task を実行します。ブラウザの既定 path は browser-use CDP で、古い Playwright MCP は compatibility path です。

## Components

| Layer | Main surface | Responsibility |
| --- | --- | --- |
| Client entry | scripts/contextdb-shell.zsh、client-sources/、native guidance | project instruction と route hint |
| Startup bridge | scripts/contextdb-shell-bridge.mjs、scripts/ctx-agent.mjs | wrapper / passthrough を判断し client を起動 |
| ContextDB | mcp-server/src/contextdb/、.aios/context-db/ | session、memo、checkpoint、search、context pack |
| Workflow Policy | scripts/lib/planning/workflow-policy.mjs、auto-gate.mjs、cli.mjs | noop、direct、guarded、planned の分類 |
| Operations | scripts/aios.mjs、team、harness、orchestrate、HUD | dispatch、status、evidence |
| Browser | scripts/run-browser-use-mcp.sh、chrome.*、browser.*、page.* | CDP 上の browser-use MCP |
| Research | scripts/lib/rl-core/、rl-* adapter | RL experiment と evaluation |

## Runtime Flow

~~~text
user command
  -> supported client + native project guidance
  -> optional shell bridge / ctx-agent compatibility path
  -> .aios/context-db/index.json registry
  -> ContextDB search、memo、checkpoint、context pack
  -> Workflow Policy route decision
  -> direct、Team、Solo Harness、または Orchestrate
  -> diagnostic、test、verification evidence
~~~

route decision は implementation complete と同じではありません。file edit には pre-edit safety と final verification が必要です。

## ContextDB と storage boundary

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

## Workflow Policy boundary

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

## Browser runtime

既定の browser path は browser-use MCP over CDP です。

- launcher: scripts/run-browser-use-mcp.sh
- launch: chrome.launch_cdp
- connect: browser.connect_cdp
- page: page.semantic_snapshot、page.extract_text、page.goto、page.screenshot
- profile: config/browser-profiles.json

visible CDP browser を使い、semantic または targeted text を先に読み、read -> act -> verify を短く保ちます。mcp-server の Playwright MCP は compatibility と低レベル inspection 用で、既定の business-flow path ではありません。

## RL Training Layer (AIOS) {#rl-training-layer-aios}

AIOS には通常の AIOS setup とは分離された multi-environment RL research surface もあります。scripts/lib/rl-core/ は campaign state、checkpoint lineage、comparison、replay、teacher signal、trainer entry point を扱い、shell、browser、orchestrator、mixed adapter を提供します。

~~~bash
node scripts/rl-shell-v1.mjs benchmark-generate --count 20
node scripts/rl-shell-v1.mjs train --epochs 5
node scripts/rl-shell-v1.mjs eval
node scripts/rl-mixed-v1.mjs mixed --mixed
node scripts/rl-mixed-v1.mjs mixed-eval
~~~

RL status と benchmark は対象 environment と version に限定した research evidence です。production reliability や公開 performance claim を自動的に証明するものではありません。

## Failure boundaries

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
