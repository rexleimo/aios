---
title: "Browser MCP 약한 모델 개선: Semantic Snapshot + Text Click"
description: "이번 이터레이션은 압축된 페이지 이해 도구, 텍스트 우선 클릭 액션, 실 CDP 호환성 보강을 통해 약한 모델의 브라우저 작업 성공률을 높였습니다. 글에서는 변경 전후 비교, 여전히 실패하는 경계 사례, 전환을 판단할 지표를 제시합니다."
date: 2026-04-18
tags: [Browser MCP, Weak Models, Agent Runtime, AIOS, Reliability]
---

# Browser MCP 약한 모델 개선: Semantic Snapshot + Text Click

이번 이터레이션의 목표는 명확합니다. **상대적으로 약한 계획/코딩 모델도 브라우저 작업을 더 안정적으로 완료하게 만드는 것**입니다. 동시에 강한 모델 경로는 저하시키지 않습니다.

대상은 복잡한 페이지, 엄격한 locator 규칙, 긴 액션 체인에서 자주 실패하는 저성능 플래너 모델(예: 일부 GLM/minmax/Ollama 조합)입니다.

## 문제 요약

업데이트 전 약한 모델은 주로 세 지점에서 실패했습니다.

- 페이지 텍스트/HTML 노이즈가 커서 다음 액션 선택이 불안정
- 저수준 locator 생성과 유일성 해소에 취약
- 단위 테스트는 통과해도 실제 CDP 런타임의 `evaluate` 차이로 실패

## 이번 릴리스 내용

### 1) 네이티브 프롬프트의 브라우저 운영 패턴 강화

기본 SOP를 다음으로 강화했습니다.

- `read -> act -> verify` 짧은 루프
- 블라인드 다중 액션 체인 금지
- 밀집/동적 페이지에서 `semantic_snapshot` 선행
- 라벨이 명확하면 `click_text` 우선

### 2) 약한 모델 친화 MCP 프리미티브 추가

browser-use 런타임에 고수준 도구를 추가했습니다.

- `page.semantic_snapshot`
  - `title`, `url`, headings, actions, truncation 상태 제공
  - 원시 HTML 대비 의사결정 엔트로피 감소
- `page.click_text`
  - 텍스트 우선 클릭 (`exact`, `nth`, `timeout_ms`)
  - 취약한 selector 수동 구성 부담 감소

### 3) 실 CDP 스모크 기반 런타임 하드닝

초기 실브라우저 스모크에서 드러난 이슈를 보강했습니다.

- locator evaluate 계약 수정 (`arguments[0]` -> 명시 인자)
- semantic snapshot 문자열 객체 결과 호환
- `page.goto` URL 읽기 fallback (`get_url` -> `location.href`)
- text click 후보 수렴 강화 (인터랙티브 요소 우선 + selector 중복 제거)

## 검증

### 자동화 테스트

- `mcp-browser-use`에서 `pytest -q`: **15 passed**

### 실 CDP 스모크(수정 후)

플로우:

1. `browser.connect_cdp`
2. `page.goto("https://example.com")`
3. `page.wait(text="Example Domain")`
4. `page.semantic_snapshot(max_items=8)`
5. `page.click_text("Learn more")`
6. `browser.close`

결과: 라이브 런타임에서 전 단계 성공.

## 왜 약한 모델에 효과적인가

핵심은 **의사결정 복잡도 축소**입니다.

- 고노이즈 DOM 대신 압축된 의미 입력 제공
- selector 합성 대신 텍스트 중심 액션 사용
- 읽기/검증 및 모호성 처리 강화로 실패 연쇄 완화

강한 모델은 기존 능력을 그대로 유지합니다.

## 다음 이터레이션

- `NOT_UNIQUE` 에러의 실행 가능한 소거 힌트 강화
- 모델 티어 프롬프트 프리셋(weak/medium/strong)
- 약한 모델 브라우저 회귀 벤치마크 구축

