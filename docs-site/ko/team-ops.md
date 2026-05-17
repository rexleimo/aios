---
title: Agent Team 실전
description: Agent Team 을 언제 쓰고, 어떻게 시작・모니터링・마무리하며, 언제 쓰지 말아야 하는지.
---

# Agent Team 실전

Agent Team 은 “많을수록 좋은” 기능이 아닙니다. **분리 가능하고, 경계가 명확하며, 병렬 실행해도 안전한** 작업에 적합합니다.

라이브 모드에서 Agent Team 은 **GroupChat Runtime** 을 사용합니다. 에이전트가 공유 대화 스레드로 라운드 기반 실행을 하며, planner 가 작업을 분석하고 implementer 들이 병렬로 작업한 뒤 reviewer 가 검증합니다. 에이전트가 막히면 자동으로 re-plan 라운드가 트리거됩니다.

하나만 기억한다면:

```bash
aios team 3:codex "X 구현, 완료 전 테스트 실행, 변경 요약"
aios team status --provider codex --watch
```

<figure class="rex-visual">
  <img src="../assets/visual-agent-team-monitoring.svg" alt="Agent Team 시작 전 체크리스트와 HUD 상태 모니터링 그림">
  <figcaption>team 을 시작하기 전에 정말 병렬에 적합한지 확인하세요. 모니터링 창은 진행 상황만 보여주며, 닫아도 메인 작업은 중지되지 않습니다.</figcaption>
</figure>

## team 을 써야 할 때

적합:

- 하나의 요구를 frontend, backend, tests, docs 등 비교적 독립적인 부분으로 나눌 수 있음.
- “tests must pass”, “docs updated” 같은 acceptance criteria 를 이미 알고 있음.
- 병렬 실행에 추가 token 과 대기 비용을 지불할 수 있음.
- 여러 worker 를 HUD/history 로 추적해야 함.

부적합:

- 요구가 아직 불명확하고 방향을 탐색 중.
- 작은 bug, 단일 파일 수정, 일회성 command.
- 여러 worker 가 같은 파일을 수정할 가능성이 높음.
- 안정적 재현이 필요한 debugging 중.

확실하지 않으면 일반 인터랙티브로 시작하세요:

```bash
codex
```

team 시작 전 3가지를 확인하세요:

<div class="rex-checklist">
  <div class="rex-checklist__item">2개 이상의 독립 모듈로 나눌 수 있음</div>
  <div class="rex-checklist__item">worker 들이 같은 파일 묶음을 수정하지 않음</div>
  <div class="rex-checklist__item">acceptance criteria 를 한 문장으로 설명 가능</div>
</div>

## 10분 실행 흐름

### 1) 작업을 명확히 쓰기

좋은 작업 설명에는 goal, boundary, acceptance criteria 가 들어갑니다.

```bash
aios team 3:codex "로그인 폼 오류 메시지 개선; auth API 는 변경하지 않음; 완료 전 관련 테스트 실행 및 docs 업데이트"
```

### 2) 모니터링 시작

```bash
aios team status --provider codex --watch
```

가벼운 모드:

```bash
aios team status --provider codex --watch --preset minimal --fast
```

### 3) 기록과 실패 보기

```bash
aios team history --provider codex --limit 20
aios team history --provider codex --quality-failed-only
```

### 4) 마무리 전 quality gate

```bash
aios quality-gate pre-pr --profile strict
```

quality gate 가 실패하면 먼저 failure category 를 확인하세요. 바로 worker 를 더 늘리지 마세요.

## worker 수 선택

| 레벨 | 명령 | 적합한 상황 |
|---|---|---|
| 안정 | `aios team 2:codex "task"` | 첫 실행, 파일 겹침 가능성 있음 |
| 권장 | `aios team 3:codex "task"` | 대부분의 일상 기능 |
| 고처리량 | `aios team 4:codex "task"` | 모듈이 독립적이고 테스트가 명확함 |

충돌, 중복 수정, 긴 대기가 보이면 worker 를 더하지 말고 concurrency 를 낮추세요.

## provider 선택

```bash
aios team 3:codex "task"
aios team 2:claude "task"
aios team 2:gemini "task" --dry-run
```

추천:

- 일상 구현은 `codex` 우선.
- 긴 분석이나 방안 비교는 `claude` 시도.
- command 영향이 불확실하면 `--dry-run` 추가.

## resume 과 retry

실행이 중단되면 먼저 history 확인:

```bash
aios team history --provider codex --limit 5
```

그다음 blocked jobs 만 retry:

```bash
aios team --resume <session-id> --retry-blocked --provider codex --workers 2
```

이전 실패 원인을 이해하기 전에 더 큰 team 을 새로 시작하지 마세요.

## team 과 orchestrate 차이

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

## GroupChat Runtime (라운드 기반 Agent Team)

