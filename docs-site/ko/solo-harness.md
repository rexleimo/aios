---
title: Solo Harness: 재개 가능한 장기 작업
description: journal, stop/resume, verification evidence와 선택적 git worktree 격리로 하나의 objective를 실행합니다.
---

# Solo Harness

## 먼저 답하면

interactive session보다 오래 걸릴 하나의 명확한 objective에 Solo Harness를 사용합니다. parallel worker가 필요한 task에는 맞지 않습니다. run journal과 checkpoint를 기록하고 status, stop, resume과 git worktree 격리를 제공합니다. 독립 module은 Agent Team, ordered quality gate는 Orchestrate를 사용하세요.

## 지금 실행

~~~bash
aios harness run \
  --objective "Refactor the auth module and write integration tests" \
  --session nightly-auth \
  --worktree \
  --max-iterations 20
~~~

~~~bash
aios harness status --session nightly-auth --json
aios hud --session nightly-auth --json
~~~

## 선택 기준

| Situation | Route |
| --- | --- |
| 하나의 goal, provider, 장기 실행 | Solo Harness |
| 독립 module과 ownership | [Agent Team](team-ops.md) |
| ordered phase와 gate | aios orchestrate |
| 불명확한 요구사항 또는 작은 fix | Workflow Policy와 interactive client |

objective에 scope, 제외 항목, verification을 써서 완료 여부를 다른 사람이 판단할 수 있게 합니다.

## Worktree 격리

--worktree는 선택한 base ref에서 별도 git worktree를 만듭니다. merge 전에 worktree와 diff를 확인하세요. 격리는 unsafe command를 안전하게 만들지 않습니다.

## Live 전 dry-run

~~~bash
aios harness run \
  --objective "Draft tomorrow's handoff" \
  --session test-run \
  --worktree \
  --max-iterations 3 \
  --dry-run --json
~~~

dry-run은 argument parsing과 local journal을 확인합니다. provider, client, credential, live route의 증거는 아닙니다.

## Stop, inspect, resume

~~~bash
aios harness stop --session nightly-auth --reason "morning review"
aios harness status --session nightly-auth --json
aios harness resume --session nightly-auth --max-iterations 10
~~~

resume 전에 status, checkpoint, failure command를 읽습니다. 새 session을 의도적으로 만들지 않는 한 objective를 유지하세요.

## Hooks와 provider

~~~bash
aios harness run --objective "task" --session demo --hooks
aios harness resume --session demo --no-hooks
aios harness run --objective "task" --provider codex --profile strict
~~~

provider와 route는 live check가 필요합니다. dry-run에서 추론하지 마세요.

## Artifacts

~~~text
.aios/context-db/sessions/<session-id>/artifacts/solo-harness/
  objective.md
  run-summary.json
  control.json
  hook-events.jsonl
  iteration-0001.json
  iteration-0001.log
~~~

log와 checkpoint는 project data입니다. 공유 전에 credential과 private provider output을 redaction하세요.

## 복구 체크리스트

1. status와 최신 iteration log를 읽습니다.
2. 첫 failure를 찾습니다.
3. 가장 작은 diagnosis command를 실행합니다.
4. reason을 붙여 stop 또는 resume합니다.
5. merge 전에 diff와 test를 verify합니다.

## FAQ

### 하룻밤에 완료된다고 보장하나요?

아닙니다. resumable loop와 evidence를 제공하지만 provider, credential, test, task complexity가 실행을 중단할 수 있습니다.

### 항상 --worktree가 필요한가요?

code edit가 포함되거나 격리가 필요할 때 사용합니다. read-only task도 workspace boundary를 확인하세요.

### client가 harness를 자동 trigger할 수 있나요?

지원되는 native route prompt가 harness route를 제안할 수 있습니다. 실행 후 status, provider, evidence를 확인하세요.

## 다음 페이지

- [Agent Team](team-ops.md)
- [HUD 가이드](hud-guide.md)
- [Workflow Policy](workflow-policy.md)
- [문제 해결](troubleshooting.md)
