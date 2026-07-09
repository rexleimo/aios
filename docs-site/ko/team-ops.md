---
title: Agent Team 실전
description: Agent Team 을 언제 쓰고, 어떻게 시작・모니터링・마무리하며, 언제 쓰지 말아야 하는지.
---

# Agent Team 실전

**One agent is good. Multiple agents working together can be great — but only when the task actually calls for it.**

Agent Team 을 사용하면 여러 코딩 에이전트에 작업을 분할하여 병렬로 실행할 수 있습니다. 각 에이전트가 작업의 일부를 처리하며 실시간으로 진행 상황을 모니터링할 수 있습니다.

## The One Command To Remember

```bash
# Start 3 agents on a task
aios team 3:codex "Build the settings page, add tests, and update docs"

# Watch them work
aios team status --provider codex --watch
```

## When To Use Teams (And When Not To)

### Good fit for Agent Team

적합:

- 하나의 요구를 frontend, backend, tests, docs 등 비교적 독립적인 부분으로 나눌 수 있음.
- "tests must pass", "docs updated" 같은 acceptance criteria 를 이미 알고 있음.
- 병렬 실행에 추가 token 과 대기 비용을 지불할 수 있음.
- 여러 worker 를 HUD/history 로 추적해야 함.

### Bad fit for Agent Team

부적합:

- 요구가 아직 불명확하고 방향을 탐색 중.
- 작은 bug, 단일 파일 수정, 일회성 command.
- 여러 worker 가 같은 파일을 수정할 가능성이 높음.
- 안정적 재현이 필요한 debugging 중.

확실하지 않으면 일반 인터랙티브로 시작하세요:

```bash
codex
```

### Quick Checklist

team 시작 전 3가지를 확인하세요:

<div class="rex-checklist">
  <div class="rex-checklist__item">2개 이상의 독립 모듈로 나눌 수 있음</div>
  <div class="rex-checklist__item">worker 들이 같은 파일 묶음을 수정하지 않음</div>
  <div class="rex-checklist__item">acceptance criteria 를 한 문장으로 설명 가능</div>
</div>

## The 10-Minute Flow

### 1. Write A Clear Task

좋은 작업 설명에는 goal, boundary, acceptance criteria 가 들어갑니다.

```bash
aios team 3:codex "로그인 폼 오류 메시지 개선; auth API 는 변경하지 않음; 완료 전 관련 테스트 실행 및 docs 업데이트"
```

### 2. Start Monitoring

```bash
aios team status --provider codex --watch
```

가벼운 모드:

```bash
aios team status --provider codex --watch --preset minimal --fast
```

### 3. Check History And Failures

```bash
aios team history --provider codex --limit 20
aios team history --provider codex --quality-failed-only
```

### 4. Run A Quality Check Before Finishing

```bash
aios quality-gate pre-pr --profile strict
```

quality gate 가 실패하면 먼저 failure category 를 확인하세요. 바로 worker 를 더 늘리지 마세요.

## How Many Agents Should I Use?

| Count | Command | Best for |
|---|---|---|
| 2 | `aios team 2:codex "task"` | 첫 실행, 파일 겹침 가능성 있음 |
| 3 | `aios team 3:codex "task"` | 대부분의 일상 기능（권장） |
| 4 | `aios team 4:codex "task"` | 모듈이 독립적이고 테스트가 명확한 경우 |

충돌, 중복 수정, 긴 대기가 보이면 worker 를 더하지 말고 concurrency 를 낮추세요.

## Choosing A Provider

```bash
aios team 3:codex "task"
aios team 2:claude "task"
aios team 2:gemini "task" --dry-run
```

추천:

- 일상 구현은 `codex` 우선.
- 긴 분석이나 방안 비교는 `claude` 시도.
- command 영향이 불확실하면 `--dry-run` 추가.

## If Something Goes Wrong

### A run was interrupted

실행이 중단되면 먼저 history 확인:

```bash
aios team history --provider codex --limit 5
```

그다음 blocked jobs 만 retry:

```bash
aios team --resume <session-id> --retry-blocked --provider codex --workers 2
```

이전 실패 원인을 이해하기 전에 더 큰 team 을 새로 시작하지 마세요.

## How Team Works Under The Hood

라이브 모드에서 `aios team` 은 **GroupChat Runtime** 을 사용합니다. 이는 에이전트들이 격리된 일회성 dispatch 가 아닌, 단일 공유 대화 스레드에서 실행되는 라운드 기반 실행 모델입니다.

```
Round 1 → Planner analyzes the task and creates work items
Round 2 → N implementers work in parallel (one per work item)
Round 3 → Reviewer checks the results
```

If an agent gets stuck, the planner **automatically re-plans** the next round.

### Blueprints

| Blueprint | Rounds | Best for |
|---|---|---|
| `bugfix` | plan → implement → review | 단일 초점 수정, 작은 범위 |
| `feature` | plan → implement → review + security | 품질 게이트가 필요한 새 기능 |
| `refactor` | plan → implement → review | 순수 리팩터링, 기능 변경 없음 |
| `security` | assess → plan → implement → review | 보안에 민감한 변경 |

작업에 맞는 가장 작은 blueprint 를 선택하세요. 단순 파일 생성에는 `feature` 가 아닌 `bugfix` 를 사용합니다.