라이브 모드에서 `aios team` 은 **GroupChat Runtime** 을 사용합니다. 이는 에이전트들이 격리된 일회성 dispatch 가 아닌, 단일 공유 대화 스레드에서 실행되는 라운드 기반 실행 모델입니다.

### 기존 병렬 dispatch 와의 차이점

| | 기존 병렬 | GroupChat Runtime |
|---|---|---|
| 에이전트 간 통신 | 격리됨; 의존 출력만 | 공유 대화 히스토리 |
| 실행 순서 | 정적 DAG 단계 | 라운드(순차), 라운드 내 병렬 speaker |
| 블록 복구 | 수동 retry | 자동 re-plan (planner 재평가) |
| 작업 확장 | 고정 큐 | Planner 발견 사항이 병렬 작업 항목으로 |
| 종료 | 모든 job 완료 | 합의 또는 최대 라운드 도달 |

### 라운드 흐름

GroupChat 은 blueprint 단계를 라운드에 매핑합니다. 각 라운드 내에서 speaker 는 동시에 실행됩니다 (`AIOS_SUBAGENT_CONCURRENCY` 로 제어). 한 라운드가 끝나면 다음 라운드의 모든 에이전트가 전체 누적 히스토리를 볼 수 있습니다.

```
Round 1 → planner (분석, 작업 항목 생성)
Round 2 → N × implementer (병렬, 작업 항목당 하나씩)
Round 3 → reviewer (+ security-reviewer 병렬)
```

implementer 가 `blocked` 또는 `needs-input` 을 보고하면 **re-plan 라운드**가 자동으로 삽입됩니다. planner 가 전체 히스토리를 보고 상황을 재평가한 후 다음 단계를 결정합니다.

### Blueprint 선택

| Blueprint | 라운드 | 적합한 상황 |
|---|---|---|
| `bugfix` | plan → implement → review | 단일 초점 수정, 작은 범위 |
| `feature` | plan → implement → review + security | 품질 게이트가 필요한 새 기능 |
| `refactor` | plan → implement → review | 순수 리팩터링, 기능 변경 없음 |
| `security` | assess → plan → implement → review | 보안에 민감한 변경 |

작업에 맞는 가장 작은 blueprint 를 선택하세요. 단순 파일 생성에는 `feature` 가 아닌 `bugfix` 를 사용합니다.

Blueprint, role card, runtime manifest, executor manifest, handoff schema 는 `scripts/lib/specs/` 에 포함됩니다. Team 실행 상태와 증거는 계속 `.aios/context-db/` 에 기록됩니다. `memory/memo/` 는 프로젝트 memo 전용이며 team runtime store 가 아닙니다.

### 설정

```bash
# 라이브 실행 필수
export AIOS_EXECUTE_LIVE=1
export AIOS_SUBAGENT_CLIENT=codex-cli   # 또는 claude-code, gemini-cli, opencode-cli

# 동시성 (라운드당 speaker 수)
export AIOS_SUBAGENT_CONCURRENCY=3      # 기본값: 3

# 에이전트 턴당 타임아웃 (ms)
export AIOS_SUBAGENT_TIMEOUT_MS=600000  # 기본값: 10분

# capability preflight 없이 라이브 실행 허용 (주의해서 사용)
export AIOS_ALLOW_UNKNOWN_CAPABILITIES=1
```

GroupChat 라이브 실행은 `AIOS_EXECUTE_LIVE=1` 로 gate 되어 있습니다. 이 설정이 없으면 `aios team` 은 dispatch plan 의 dry-run preview 로 폴백합니다.

## 자주 쓰는 명령

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

## 고급 운영 참고

아래 명령은 초보자 흐름에 익숙해진 뒤 사용하세요.

### HUD presets

| Preset | 용도 |
|---|---|
| `minimal` | 긴 watch 세션 |
| `compact` | 터미널 친화 요약 |
| `focused` | 균형 잡힌 기본값 |
| `full` | 전체 진단 |

### Skill candidates

Skill candidates 는 실패한 세션에서 추출되는 개선 제안입니다. 온보딩 첫 단계가 아니라 실패 복기 때 확인하세요.

```bash
aios team status --show-skill-candidates
aios team skill-candidates list --session <session-id>
aios team skill-candidates export --session <session-id> --output ./candidate.patch.md
```

적용 전에는 반드시 수동으로 패치를 검토하세요. 특히 skills, hooks, MCP 설정을 바꾸는 제안은 더 주의해야 합니다.


## 관련 문서

- [시나리오별 명령 찾기](use-cases.md)
- [HUD 가이드](hud-guide.md)
- [Skill Candidates](skill-candidates.md)
- [라우팅/병렬 프로필](route-concurrency-profiles.md)
- [문제 해결](troubleshooting.md)
