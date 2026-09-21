---
title: "v6.0.1: 엔지니어링 표준을 rex-harness로 — 기준의 거주지를 소비자와 함께"
description: "v6.0.1은 엔지니어링 표준 스킬을 호스트에서 rex-harness 서브모듈로 옮겨 rex-engineering-standards로 개명했다(rex-harness 0.7.0): 능력 체인의 공통 품질 기준이 능력 체인과 함께 출하되고, 독립 rex-harness 소비자도它을 놓치지 않는다."
date: 2026-09-21
tags: ["AIOS", "엔지니어링-표준", "rex-harness", "아키텍처", "릴리스", "v6.0.1"]
---

# v6.0.1: 엔지니어링 표준을 rex-harness로 — 기준의 거주지를 소비자와 함께

> **Quick Answer:** v6.0.0은 엔지니어링 표준을 호스트 스킬 `aios-engineering-standards`로 출하했다. 이것은 의존 방향을 거꾸로 놓았다: 기준을 소비하는 네 Provider(`rex-implement`, `rex-refactor-hardening`, `rex-code-review`, `rex-design`)는 모두 `rex-harness` 서브모듈에 있고, rex-harness 자체는 npm에 공개된 독립 제어 평면이다. v6.0.1이 한 번의 이동으로 바로잡는다: 스킬은 `rex-engineering-standards`로 `rex-harness` 0.7.0에서 출하되고 투사 이력에 digest를 등록했다. 내용과 Definition of Done는 불변. router와 `pre-edit-safety-gate`는 새 이름을 참조한다.

## 왜 옮기는가

최초 배치가 틀렸음을 보여주는 두 가지 사실:

1. **소비자가 서브모듈에 있다.** 모든 코드 생산 Provider는 실행 전에 이 기준을 읽는다. 독자가 모두 한 저장소에 있고 기준自身은 다른 저장소에 있는 것은 역의존 — 엔진이 호스트 카탈로그를 참조하는 셈이다.
2. **rex-harness는 독립적이다.** `@rexleimo/rex-harness`는 npm에 공개되고 `files`에 `skill-sources/`를 포함하며, 스스로를 독립 증거 기반 워크플로 제어 평면이라 설명한다. AIOS 호스트 없이 rex만 쓰는 소비자는 존재하지도 않는 스킬을 참조하는 네 Provider를 마주하게 된다 — 품질 기준은 AIOS 밖에서 조용히 사라진다.

기준은 앞으로도 능력 체인(증거 계약, Provider 단계, 문)과 함께 진화한다. 같은 저장소 = 하나의 리포지토리, 하나의 변경 로그, 변경마다 하나의 버전 이야기.

## 바뀐 것

- 스킬은 `rex-harness/skill-sources/rex-engineering-standards/`에서 출하(rex-harness 0.7.0). `src/clients/projection-history.json`에 digest를 등록해 클라이언트 투사가 매끄럽게 갱신된다.
- 호스트 스킬 카탈로그는 27으로 돌아가고 rex 투사는 14로 늘었다.
- `aios-workflow-router`와 `pre-edit-safety-gate`가 `rex-engineering-standards`를 로드하고 참조 — router가 `rex-*` Provider를 이름으로 참조하는 것과 같은 패턴.
- 기준 본체 — 경계, 깊은 모듈, 코드 기준, 테스트 기준, 도구 체인 기준, ADD, Definition of Done — 은 한 글자도 바뀌지 않았다.

## 바뀌지 않은 것

v6.0.0에서 출하한 사용자 대면 동작은 모두 유지: router는 어떤 코드 생산 Provider보다 먼저 기준을 로드하고, 완료는 Provider의 증거 계약**과** Definition of Done **둘 다**를 요구하며, "품질 건너뛰기" 경로는 여전히 없다. 공개 [엔지니어링 표준 페이지](/ko/engineering-standards/)와 참고 자료는 스킬 이름 외 그대로.

## 업그레이드

`aios update`(또는 `aios init --all`)를 실행해 스킬을 재투사한다. 새 `rex-engineering-standards`가 옛 호스트 투사를 자동으로 대체한다. 설정도, 우회도 필요 없다.

## 함께 보기

- [v6.0.0: 엔지니어링 표준 내장 — AIOS는 코드를 생성할 뿐만 아니라 소프트웨어를 구축한다](/blog/ko/2026-09-v600-engineering-standards/)
- [엔지니어링 표준 문서](/ko/engineering-standards/)
