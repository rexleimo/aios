---
title: Skill Candidates 가이드
description: 실패한 세션에서 스킬 개선 패치를 발견, 검토, 적용하는 방법.
---

# Skill Candidates 가이드

**Skill Candidates** 는 실패한 에이전트 세션에서 자동으로 추출되는 개선 제안입니다. 실패에서 학습하여 AI 어시스턴트의 능력을 지속적으로 개선할 수 있습니다.

## Skill Candidates란?

에이전트 세션이 quality-gate 체크에 실패하면 AIOS는 자동으로:
1. 실패 패턴을 분석
2. 근본 원인을 식별（예：오류 처리 누락, 엣지 케이스）
3. 스킬 패치 초안을 생성
4. 리뷰를 위해 **스킬 후보**로 제시

### 흐름 예

```
세션 실패 → Learn-eval이 분석 → 스킬 후보 생성 → 리뷰 → 패치 적용 → 스킬 개선
```

## Skill Candidate 구조

각 스킬 후보에는 다음이 포함됩니다:

| 필드 | 설명 |
|------|------|
| `skillId` | 패치 대상 스킬 |
| `scope` | 기능 영역（예：「authentication」「file-ops」） |
| `failureClass` |遭遇した失敗タイプ |
| `lessonKind` | 개선 유형（예：「error-handling」「edge-case」） |
| `lessonCount` | 배운 교훈의 수 |
| `patchHint` | 제안된 코드/텍스트 변경 |
| `sourceDraftTargetId` | 원본 draft ID |
| `reviewStatus` | Pending/Approved/Rejected |

## Skill Candidates 보기

### HUD에서

```bash
# 세션 상태와 인라인으로 후보 표시
aios hud --show-skill-candidates

# 상세 뷰（후보만, HUD 없음）
aios hud --show-skill-candidates --skill-candidate-view detail

# 결과 제한
aios hud --show-skill-candidates --skill-candidate-limit 5
```

### Team Status에서

```bash
# 모든 최근 후보 표시
aios team status --show-skill-candidates

# 세션으로 필터
aios team status --session <session-id> --show-skill-candidates

# 아티팩트 파일로 내보내기
aios team status --export-skill-candidate-patch-template
```

### list 명령

```bash
# 현재 세션의 후보 나열
aios team skill-candidates list

# 특정 세션 나열
aios team skill-candidates list --session-id <session-id>

# JSON 출력
aios team skill-candidates list --json
```

### Draft ID로 필터

```bash
# 특정 draft의 후보만 표시
aios team skill-candidates list --draft-id <draft-id>

# 필터된 후보 내보내기
aios team skill-candidates export --draft-id <draft-id>
```

## 패치 내보내기

### 아티팩트 파일로 내보내기

```bash
# 기본 위치（세션 아티팩트 폴더）
aios team skill-candidates export

# 사용자 지정 출력 경로
aios team skill-candidates export --output-path ./patches/my-fix.md

# draft 필터 포함
aios team skill-candidates export --draft-id <draft-id> --output-path ./draft-patch.md
```

### 내보내기 형식

내보내기된 패치 템플릿에는 다음이 포함됩니다:
- 후보 메타데이터（스킬 ID, scope, failure class）
- 교훈 설명
- 제안된 패치 내용
- 적용 지침

## 패치 적용

### 리뷰 프로세스

**패치를 적용하기 전에:**
1. failure class 읽기 — 무엇이 잘못되었는지 이해
2. 교훈 리뷰 — 무엇을 배웠는지
3. patch hint 검사 — 제안된 변경
4. 패치가 스킬 버전에 적용 가능한지 확인

### apply 명령

```bash
# 특정 후보 적용
aios skill-candidate apply <candidate-id>

# 리뷰 모드로 적용
aios skill-candidate apply <candidate-id> --review

# dry-run（변경 미리보기）
aios skill-candidate apply <candidate-id> --dry-run
```

### 일괄 적용

```bash
# 스킬의 모든 보류 중 후보 적용
aios skill-candidate apply-all --skill <skill-id>

# 승인 포함 적용
aios skill-candidate apply-all --skill <skill-id> --approve
```

## Skill Candidate 워크플로

### 단계 1: 후보 발견

```bash
# 실패한 세션 후 후보 확인
aios hud --session <failed-session-id> --show-skill-candidates
```

### 단계 2: 후보 리뷰

```bash
# 신중한 리뷰를 위한 상세 뷰
aios hud --session <session-id> --show-skill-candidates --skill-candidate-view detail

# 오프라인 리뷰를 위해 내보내기
aios team skill-candidates export --session-id <session-id>
```

### 단계 3: 패치를ローカル에서 테스트

```bash
# 테스트 브랜치 생성（git 사용 시）
git checkout -b skill-patch-<skill-id>

# 수동으로 패치 적용 또는 apply 명령 사용
aios skill-candidate apply <candidate-id>

# 테스트를 실행하여 확인
npm test
```

### 단계 4: 승인 또는 거부

