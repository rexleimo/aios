---
title: Agent Team: 증거를 남기는 병렬 작업
description: 독립 work package를 선택하고 Agent Team을 시작하며 HUD 상태와 blocked job을 안전하게 복구합니다.
---

# Agent Team

## 먼저 답하면

두 개 이상의 독립 work package로 나눌 수 있고 owner와 acceptance evidence가 명확할 때 Agent Team을 사용합니다. 작거나 결합된 변경은 하나의 client, 하나의 긴 objective는 Solo Harness, 단계별 quality gate는 Orchestrate를 사용하세요. dry-run은 local dispatch 상태만 확인하며 live provider 사용 가능성을 증명하지 않습니다.

## 지금 실행

먼저 preview합니다.

~~~bash
aios team --provider codex --workers 3 --task "Review auth, tests, and docs" --dry-run --json
~~~

task와 live provider가 준비되면:

~~~bash
AIOS_EXECUTE_LIVE=1 AIOS_SUBAGENT_CLIENT=codex-cli \
  aios team 3:codex "Review auth, tests, and docs"
~~~

## Route 선택

| Need | Route |
| --- | --- |
| 답변, inspection, 작은 local change | direct 또는 guarded |
| 하나의 긴 objective | [Solo Harness](solo-harness.md) |
| 두 개 이상의 독립 work package | Agent Team |
| ordered phase와 gate | aios orchestrate |
| 요구사항이 불명확함 | 먼저 interactive client |

## 시작 전

goal, boundary, acceptance evidence를 한 문장으로 작성합니다.

~~~text
Goal: update the login form
Boundary: do not change the auth API
Evidence: focused tests pass and docs link to the new behavior
~~~

worker가 같은 file을 편집하지 않는지 확인하세요. 겹치면 ownership을 순서대로 실행하거나 하나의 agent를 사용합니다.

## 모니터링과 review

~~~bash
aios team status --provider codex --watch
aios hud --provider codex
aios team history --provider codex --limit 20
aios team history --provider codex --quality-failed-only
aios quality-gate pre-pr --profile strict
~~~

merge 전에 changed file과 quality category를 확인합니다. status는 operational evidence이며 correctness 증명은 아닙니다.

## Governance evidence

agent, route, workflow skill을 바꾸면 다음을 실행합니다.

~~~bash
node scripts/aios.mjs agents smoke --dry-run --json
node scripts/aios.mjs agents smoke --json
node scripts/aios.mjs skill certify --changed --base HEAD --json
node scripts/aios.mjs skill verify-training --changed --base HEAD --json
~~~

evidence는 .aios/agents/와 .aios/interception/metrics/에 기록됩니다. 민감한 provider output을 공개 issue에 넣지 마세요.

## 복구

retry 전에 최신 session을 확인합니다.

~~~bash
aios team history --provider codex --limit 5
aios team --resume <session-id> --retry-blocked --provider codex --workers 2
~~~

충돌이 있으면 worker 수를 줄입니다. --force는 우회할 safety guard를 이해한 경우에만 사용하세요.

## Runtime

~~~text
planner -> independent implementers -> reviewer
                 |
                 +-> blocked job은 replanning round를 만들 수 있음
~~~

feature, bugfix, refactor, security blueprint 중 작업에 맞는 가장 작은 것을 선택합니다. preflight가 plan artifact를 요구하면 유지하세요.

## FAQ

### Team이 항상 더 빠른가요?

아닙니다. coordination과 provider work가 늘어납니다. 정말 독립적인 work package일 때만 유용합니다.

### dry-run이 provider를 테스트하나요?

아닙니다. local parsing과 dispatch state를 확인합니다. live provider와 client route에는 작은 live smoke task가 필요합니다.

### blocked run을 재개할 수 있나요?

가능합니다. history에서 blocked job을 찾고 resume과 retry-blocked를 사용하세요.

## 다음 페이지

- [HUD 가이드](hud-guide.md)
- [Workflow Policy](workflow-policy.md)
- [솔로 Harness](solo-harness.md)
- [사용 사례](use-cases.md)
