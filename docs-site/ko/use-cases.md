---
title: 사용 사례: AIOS route 선택
description: memory, search, parallel work, resumable run, browser, privacy, verification 목적에 맞는 command를 선택합니다.
---

# Find Commands By Scenario

## 먼저 답하면

setup은 aios init과 doctor, project fact는 memo와 unified search, 독립 작업은 aios team, 독립 항목으로 분해 가능한 일상 작업은 aios work(기본 병렬), 하나의 긴 objective는 aios harness, ordered phase는 aios orchestrate를 사용합니다. route가 불명확하면 [Workflow Policy](workflow-policy.md)를 먼저 읽으세요.

## Setup

~~~bash
aios init --all
aios doctor --native --verbose
~~~

project root에서 실행합니다. marker는 .aios/context-db/index.json을 가리키며 ContextDB는 필요한 source를 pull-based로 recall합니다.

## Route 선택

| 목표 | Use |
| --- | --- |
| 질문 또는 inspection, file edit 없음 | direct |
| 작고 명확한 local change | guarded |
| multi-step 또는 재개 가능한 objective | planned / Solo Harness |
| 독립 work package 분할 | Agent Team |
| ordered phase와 gate | Orchestrate |
| decision 이해 | [Workflow Policy](workflow-policy.md) |

## Memory와 search

~~~bash
aios memo add "Keep authentication tests strict"
aios memo search "authentication"
node scripts/aios.mjs search "release readiness" --agent codex-cli --json
node scripts/aios.mjs search "browser MCP" --source docs,code --limit 8
~~~

ContextDB는 session, checkpoint, export, canonical memo를 로컬에 저장합니다. unified search는 memory, plans, docs, code를 검색합니다.

## Cross-client handoff

integration이 sync되어 있으면 같은 project에서 지원 client를 사용할 수 있습니다.

~~~bash
claude
codex
gemini
~~~

중요한 decision은 memo와 checkpoint로 명시합니다. client capability가 같다는 보장은 없으므로 aios doctor로 확인하세요.

## 하나의 장기 objective

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

전체 lifecycle은 [Solo Harness](solo-harness.md)를 참고하세요. dry-run은 provider test가 아닙니다.

## 독립 병렬 작업

~~~bash
aios team --provider codex --workers 3 --task "Implement X and update its tests" --dry-run --json
AIOS_EXECUTE_LIVE=1 AIOS_SUBAGENT_CLIENT=codex-cli \
  aios team 3:codex "Implement X and update its tests"
aios team status --provider codex --watch
~~~

governance와 blocked recovery는 [Agent Team](team-ops.md)을 확인하세요.

## 단계별 orchestration

~~~bash
aios orchestrate bugfix --task "Fix X" --dispatch local --execute dry-run
AIOS_EXECUTE_LIVE=1 AIOS_SUBAGENT_CLIENT=codex-cli \
  aios orchestrate bugfix --task "Fix X" --execute live --preflight none
~~~

ordered phase와 gate가 중요할 때 사용합니다. dry-run은 live provider 증거가 아닙니다.

## Browser automation

~~~bash
aios internal browser doctor
aios internal browser cdp-status
~~~

browser-use MCP over CDP를 기본 path로 사용하고 visible browser, semantic snapshot, targeted text, act, verify 순서로 진행합니다. auth wall에서는 human-in-the-loop를 유지하세요. Playwright MCP는 compatibility path입니다.

## Privacy와 verification

~~~bash
aios privacy read --file .env
aios privacy status
aios quality-gate pre-pr --profile strict
npm run test:scripts
~~~

.env, cookie, token, private key, browser profile을 model에 붙여 넣지 마세요. status와 dry-run은 verification을 대신하지 않습니다.

## 다음 페이지

- [Workflow Policy](workflow-policy.md)
- [ContextDB](contextdb.md)
- [Agent Team](team-ops.md)
- [Solo Harness](solo-harness.md)
- [문제 해결](troubleshooting.md)