Blueprint, role card, runtime manifest, executor manifest, handoff schema 는 `scripts/lib/specs/` 에 포함됩니다. Team 실행 상태와 증거는 계속 `.aios/context-db/` 에 기록됩니다. `.aios/memo/` 는 프로젝트 memo 전용이며 team runtime store 가 아닙니다.

## Agent 거버넌스와 smoke 증거

agent 수가 늘어날수록 workflow 변경은 contract 변경으로 봐야 합니다. team 이나 harness live 실행을 열기 전에 smoke 증거와 training check 로 새 동작이 시스템 contract 에 맞는지 확인하세요.

```bash
# live 실행 없이 agent smoke 경로를 미리 보기
node scripts/aios.mjs agents smoke --dry-run --json

# 현재 agent 집합에 대한 smoke 증거 기록
node scripts/aios.mjs agents smoke --json

# 변경된 skill 이 live 사용 전에 training 되었는지 확인
node scripts/aios.mjs skill verify-training --changed --base HEAD --json
```

smoke 실행은 core-risk agent 별로 다음 3가지 증거를 남깁니다.

- `.aios/agents/smoke/<agent>.json`
- `.aios/agents/provenance/<agent>.json`
- `.aios/interception/metrics/agents-smoke-<agent>.jsonl`

이 증거를 docs 변경, skill 업데이트, routing 조정이 live workflow 로 넘어가도 되는지 판단하는 기준으로 사용하세요. skill 을 바꿨다면 training verification 은 done 조건입니다.

### Configuration

```bash
# 라이브 실행 필수
export AIOS_EXECUTE_LIVE=1
export AIOS_SUBAGENT_CLIENT=codex-cli   # 또는 claude-code, gemini-cli, opencode-cli, grok-build

# 동시성 (라운드당 speaker 수)
export AIOS_SUBAGENT_CONCURRENCY=3      # 기본값: 3

# 에이전트 턴당 타임아웃 (ms)
export AIOS_SUBAGENT_TIMEOUT_MS=600000  # 기본값: 10분

# capability preflight 없이 라이브 실행 허용 (주의해서 사용)
export AIOS_ALLOW_UNKNOWN_CAPABILITIES=1
```

GroupChat 라이브 실행은 `AIOS_EXECUTE_LIVE=1` 로 gate 되어 있습니다. 이 설정이 없으면 `aios team` 은 dispatch plan 의 dry-run preview 로 폴백합니다.

## Team vs. Harness vs. Orchestrate

| 기능 | 더 적합한 용도 |
|---|---|
| `aios team ...` | 하나의 작업에 여러 worker 를 빠르게 시작 |
| `aios orchestrate ... --execute dry-run` | staged DAG 와 gates 를 preview |
| `aios orchestrate ... --execute live` | 엄격한 단계 실행이 필요한 메인테이너 |

새 사용자는 `team` 을 우선 사용하세요. `orchestrate live` 는 명시적 opt-in 이 필요합니다:

```bash
export AIOS_EXECUTE_LIVE=1
export AIOS_SUBAGENT_CLIENT=codex-cli
aios orchestrate --session <session-id> --dispatch local --execute live
```

## Command Reference

```bash
# team 시작 (기본 dry-run preview)
aios team 3:codex "Ship X"

# 라이브 GroupChat 실행으로 team 시작
AIOS_EXECUTE_LIVE=1 AIOS_SUBAGENT_CLIENT=codex-cli aios team 3:codex "Ship X"

# 현재 상태 모니터링
aios team status --provider codex --watch

# 최근 기록
aios team history --provider codex --limit 20

# 실패만 보기
aios team history --provider codex --quality-failed-only

# 현재 세션 HUD
aios hud --provider codex

# blocked jobs retry
aios team --resume <session-id> --retry-blocked --provider codex --workers 2

# GroupChat runtime 으로 orchestrate (풀 라운드 기반 실행)
AIOS_EXECUTE_LIVE=1 AIOS_SUBAGENT_CLIENT=codex-cli \
  aios orchestrate bugfix --task "Fix X" --execute live --preflight none
```

## Advanced Operations Reference

아래 명령은 초보자 흐름에 익숙해진 뒤 사용하세요.

### HUD Presets

| Preset | 용도 |
|---|---|
| `minimal` | 긴 watch 세션 |
| `compact` | 터미널 친화 요약 |
| `focused` | 균형 잡힌 기본값 |
| `full` | 전체 진단 |

```bash
aios hud --provider codex
aios hud --watch --preset focused
aios hud --session <session-id> --json
```

### Skill Candidates

Skill candidates 는 실패한 세션에서 추출되는 개선 제안입니다. 온보딩 첫 단계가 아니라 실패 복기 때 확인하세요.

```bash
aios team status --show-skill-candidates
aios team skill-candidates list --session <session-id>
aios team skill-candidates export --session <session-id> --output ./candidate.patch.md
```

적용 전에는 반드시 수동으로 패치를 검토하세요. 특히 skills, hooks, MCP 설정을 바꾸는 제안은 더 주의해야 합니다.

## Where To Go Next

- [시나리오별 명령 찾기](use-cases.md)
- [HUD 가이드](hud-guide.md)
- [Skill Candidates](skill-candidates.md)
- [라우팅/병렬 프로필](route-concurrency-profiles.md)
- [문제 해결](troubleshooting.md)
