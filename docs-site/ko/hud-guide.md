---
title: HUD 사용자 가이드
description: HUD(Heads-Up Display) 를 사용하여 에이전트 세션을 모니터링하는 완전한 가이드.
---

# HUD 사용자 가이드

HUD(Heads-Up Display) 는 에이전트 세션 상태, dispatch 결과, 개선 기회를 실시간으로 가시화합니다.

## HUD 사용 시기

- **장기 실행 작업**: 에이전트를 방해하지 않고 진행 상황 모니터링
- **실패 디버깅**: quality-gate 결과와 hindsight 분석 확인
- **스킬 개선**: skill candidate 패치 발견 및 적용
- **팀 조정**: 여러 동시 세션 추적

## HUD 모드

### Minimal 모드

장기 실행 세션의 워치에 최적:
- 기본 상태만 표시
- 빠른 새로고침 (1 초 데이터 폴링)
- 리소스 사용 줄이는 적응형 간격

```bash
aios hud --watch --preset minimal --fast
```

### Compact 모드

터미널 친화적인 요약:
- 세션 목표
- Dispatch 요약
- Quality-gate 상태

```bash
aios hud --preset compact
```

### Focused 모드 (기본값)

대부분의 사용 사례에 적합한 균형:
- 모든 compact 정보
- 최근 dispatch artifacts
- Skill candidate hints

```bash
aios hud --preset focused
```

### Full 모드

완전한 진단:
- 모든 focused 정보
- 완전한 hindsight 분석
- Quality-gate 세부 정보
- Fix hints 와 권장 사항

```bash
aios hud --preset full
```

## 기본 사용법

### 현재 세션 보기

```bash
# 기본 focused 뷰
aios hud

# 프로바이더 지정
aios hud --provider claude
aios hud --provider gemini
```

### 워치 모드

```bash
# 지속적 모니터링 (1 초 새로고침)
aios hud --watch

# 사용자 지정 간격 (밀리초)
aios hud --watch --interval-ms 2000

# 적응형 간격과 빠른 모드
aios hud --watch --fast
```

### 세션 지정

```bash
# 세션 ID 로
aios hud --session <session-id>

# 최근 기록에서
aios hud --session $(aios team history --json | jq -r '.[0].sessionId')
```

### JSON 출력

```bash
# 기계 판독 출력
aios hud --json

# jq 로 필터링
aios hud --json | jq '.selection.qualityGate'
```

## Skill Candidate 기능

### Skill Candidates 보기

세션에 개선 제안이 있을 때 skill candidates 가 자동으로 표시됩니다:

```bash
# HUD 에 candidates 인라인 표시
aios hud --show-skill-candidates

# 상세 뷰 (candidates 만, HUD 없음)
aios hud --show-skill-candidates --skill-candidate-view detail

# 후보 수 제한 (1-20)
aios hud --show-skill-candidates --skill-candidate-limit 10
```

### Skill Candidate 뷰 모드

**Inline (기본값)**: Candidates 가 HUD 아래에 표시

```
═══════════════════════════════════════
HUD 상태
═══════════════════════════════════════
Session: abc123
Goal: 사용자 인증 구현
Status: running | dispatch=ok | quality=ok
...

───────────────────────────────────────
Skill Candidates (3)
───────────────────────────────────────
[1] skill-candidate-001
    Scope: authentication
    Failure: token-validation-edge-case
    Lessons: 2
    Patch: 만료된 토큰에 재시도 로직 추가

[2] skill-candidate-002
    ...
```

**Detail**: Candidates 만 표시 (HUD 숨김)

```bash
aios hud --show-skill-candidates --skill-candidate-view detail
```

### 패치 템플릿 내보내기

```bash
# 기본 위치에 내보내기
aios hud --export-skill-candidate-patch-template

# 특정 draft ID 필터와 함께 내보내기
aios hud --export-skill-candidate-patch-template --draft-id <draft-id>

# 사용자 지정 candidate 제한으로 내보내기
aios hud --export-skill-candidate-patch-template --skill-candidate-limit 5
```

**출력 위치**: `memory/context-db/sessions/<session-id>/artifacts/skill-candidate-patch-template-<timestamp>.md`

### Draft ID 로 필터

```bash
# 특정 draft 의 candidates 만 표시
aios hud --show-skill-candidates --draft-id <draft-id>

# 필터된 candidates 내보내기
aios hud --export-skill-candidate-patch-template --draft-id <draft-id>
```

