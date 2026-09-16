---
title: AIOS 아키텍처
description: client guidance, ContextDB, Workflow Policy, Team, Harness, browser-use CDP, RL research의 연결을 설명합니다.
---

# 아키텍처

## 먼저 답하면

AIOS는 기존 coding client 주변에 로컬 경계를 제공합니다. client guidance가 project를 식별하고 ContextDB가 evidence를 저장하고 recall하며 Workflow Policy가 가장 작은 route를 선택합니다. 필요하면 Team, Solo Harness, Orchestrate가 task를 실행합니다. 브라우저 기본 path는 browser-use CDP이고 오래된 Playwright MCP는 compatibility path입니다.

## Components

| Layer | Main surface | Responsibility |
| --- | --- | --- |
| Client entry | scripts/contextdb-shell.zsh, client-sources/, native guidance | project instruction과 route hint |
| Startup bridge | scripts/contextdb-shell-bridge.mjs, scripts/ctx-agent.mjs | wrapper / passthrough 판단과 client 실행 |
| ContextDB | mcp-server/src/contextdb/, .aios/context-db/ | session, memo, checkpoint, search, context pack |
| Workflow Policy | scripts/lib/planning/workflow-policy.mjs, auto-gate.mjs, cli.mjs | noop, direct, guarded, planned 분류 |
| Operations | scripts/aios.mjs, team, harness, orchestrate, HUD | dispatch, status, evidence |
| Browser | scripts/run-browser-use-mcp.sh, chrome.*, browser.*, page.* | CDP의 browser-use MCP |
| Research | scripts/lib/rl-core/, rl-* adapter | RL experiment와 evaluation |

## Runtime Flow

~~~text
user command
  -> supported client + native project guidance
  -> optional shell bridge / ctx-agent compatibility path
  -> .aios/context-db/index.json registry
  -> ContextDB search, memo, checkpoint, context pack
  -> Workflow Policy route decision
  -> direct, Team, Solo Harness 또는 Orchestrate
  -> diagnostic, test, verification evidence
~~~

route decision은 implementation complete와 같지 않습니다. file edit에는 pre-edit safety와 final verification이 필요합니다.

## ContextDB와 storage boundary

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

public model은 pull-based입니다. agent는 필요한 source만 검색하고 recall하며 전체 history가 자동으로 전달되지는 않습니다. .contextdb-enable과 오래된 wrapper mode는 compatibility로 남지만 primary onboarding은 아닙니다.

## Workflow Policy boundary

| Disposition | 용도 |
| --- | --- |
| noop | action 불필요 |
| direct | 답변 또는 inspection, persistent plan 없음 |
| guarded | 작고 명확한 local change, edit와 verification 필요 |
| planned | multi-step, risk, delegation, resume 또는 불명확한 task |

plan persistence는 none, reuse, create입니다. 같은 session acknowledgement와 다른 client에서의 explicit resume은 다릅니다. 자세한 내용은 [Workflow Policy](workflow-policy.md)입니다.

## Team, Solo Harness, Orchestrate

- Agent Team은 독립 work package 병렬 협업입니다. HUD, status, history, quality category가 evidence입니다.
- Solo Harness는 checkpoint, stage journal, worktree, resume status를 가진 하나의 긴 objective용입니다.
- Orchestrate는 staged dispatch DAG와 quality-gated phase용입니다.
- dry-run은 local simulation이며 live provider나 client route가 작동한다는 증거가 아닙니다.
- live subagent는 opt-in이며 실행 전에 doctor와 command help를 확인합니다.

~~~bash
aios team status --watch
aios harness status --session <session-name> --json
aios orchestrate --help
aios doctor --native --verbose
~~~

## Browser runtime

기본 browser path는 browser-use MCP over CDP입니다.

- launcher: scripts/run-browser-use-mcp.sh
- launch: chrome.launch_cdp
- connect: browser.connect_cdp
- page: page.semantic_snapshot, page.extract_text, page.goto, page.screenshot
- profile: config/browser-profiles.json

visible CDP browser를 사용하고 semantic 또는 targeted text를 먼저 읽으며 read -> act -> verify를 짧게 유지합니다. mcp-server의 Playwright MCP는 compatibility와 low-level inspection용이며 기본 business-flow path가 아닙니다.

## RL Training Layer (AIOS) {#rl-training-layer-aios}

AIOS에는 일반 AIOS setup과 분리된 multi-environment RL research surface도 있습니다. scripts/lib/rl-core/가 campaign state, checkpoint lineage, comparison, replay, teacher signal, trainer entry point를 다루며 shell, browser, orchestrator, mixed adapter를 제공합니다.

~~~bash
node scripts/rl-shell-v1.mjs benchmark-generate --count 20
node scripts/rl-shell-v1.mjs train --epochs 5
node scripts/rl-shell-v1.mjs eval
node scripts/rl-mixed-v1.mjs mixed --mixed
node scripts/rl-mixed-v1.mjs mixed-eval
~~~

RL status와 benchmark는 대상 environment와 version에 한정된 research evidence입니다. production reliability나 공개 performance claim을 자동으로 증명하지 않습니다.

## Failure boundaries

- registry 없음: 의도한 project root에서 aios init --all 실행.
- native guidance가 오래됨: aios doctor --native --verbose, dry-run, 필요하면 --fix.
- browser auth: 인증 wall에서 human-in-the-loop 유지.
- live route failure: dry-run과 실제 provider/client status 비교.
- verification failure: plan을 닫지 말고 첫 failure command 기록.

## 다음 페이지

- [빠른 시작](getting-started.md)
- [Workflow Policy](workflow-policy.md)
- [Agent Team](team-ops.md)
- [Solo Harness](solo-harness.md)
- [문제 해결](troubleshooting.md)
