---
title: "Codemap: AI 에이전트에게 코드베이스 지도를"
description: "단일 명령어로 Tree-sitter 지식 그래프를 모든 AI 코딩 에이전트에 주입. opencode, codex, claude, gemini에서 에이전트가 맹목적인 grep을 멈추고 구조 기반 의사결정을 시작합니다."
date: 2026-05-21
tags: ["codemap", "code-review-graph", "CRG", "knowledge-graph", "AIOS"]
---

# Codemap: AI 에이전트에게 코드베이스 지도를

AI 코딩 에이전트는 코드를 잘 작성합니다. 하지만 코드가 어떻게 *연결*되어 있는지 이해하는 데는 서툽니다. 파일명을 grep하고, 몇 개 파일을 읽고, 변경의 영향을 추측합니다. 여러분이 지불하는 토큰의 절반은 맹목적인 탐색에 소비됩니다.

**Codemap이 이를 바꿉니다.** 전체 코드베이스의 Tree-sitter 지식 그래프를 구축하고 — 모든 함수, 모든 import, 모든 호출 관계 — 이를 MCP 도구로 에이전트에게 제공합니다. 단 한 줄의 명령어로. 모든 클라이언트에서.

## 문제: 에이전트는 눈이 멀었다

에이전트가 "인증 타임아웃 버그를 수정하라"와 같은 작업을 받았을 때, Codemap 없이는 이렇게 됩니다:

```
Agent reads README
  → grep for "auth" → 47 matches across 18 files
  → reads 5 files (maybe the wrong ones)
  → guesses which function to modify
  → writes code
  → reads more files to verify (still guessing)
  → submits — hopes nothing breaks
```

모든 "파일 읽기"는 토큰을 소비합니다. 모든 "영향 추측"은 위험을 더합니다. 이것이 에이전트가 때때로 존재조차 몰랐던 것을 깨뜨리는 이유입니다.

## 해결책: 코드를 위한 지식 그래프

Codemap이 설치되면, 동일한 작업이 이렇게 바뀝니다:

```
Agent calls get_minimal_context(task="fix the auth timeout bug")
  → Project structure, risk assessment, relevant modules — instantly
Agent calls query_graph(pattern="callers_of", target="authenticate")
  → 12 callers — can't just change the signature, need a wrapper
Agent calls get_impact_radius()
  → 3 files affected, 2 tests covering them — manageable
Agent modifies code
Agent calls detect_changes()
  → Confirms actual impact matches expected — nothing missed
Agent submits with confidence
```

**맹목적인 탐색 없음. 추측 없음. 모든 결정은 구조에 기반합니다.**

## 한 줄 명령어, 모든 클라이언트

```bash
aios internal codemap install
```

이 단일 명령어가 하는 일:

1. 사전 요구사항 확인 (`uv`/`uvx`)
2. 초기 그래프 구축 (5~15초)
3. opencode, codex, claude, gemini에 CRG MCP 설정 주입
4. opencode 자동 업데이트 플러그인 설치
5. 의사결정 포인트 가이드로 AGENTS.md 업데이트

끝입니다. 이제부터 모든 에이전트 세션은 그래프 우선 코드 탐색을 사용합니다.

```bash
# 상태 확인
aios internal codemap doctor

# 그래프를 처음부터 새로 구축
aios internal codemap build

# 빠른 증분 업데이트 (2초 미만)
aios internal codemap update

# 그래프 내용 확인
aios internal codemap status
```

## 에이전트가 볼 수 있는 것

Codemap은 28개의 MCP 도구를 제공합니다. 가장 중요한 것들입니다:

| 도구 | 대체하는 것 |
|------|-----------------|
| `semantic_search_nodes` | grep — 이름과 *의미*로 코드 검색 |
| `query_graph` | 호출 체인을 이해하기 위한 파일 읽기 |
| `get_impact_radius` | 무엇이 깨질지 추측하기 |
| `detect_changes` | 수동 diff 리뷰 |
| `get_affected_flows` | 어떤 기능이 영향받는지 추측하기 |
| `get_minimal_context` | README 읽기 + ls + 탐색 |

## 실제 효과

실제 저장소에서 Codemap은 grep 기반 탐색 대비 4.9배~27.3배의 토큰 감소를 달성했으며, 평균 8.2배입니다. 하지만 진정한 가치는 단순한 비용 절감이 아닙니다 — 에이전트 행동의 변화입니다.

Codemap 없이는 에이전트가 토큰의 60~80%를 코드베이스 *이해*에 사용합니다. Codemap이 있으면 그 비율이 극적으로 감소합니다. 에이전트는 토큰을 *작업 수행*에 사용합니다 — 그것이 바로 여러분이 비용을 지불하는 대상입니다.

## 딥 인테그레이션

Codemap은 독립형 플러그인이 아닙니다. 모든 AIOS 워크플로우에 통합되어 있습니다:

- **`aios doctor`** — 다른 항목과 함께 Codemap 상태를 점검합니다
- **Solo Harness** — 밤새 실행되는 작업을 위해 워크트리 내에 그래프를 자동 구축합니다
- **Agent Team** — 디스패치 시 변경 영향 분석을 포함하여 모든 작업자가 영향 범위를 파악합니다
- **스킬** — search-first, debug-hub, code-review 스킬에서 grep보다 CRG 도구를 우선 사용합니다

## 사용해 보기

```bash
# 설치 (단 한 줄)
aios internal codemap install

# 확인
aios internal codemap doctor

# 이제 에이전트가 손전등 대신 지도를 가지고 탐색합니다
```

[전체 문서 →](/ko/codemap/){ .md-button }

## 관련 문서

- [Codemap](https://cli.rexai.top/ko/codemap/)
- [Quick Start](https://cli.rexai.top/ko/getting-started/) — 30초 안에 AIOS 설치
- [Workflow Policy](https://cli.rexai.top/ko/workflow-policy/) — direct / guarded / planned 라우트
