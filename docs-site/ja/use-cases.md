---
title: ユースケース：AIOS の route を選ぶ
description: memory、search、parallel work、resumable run、browser、privacy、verification の目的別に command を選びます。
---

# Find Commands By Scenario

## まず答え

setup は aios init と doctor、project fact は memo と unified search、独立作業は aios team、独立項目に分解できる日常タスクは aios work（既定で並列）、一つの長い objective は aios harness、ordered phase は aios orchestrate を使います。route が不明なら [Workflow Policy](workflow-policy.md) を先に読みます。

## Setup

~~~bash
aios init --all
aios doctor --native --verbose
~~~

project root で実行します。marker は .aios/context-db/index.json を指し、ContextDB は必要な source を pull-based に recall します。

## Route chooser

| 目的 | Use |
| --- | --- |
| 質問または inspection、file edit なし | direct |
| 小さく明確な local change | guarded |
| multi-step または resume 可能な objective | planned / Solo Harness |
| 独立 work package の分割 | Agent Team |
| ordered phase と gate | Orchestrate |
| decision を理解する | [Workflow Policy](workflow-policy.md) |

## Memory と search

~~~bash
aios memo add "Keep authentication tests strict"
aios memo search "authentication"
node scripts/aios.mjs search "release readiness" --agent codex-cli --json
node scripts/aios.mjs search "browser MCP" --source docs,code --limit 8
~~~

ContextDB は session、checkpoint、export、canonical memo を local に保存します。unified search は memory、plans、docs、code を対象にします。

## Cross-client handoff

integration が sync 済みなら同じ project で対応 client を使えます。

~~~bash
claude
codex
gemini
~~~

重要な decision は memo と checkpoint で明示します。client capability は同じとは限らないので aios doctor で確認します。

## One long objective

~~~bash
aios harness run \
  --objective "Draft tomorrow's handoff" \
  --session nightly-demo \
  --worktree \
  --max-iterations 20
aios harness status --session nightly-demo --json
aios harness stop --session nightly-demo --reason "morning review"
aios harness resume --session nightly-demo
~~~

詳細は [Solo Harness](solo-harness.md)。dry-run は provider test ではありません。

## Independent parallel work

~~~bash
aios team --provider codex --workers 3 --task "Implement X and update its tests" --dry-run --json
AIOS_EXECUTE_LIVE=1 AIOS_SUBAGENT_CLIENT=codex-cli \
  aios team 3:codex "Implement X and update its tests"
aios team status --provider codex --watch
~~~

governance と blocked recovery は [Agent Team](team-ops.md) を参照します。

## Staged orchestration

~~~bash
aios orchestrate bugfix --task "Fix X" --dispatch local --execute dry-run
AIOS_EXECUTE_LIVE=1 AIOS_SUBAGENT_CLIENT=codex-cli \
  aios orchestrate bugfix --task "Fix X" --execute live --preflight none
~~~

ordered phase と gate が重要な場合に使います。dry-run は live provider の証明ではありません。

## Browser automation

~~~bash
aios internal browser doctor
aios internal browser cdp-status
~~~

browser-use MCP over CDP を既定 path とし、visible browser、semantic snapshot、targeted text、act、verify の順で進めます。auth wall では human-in-the-loop を維持します。Playwright MCP は compatibility path です。

## Privacy と verification

~~~bash
aios privacy read --file .env
aios privacy status
aios quality-gate pre-pr --profile strict
npm run test:scripts
~~~

.env、cookie、token、private key、browser profile を model に貼らないでください。status や dry-run は verification の代わりではありません。

## 次に読む

- [Workflow Policy](workflow-policy.md)
- [ContextDB](contextdb.md)
- [Agent Team](team-ops.md)
- [Solo Harness](solo-harness.md)
- [トラブルシューティング](troubleshooting.md)
