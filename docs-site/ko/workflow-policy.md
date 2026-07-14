---
title: 워크플로 정책
description: Harness CLI의 adaptive workflow policy로 direct, guarded, planned 작업을 선택하는 방법을 설명합니다.
---

# 워크플로 정책

## 빠른 답변

Harness CLI는 위험 기반 workflow policy를 사용합니다. adaptive 모드에서는 읽기 전용 질문은 direct로, 작은 코드 변경은 guarded로, 여러 단계 작업이나 명시적으로 route를 지정한 작업은 영속 plan으로 처리합니다. strict 모드는 substantive work를 planned로 만들지만 빈 메시지나 읽기 전용 질문까지 plan으로 만들지는 않습니다. Policy는 turn을 어떻게 처리할지만 결정하며 구현 완료를 증명하지는 않습니다.

## 지금 실행하기

프로젝트 루트에서 policy를 미리 보거나 적용합니다.

```bash
node scripts/aios.mjs plan auto-gate --task "Refactor the auth boundary and add tests" --json
node scripts/aios.mjs plan auto-gate --task "Refactor the auth boundary and add tests" --dry-run --json
```

첫 번째 명령은 decision이 `planned`일 때 plan을 만들 수 있습니다. 두 번째 명령은 같은 request를 평가하지만 planned artifact를 저장하지 않습니다. 프로젝트 루트가 현재 디렉터리가 아니면 `--workspace <path>`를 사용합니다.

## 네 가지 disposition

| Disposition | 용도 | Persistence | Verification scope |
| --- | --- | --- | --- |
| `noop` | 빈 입력 또는 명시적인 no-op | `none` | `none` |
| `direct` | 질문, 설명, 상태 확인, acknowledgement 또는 resume decision | `none` 또는 `reuse` | `none` |
| `guarded` | adaptive 모드의 작은 substantive change | `none` | `focused` |
| `planned` | 여러 단계, 명시적 plan, Team/Harness, design 또는 strict substantive work | `create` | `full` |

`direct`는 모든 안전 절차를 건너뛴다는 뜻이 아닙니다. Direct request가 나중에 파일 변경으로 이어지면 일반 edit 및 verification gate가 그대로 필요합니다. `guarded`는 영속 plan을 요구하지 않았다는 뜻일 뿐이며 파일을 변경하기 전 `pre-edit-safety-gate`, 변경 후 focused verification이 필요합니다.

## Adaptive와 Strict

Adaptive가 기본 모드입니다. “이 label을 바꾸고 focused test를 실행해” 같은 작은 implementation request는 보통 `guarded`로 남고, 여러 단계, migration, team route 또는 harness route를 포함하면 `planned`가 됩니다. Strict는 substantive work를 `planned`로 만들어 구현 전에 owner, tasks, evidence를 기록할 수 있게 합니다. 두 모드 모두 읽기 전용 질문, 빈 입력, active plan이 없는 resume request는 direct로 유지합니다.

Policy는 classifier이지 “작은 변경”을 완벽하게 정의하는 규칙은 아닙니다. 최종 decision에는 `reason`, `routeHint`, `requiredSkills`, `requiresPreEditSafety`, `verificationScope`가 포함되므로 경계가 중요하면 JSON을 확인하세요.

## Plan 지속성

Adapter는 다음 persistence instruction 중 하나를 반환합니다.

- `none`: plan artifact를 만들거나 갱신하지 않습니다. `noop`, 일반 direct 질문, adaptive guarded 변경이 여기에 해당합니다.
- `reuse`: 기존 nonterminal active plan을 사용합니다. 유효한 same-session acknowledgement 또는 명시적 resume에 사용합니다.
- `create`: 선택한 route와 required skills로 새 work-item plan을 시작합니다. Dry run은 decision만 반환하고 기록하지 않습니다.

`done`, `blocked`, `cancelled`, `completed`, `failed`, `abandoned` 같은 terminal status는 이어갈 수 없습니다. Plan decision은 구현 결과가 아닙니다. 종료하기 전 task 업데이트, evidence 기록, edit gate, verification이 모두 필요합니다.

## Continuation 규칙

Continuation에는 의도적으로 다른 두 경로가 있습니다.

1. **Same-session acknowledgement.** `ok`나 `approved` 같은 짧은 acknowledgement는 client와 session identity가 plan과 일치하고 plan이 nonterminal일 때만 재사용할 수 있습니다. 다른 client나 session의 acknowledgement는 continuation이 없는 direct request로 처리합니다.
2. **Explicit resume.** `resume`이나 `continue`는 client를 넘어 nonterminal plan을 재사용할 수 있습니다. 사용할 active plan이 없으면 결과는 `direct`와 `continuation=missing`이며 실수로 plan을 만들지 않습니다.