```bash
# 패치가 작동하면 — 승인
aios skill-candidate review <candidate-id> --approve

# 패치에 문제가 있으면 — 피드백으로 거부
aios skill-candidate review <candidate-id> --reject --comment "엣지 케이스 X를 처리하지 않음"
```

## 모범 사례

### 우선 순위

**이 순서로 후보 적용:**
1. 고빈도 실패（같은 failure class가 여러 번 나타남）
2. 중요한 경로 스킬（인증, 보안, 데이터 무결성）
3. 쉬운 성과（한 줄 수정, 명확한 개선）

### 리뷰 가이드라인

- **검토 없이 자동 적용 금지** — 각 패치는 인간 검증이 필요
- **격리로 테스트** — 패치가 기존 기능을 깨뜨리지 않는지 확인
- **충돌 확인** — 여러 패치가 동일한 코드를 수정할 수 있음
- **결정 문서화** — 승인/거부 이유 기록

### 과적합 피하기

- 일회성 엣지 케이스의 패치는 적용하지 않음
- 여러 세션에서 패턴 찾기
- 특정 해결책보다 일반적인 솔루션 선호

## Learn-Eval 통합

Learn-eval은 스킬 후보를生成하는 시스템입니다:

```bash
# 최근 세션을 분석하기 위해 learn-eval 실행
aios learn-eval --limit 10

# 스킬 후보를含む draft 권장 사항 표시
```

### Learn-Eval 출력

```
Dispatch Hindsight Analysis:
- 분석된 쌍: 15
- 반복된 블록 턴: 3
- 회귀: 1
- 주요 failure class: token-validation-edge-case

Draft 권장 사항:
[fix] skill-candidate-001
    스킬: authentication-handler
    Scope: token-validation
    Failure: edge-case-expired-token
    Lessons: 2
    Patch: 만료된 토큰에 재시도 로직 추가...
```

## Quality-Gate 연결

스킬 후보는 quality-gate가 실패할 때生成됩니다:

### Quality-Gate 결과

| 결과 | 설명 |
|------|------|
| `ok` | 세션 통과 — 후보 생성 안됨 |
| `failed` | 세션 실패 — 후보가生成되었을 가능성 |
| `retry-needed` | 재시도 필요 — 후보가生成될 수 있음 |

### 실패 카테고리

 candidate를トリガーする 일반적인 quality-gate 실패 카테고리:
- `clarity-needs-input` — 에이전트가 더 많은 사용자 입력 필요
- `sample.latency-watch` — 성능 문제
- `dispatch.blocked` — 작업 실행 차단됨
- `evidence.missing` — 검증 증거 누락

## 문제 해결

### 실패한 세션 후 후보 없음

가능한 이유:
- learn-eval이 아직 실행되지 않음
- 실패가 스킬 개선 기회로 분류되지 않음
- 세션이 quality-gate 체크 임계값을 통과하지 못함

```bash
# 수동으로 learn-eval 트리거
aios learn-eval --session <session-id>

# quality-gate 상태 확인
aios hud --json | jq '.selection.qualityGate'
```

### 후보 패치가 적용되지 않음

이유:
- 대상 스킬이 후보 생성 후 변경됨
- 패치 형식이 현재 스킬 구조와 호환되지 않음
- 충돌하는 수정

```bash
# 후보 소스 버전 확인
aios team skill-candidates list --json | jq '.[0].sourceArtifactPath'

# 현재 스킬과 비교
diff <(cat <source-artifact>) <(cat <current-skill-file>)
```

### 충돌하는 여러 후보

여러 후보가 동일한 스킬을 수정할 때:
1. 먼저 모든 후보 검토
2. 우선순위 순서로 적용（빈도, 심각도）
3. 각 적용 후 테스트
4. 충돌하는 중복 거부

```bash
# 스킬의 모든 후보 나열
aios team skill-candidates list --json | \
  jq '[.[] | select(.skillId == "target-skill-id")]'
```

## 고급 사용법

### 프로그래밍 방식 액세스

```bash
# 후보를 JSON으로 가져오기
aios team skill-candidates list --json > candidates.json

# failure class로 필터
cat candidates.json | \
  jq '[.[] | select(.failureClass == "token-validation-edge-case")]'

# 스킬별로 카운트
cat candidates.json | \
  jq 'group_by(.skillId) | map({skill: .[0].skillId, count: length})'
```

### 사용자 지정 분석

```bash
# 시간에 따른 실패 패턴 분석
aios team history --quality-failed-only --json | \
  jq '[.[] | .skillCandidate] | group_by(.skillId)'

# 가장 일반적인 failure class 찾기
aios team history --json | \
  jq '[.[] | .skillCandidate.failureClass] | unique'
```

## 관련 문서

- [Team Ops](team-ops.md) — Team Operations 개요
- [HUD 가이드](hud-guide.md) — HUD로 세션 모니터링
- [ContextDB](contextdb.md) — 세션 스토리지 및 아티팩트