## Quality-Gate 통합

### Quality-Gate 상태 보기

HUD 는 quality-gate 결과를 자동으로 표시합니다:

```bash
# 완전한 뷰에 quality 세부 정보 포함
aios hud --preset full

# 프로그래밍 접근을 위한 JSON 출력
aios hud --json | jq '.selection.qualityGate'
```

### Quality 카테고리로 필터

```bash
# HUD 에서 직접 지원되지 않음 - team history 사용
aios team history --quality-category clarity --limit 5
```

## 성능 튜닝

### Fast 워치 모드

장기 실행 워치 세션에 최적화:

```bash
# Minimal preset + fast mode = 최소 오버헤드
aios hud --watch --preset minimal --fast

# 데이터 새로고침: 1 초 (최소)
# 렌더 간격: 적응형 (활동 based 1 초 -10 초)
```

### 사용자 지정 새로고침 간격

```bash
# 백그라운드 모니터링을 위한 더 느린 새로고침
aios hud --watch --interval-ms 5000

# 적응형 간격 (세션 활동에 따라 자동 조정)
aios hud --watch --adaptive-interval
```

### 동시성 제어

HUD 는 기본적으로 세션 데이터를 순차적으로 읽습니다. 여러 세션의 경우:

```bash
# 단일 세션 HUD 에 적용 불가
# 여러 세션 뷰에는 team status 사용
```

## 워치 모드 모범 사례

### 터미널 관리

```bash
# tmux 페인에서 지속적 모니터링으로 실행
tmux new-session -a -s aios-hud 'aios hud --watch'

# 터미널 분할: agent 위, HUD 아래
tmux split-window -v
# 상단 페인: agent 실행
# 하단 페인: aios hud --watch --preset minimal
```

### 알림 통합

```bash
# quality-gate 실패 시 알림 (terminal-notifier 예시)
aios hud --watch --json | while read line; do
  echo "$line" | jq -r '.selection.qualityGate.outcome' | grep -q failed && \
    osascript -e 'display notification "Quality gate failed!" with title "AIOS HUD"'
done
```

### 로그 상관관계

```bash
# HUD 타임스탬프를 agent 로그와 상관시키기
aios hud --watch | ts '[%Y-%m-%d %H:%M:%S] HUD: '
```

## 문제 해결

### HUD 에 오래된 데이터 표시

```bash
# 워치 재시작하여 강제 새로고침
# HUD 는 성능을 위해 데이터를 캐시함

# 데이터 새로고침 간격 확인
aios hud --watch --interval-ms 500
```

### Skill Candidates 가 표시되지 않음

가능한 이유:
- 세션이 선택되지 않음 (`--session` 사용)
- 세션에 quality-gate 실패 없음
- 세션이 모든 quality 검사를 통과함
- Learn-eval 이 아직 실행되지 않음

```bash
# quality-gate 실패 확인
aios hud --json | jq '.selection.qualityGate'

# learn-eval 이 실행되었는지 확인
aios hud --json | jq '.selection.dispatchHindsight'
```

### JSON 출력 파싱 문제

```bash
# JSON 구조 검증
aios hud --json | jq .

# 특정 필드에 접근
aios hud --json | jq '.selection.sessionId'
aios hud --json | jq '.selection.dispatch.jobCount'
aios hud --json | jq '.selection.qualityGate.outcome'
```

## 예

### 빌드 파이프라인 모니터링

```bash
# 백그라운드에서 빌드 시작, HUD 로 모니터링
aios orchestrate --live &
aios hud --watch --preset minimal --fast
```

### 실패 세션 디버깅

```bash
# 실패 세션의 완전한 상세 정보 보기
aios hud --session <failed-session-id> --preset full

# 패치용 skill candidates 내보내기
aios hud --session <failed-session-id> --export-skill-candidate-patch-template
```

### 다중 세션 대시보드

```bash
# 여러 provider 를 동시에 모니터링
# 터미널 1
aios hud --provider codex --watch --preset minimal

# 터미널 2
aios hud --provider claude --watch --preset minimal

# 터미널 3 (집계 뷰)
aios team status --watch --preset minimal
```

## 관련 문서

- [Team Ops](team-ops.md) - Team Operations 개요
- [Skill Candidates](skill-candidates.md) - 패치 이해 및 적용
- [ContextDB](contextdb.md) - 세션 스토리지