Acknowledgement나 resume 뒤에 새로운 actionable objective가 포함되면 새 work로 다시 분류하며 이전 plan에 조용히 연결하지 않습니다.

## Route Hints와 Skills

Decision은 route와 최소 process skill 집합을 제안할 수 있습니다.

| Route hint | 일반적인 trigger | Planned skills |
| --- | --- | --- |
| `implement` | feature 또는 file change | `writing-plans`, `test-driven-development` |
| `debug` | bug, failure 또는 crash | `systematic-debugging` |
| `verify` | test, typecheck, CI 또는 regression validation | `verification-before-completion` |
| `ops` | install, configure, upgrade, deploy 또는 release | `writing-plans` |
| `team` | parallel 또는 delegated work | `writing-plans`, `dispatching-parallel-agents` |
| `harness` | long-running 또는 overnight work | `writing-plans`, `aios-long-running-harness` |
| `design` | architecture, design 또는 brainstorming | `brainstorming`, `writing-plans` |

Policy는 선택된 skill을 대신하지 않습니다. `pre-edit-safety-gate`도 대신하지 않습니다. Safety gate는 파일 변경 전에 impact, dependency, style, test coverage를 확인합니다.

## 예시

### 읽기 전용 질문

```bash
node scripts/aios.mjs plan auto-gate --task "Why is this request classified as direct?" --json
```

`disposition=direct`, `persistence=none`이며 새 plan artifact가 없어야 합니다.

### Adaptive의 작은 구현

```bash
node scripts/aios.mjs plan auto-gate --task "Update the button label and run its focused test" --json
```

보통 `guarded`가 되고 focused verification을 사용하며 영속 plan을 만들지 않습니다. 여러 파일이나 단계로 확장되면 확장된 request를 다시 분류하세요.

### 여러 단계 구현

```bash
node scripts/aios.mjs plan auto-gate --task "First update the schema, then migrate callers, and finally add regression tests" --json
```

`planned`, `persistence=create`, full verification scope와 implementation skills가 예상됩니다.

### Team 작업

```bash
node scripts/aios.mjs plan auto-gate --task "Use an Agent Team to audit the API and docs in parallel" --json
```

Route hint는 `team`입니다. Policy decision이 provider를 직접 시작하지는 않습니다. Plan과 safety gate가 준비된 뒤 Agent Team preflight 및 실행 제어를 사용하세요.

### 명시적 resume

```bash
node scripts/aios.mjs plan auto-gate --task "resume" --json
```

사용 가능한 active plan이 있으면 `continuation=explicit-resume`와 `persistence=reuse`가 예상됩니다. 없으면 direct의 missing-continuation 결과가 나오며 새 plan은 만들지 않습니다.

## FAQ

### 모든 메시지가 plan을 만드나요?

아닙니다. 빈 입력은 `noop`, 질문과 설명은 `direct`, adaptive의 작은 변경은 보통 `guarded`입니다. Plan은 영속 task와 evidence가 필요한 작업에 사용합니다.

### Strict는 읽기 전용 질문을 plan으로 만드나요?

아닙니다. Read-only classification은 strict substantive-work rule보다 먼저 실행됩니다. Strict가 바꾸는 것은 substantive work이지 일반 설명이 아닙니다.

### 다른 client가 “ok”로 내 plan을 계속할 수 있나요?

약한 acknowledgement만으로는 안 됩니다. Same-session acknowledgement에는 원래 client와 session이 필요합니다. 다른 client로 의도적으로 넘길 때는 explicit `resume`을 사용하세요.

### Dry run이 live provider의 동작을 증명하나요?

아닙니다. Dry run은 로컬 decision 또는 preview path만 증명합니다. Live Agent Team, Harness, Orchestrate에는 각각 capability, human-gate, verification evidence가 필요합니다.

### Planned decision이 변경 완료와 같은가요?

아닙니다. Routing과 persistence decision일 뿐입니다. 구현에는 선택한 process skill, pre-edit check, tests, final verification이 필요합니다.

## 다음 단계

- [빠른 시작](getting-started.md): 프로젝트를 초기화하고 `aios doctor`를 실행합니다.
- [Architecture](architecture.md): policy, memory, agent, browser runtime의 경계를 확인합니다.
- [ContextDB](contextdb.md): pull-based project memory와 명시적 recall을 이해합니다.
- [Agent Team](team-ops.md) 및 [Solo Harness](solo-harness.md): parallel 또는 long-running execution을 선택합니다.
- [Workflow Policy 릴리스 글](/blog/ko/2026-07-v400-adaptive-workflow-policy/): v4.0 배경과 예시를 읽습니다.
