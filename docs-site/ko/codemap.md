---
title: 코드 리뷰 그래프 (Codemap)
description: Tree-sitter 기반 구조적 지식 그래프로, 코딩 에이전트가 모든 의사결정 지점에서 호출자, 의존성, 테스트 커버리지, 영향 반경을 즉시 파악할 수 있게 합니다.
---

# Code Review Graph (코드맵)

> **Quick Answer:** Codemap은 저장소 구조 그래프를 로컬에 만들어 편집 전에 caller, dependent, import, 영향 흐름, 테스트 커버리지를 확인하게 합니다. 영향 범위를 좁히는 도구이며 테스트를 대신하지 않습니다.

## 먼저 답해야 할 세 가지 질문

변경 전에 무엇이 영향을 받는지, 어떤 흐름이 의존하는지, 대상에 어떤 테스트가 있는지 확인합니다. 그래프를 사용할 수 없으면 대상 검색을 대체 근거로 명시합니다.

**요약:** Codemap은 전체 코드베이스의 Tree-sitter 지식 그래프를 구축하여 모든 코딩 에이전트에 MCP 도구로 주입합니다. 에이전트는 맹목적으로 파일을 grep하는 대신, 무엇이 무엇을 호출하는지, 어떤 테스트가 무엇을 커버하는지, 변경 시 무엇이 깨질지 파악하며 정보에 기반한 결정을 내리기 시작합니다.

외부 서비스 없음. 클라우드 없음. `.code-review-graph/` 안의 로컬 SQLite 그래프뿐입니다.

## Codemap을 사용하는 이유

Codemap이 없으면 에이전트는 코드베이스를 이렇게 탐색합니다:

```
Agent reads README → grep for "auth" → reads 3 files blind → guesses impact → modifies code → reads more files to verify → may miss callers → rework
```

Codemap이 있으면:

```
Agent queries graph → knows callers/dependents/tests → calculates blast radius → makes informed change → queries graph to verify → confident submission
```

**측정된 토큰 감소:** 실제 저장소에서 4.9배–27.3배, 평균 8.2배. 더 중요한 것은 에이전트 결정의 *품질*이 달라진다는 점입니다.

## 단 한 줄로 설정

```bash
aios internal codemap install
```

끝입니다. 이 단일 명령어가 하는 일:

1. `uv` 사용 가능 여부 확인 (CRG는 `uvx`를 통해 실행 — 전역 설치 불필요)
2. 초기 그래프 구축 (대부분 프로젝트에서 약 5~15초)
3. 감지된 모든 클라이언트(opencode / codex / claude / gemini)에 CRG MCP 서버 주입
4. opencode 자동 업데이트 플러그인 설치 (opencode 감지 시)
5. 그래프 우선 의사결정 가이드로 `AGENTS.md` 업데이트

```bash
# 설치 상태 확인
aios internal codemap doctor

# 문제 해결
aios internal codemap doctor --fix

# 그래프를 처음부터 새로 구축
aios internal codemap build

# 증분 업데이트 (변경된 파일만, 2초 미만)
aios internal codemap update

# 그래프 통계 보기
aios internal codemap status

# 정리 (제거 시 .code-review-graph/ 보존)
aios internal codemap uninstall
```

## 에이전트 사용 방법

설치 후, 모든 에이전트 세션은 AGENTS.md 의사결정 체크포인트를 로드합니다:

### 의사결정 체크포인트 (필수)

| 시점 | 호출 | 이유 |
|------|------|-----|
| 작업 시작 전 | `get_minimal_context(task="...")` | 프로젝트 컨텍스트 + 권장 다음 단계 |
| 코드 수정 전 | `get_impact_radius(detail_level="minimal")` | 영향 범위 확인; 위험이 높으면 계획 재평가 |
| 코드 수정 전 | `query_graph(pattern="tests_for", target="...")` | 테스트 존재 여부 확인; 없으면 테스트 먼저 작성 |
| 코드 수정 후 | `detect_changes(detail_level="minimal")` | 실제 영향이 예상과 일치하는지 검증 |
| 제출 전 | `get_affected_flows()` + `get_suggested_questions()` | 최종 안전망 |

### 검색 규칙

- 코드 찾기: grep 대신 `semantic_search_nodes` 우선
- 관계 이해: 파일 읽기 대신 `query_graph` (callers_of/callees_of/tests_for) 우선
- 코드 리뷰: 전체 파일 읽기 대신 `detect_changes` → `get_review_context` 우선

항상 `detail_level="minimal"`을 사용하고, 부족할 때만 "standard"로 확장하세요.

## 주요 도구

Codemap은 28개의 MCP 도구 + 5개의 프롬프트를 제공합니다. 가장 영향력 있는 것들은 다음과 같습니다:

| 도구 | 기능 | 사용 시점 |
|------|-------------|-------------|
| `get_minimal_context` | 프로젝트 구조, 위험 수준, 관련 커뮤니티, 다음 단계 반환 | 매 세션 시작 시 |
| `get_impact_radius` | 변경에 영향받는 모든 요소 표시 | 코드 작성 전 |
| `detect_changes` | 실제 변경 사항의 위험 평가 분석 | 코드 수정 후 |
| `query_graph` | 특정 심볼의 호출자, 피호출자, import, 테스트 추적 | 관계 파악 시 |
| `semantic_search_nodes` | 이름이나 의미로 함수/클래스 검색 | 코드 위치 찾기 (grep 대체) |
| `get_review_context` | 코드 리뷰를 위한 집중된 소스 스니펫 | 제출 전 |
| `get_affected_flows` | 영향받는 실행 경로 파악 | 영향 분석 |

### `query_graph` 패턴

| 패턴 | 반환값 |
|---------|---------|
| `callers_of` | 대상 함수를 호출하는 함수들 |
| `callees_of` | 대상 함수가 호출하는 함수들 |
| `imports_of` | 파일/모듈의 import 목록 |
| `importers_of` | 파일/모듈을 import하는 파일들 |
| `tests_for` | 대상을 커버하는 테스트들 |
| `inheritors_of` | 대상을 상속하는 클래스들 |

## 딥 인테그레이션

Codemap은 독립형 도구가 아닙니다 — AIOS 워크플로우에 긴밀하게 통합되어 있습니다:

- **Doctor 스위트:** `aios doctor` 실행 시 `doctor:codemap` 게이트가 그래프 상태, MCP 설정, 상태 파일을 점검합니다
- **Harness:** Solo harness는 Codemap이 활성화된 워크트리에서 자동으로 그래프를 구축합니다
- **Agent Team:** 팀 디스패치 시 CRG `detect-changes` 분석을 포함하여 모든 작업자가 변경 영향을 파악합니다
- **스킬:** search-first, debug-hub, requesting-code-review 스킬에서 grep/glob보다 CRG 도구를 우선 사용합니다

## 아키텍처

```
aios internal codemap install
  ├─ uv/uvx 사용 가능 여부 확인
  ├─ uvx code-review-graph build 실행        → .code-review-graph/ (SQLite)
  ├─ 모든 클라이언트에 MCP 설정 주입        → .mcp.json / ~/.claude.json / 등
  ├─ opencode 자동 업데이트 플러그인 설치    → ~/.config/opencode/plugins/crg-plugin.ts
  ├─ 상태 파일 기록                          → .aios/codemap.json
  ├─ AGENTS.md 의사결정 가이드 업데이트
  └─ aios-codemap-ops 스킬을 클라이언트 디렉터리에 동기화
```

모든 그래프 데이터는 로컬에 유지됩니다. CRG는 stdio MCP를 통해 실행됩니다 — HTTP 서버 없음, 외부 네트워크 호출 없음 (최초 설치 시 일회성 `uvx` 패키지 해석 제외).

## 언인스톨

```bash
aios internal codemap uninstall
```

MCP 설정 항목, 상태 파일, AGENTS.md 섹션을 제거합니다. `.code-review-graph/`는 보존됩니다 — 그래프 데이터는 소중하며 절대 삭제되지 않습니다.

드라이런 미리보기:

```bash
aios internal codemap uninstall --dry-run
```

## FAQ

### Codemap은 저장소를 외부 서비스로 보내나요?

아닙니다. 그래프 데이터와 stdio MCP는 로컬에서 실행됩니다. 최초 설치의 패키지 해석은 별도의 설치 절차입니다.

### 그래프 결과만으로 안전함을 증명할 수 있나요?

아닙니다. 영향 범위를 좁힐 뿐이며 테스트, 빌드, 사람의 검토가 완료 근거가 됩니다.

## 공식 문서

[아키텍처](architecture.md), [워크플로 정책](workflow-policy.md), [문제 해결](troubleshooting.md)을 함께 읽어 보세요.
