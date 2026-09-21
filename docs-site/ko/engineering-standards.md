---
title: 엔지니어링 표준 — AIOS는 코드를 생성할 뿐만 아니라 소프트웨어를 구축한다
description: "AIOS 6.0은 고전 소프트웨어 공학 표준을 워크플로에 내장한다: Clean Architecture 경계, 깊은 모듈, Clean Code 규칙, 테스트와 도구 체인 기준 — 생성되는 모든 변경에 대한 Definition of Done과 참고 서적 목록 및 무료 자료."
---

# 엔지니어링 표준

## Quick Answer (한 줄 답변)

전통적인 코딩 에이전트는 **돌아가는** 코드를 생성한다. AIOS가 생성하는 것은 **공학화된** 코드다. v6.0.0부터 워크플로의 모든 코드 생산 단계는 같은 품질 기준 — `aios-engineering-standards` 스킬 — 을 먼저 로드한다: 『Clean Architecture』의 아키텍처 경계, 『A Philosophy of Software Design』의 깊은 모듈, 『Clean Code』의 명명과 함수 규칙, 『The Pragmatic Programmer』의 DRY와 직교성. 그리고 Definition of Done를 통과하기 전까지 완료로 치지 않는다. 이 기준은 기존 증거 기반 능력 체인 위를 달리며, 우회할 수 있는 추가 문이 아니다. 이 페이지가 공개 기준이며 참고 자료(4단계 능력 모델, 9권 서적 목록, 무료 합법 자료)를 함께 싣는다.

## 왜: 생성 코드의 품질 격차

생성 코드가 리뷰에서 떨어지는 이유는 예측 가능하고, "알고리즘이 틀렸다"는 경우는 거의 없다:

- **경계 위반** — 비즈니스 로직이 프레임워크, 저장소, UI 세부에 직접 손을 뻗어, 한 가지 요구 변경이 세 계층을 동시에 깨뜨린다.
- **얕은 추상** — 전달만 하는 wrapper의 적층, 결코 오지 않을 미래를 위해 예약한 매개변수: 정보 은닉 제로인 순수한 복잡도.
- **명명과 형태 표류** — 한 함수가 네 가지 일을 하고, 거짓말하는 이름, 열두 곳에서 판단되는 오류 코드.
- **안전망 부재** — 테스트가 없어 모든 리팩터링은 기도이고 모든 리뷰는 영에서 시작한다.
- **도구 체인 부재** — lint도, pre-commit도, CI도 없다: 기준은 누군가의 기억 속에 있지 파이프라인 속에 있지 않다.

이것들은 모델 크기 문제가 아니다. **기준의 문제**다. 그리고 기준은 아무도 열지 않는 위키 페이지가 아니라 프레임워크에 속한다.

## AIOS가 이미 가지고 있고 전통적 에이전트에는 없는 것

AIOS는 로컬 우선 오케스트레이션 제어 평면이며, 코드 생성기를 감싼 채팅 껍데기가 아니다. 소프트웨어 공학 능력은 이미 여기서 구조적인 것 — v6.0.0이 품질의 절반을 명시적인 1급 시민으로 만들었다:

| 전통적인 코딩 에이전트 | AIOS |
| --- | --- |
| diff를 생성하고 기도한다 | 각 단계가 타입화된 증거(`implementation-diff-recorded`, `focused-tests-pass`, receipt)를 낸 뒤 다음 단계가 풀린다 |
| "완료"는 모델이 그렇게 말했다는 뜻 | 완료 = Definition of Done 체크리스트와 증거 계약을 모두 통과 |
| 기준은 아무도 로드하지 않는 스타일 가이드 속에 | 기준은 스킬이며, router가 코드 생산 Provider 실행 **전에** 로드한다 |
| 리뷰는 감각 | 리뷰는 fixed-point diff에 Fowler 악취 기준선 + 명세 축 + 기준 축으로 돈다 |
| 품질은 마지막 광택 | 품질 문이 계획 → 구현 → 경화 → 리뷰 전 chain에 내장되어 있다 |

한마디로: 전통적 에이전트는 코드를 *쓰는* 것을 돕는다. AIOS는 공학 루프를 돌린다 — 요구 정렬, 거부된 옵션을 기록하는 설계 결정, 행위 보존의 경화, 증거 기반 리뷰 — 그리고 이제 쓰이는 모든 것의 공통 품질 기준.

## 품질 기준

### 1. 아키텍처 경계 (Clean Architecture)

- **의존 규칙**: 소스 의존은 안쪽으로만 향한다. 도메인 로직은 프레임워크, 드라이버, UI 세부를 import하지 않는다. 바깥층은 도메인이 정의한 인터페이스를 통해 의존한다.
- **高응집·低결합**: 함께 변하는 것을 한 모듈에 모은다. 한 모듈은 한 가지 이유로만 변한다.
- **최소 인터페이스**: 모듈은 세부를 가장 작고 정직한 인터페이스 뒤에 숨긴다. 인터페이스에 프레임워크 타입, 저장 구조, 서드파티 DTO가 보이면 경계 누출.
- **명명이 곧 경계 시험**: 모듈이나 경계를 정직하게 명명할 수 없다면 설계가 다듬어지지 않은 것이다 — 안개 속을 쓰며 나아가지 말고 설계 옵션으로 돌아간다.

### 2. 깊은 모듈 (A Philosophy of Software Design)

- 복잡도 = 이해 비용 + 변경 비용. 새로운 추상은 모두 이 합으로 잰다.
- **깊은 모듈 우선**: 작은 인터페이스와 크게 숨겨진 구현이, 얇은 전달의 적층보다 낫다.
- **얕은 모듈 경계**: 구현과 같은 크기의 인터페이스, 정보 은닉을 더하지 않는 wrapper, 투기적 미래를 위해 예약한 매개변수 — 지운다.
- **전술 프로그래밍보다 전략 프로그래밍**: 모든 변경이 코드베이스를 조금 더 좋게 한다(보이스카우트 규칙). 빠른 납품과 구조 개선은 양자택일이 아니다.
- **주석은 설계 도구**: 명확한 주석을 쓸 수 없다면 경계나 책임이 흐릿하다는 뜻 — 먼저 설계를 고친다. 주석은 "왜"를 설명하지 "무엇을" 해설하지 않는다.

### 3. 코드 기준 (Clean Code / The Pragmatic Programmer)

- 이름은 의도를 표현한다. 이유를 붙이기 전에改名한다. 한 함수는 한 추상 수준에서 한 가지만 한다.
- 오류는 맥락을 담은 예외나 오류 타입으로 표현한다. 호출자가 매 호출점에서 디코딩해야 하는 반환 코드는 쓰지 않는다.
- DRY: 한 지식에는 권위 있는 표현이 하나뿐이다. 비슷해 보이는 두 블록은 그것이 **같은** 지식일 때만 합친다 — 우연한 유사는 잘못된 결합보다 싸다.
- 직교성: 한 요구 변경은 한 곳만 만진다. 머릿속 diff가 다섯 파일이라면 그것은 구조 신호이지 불운이 아니다.

### 4. 테스트 기준

- 핵심 로직은 자동 커버리지를 가진다(단위 + 필요한 경우 통합). 리팩터링과 경화는 녹색 테스트 뒤에서만 한다.
- 빌드를 통과시키려고 단언을 약화하거나, 사례를 지우거나, 스위트를 건너뛰지 않는다. 테스트는 "행위가 변하지 않았다"는 증거다 — 테스트 없는 리팩터링은 기도다.

### 5. 도구 체인 기준 (기준의 자동화)

> 기계가 검사할 수 있는 규칙은 사람 리뷰 기억에 의존하지 않는다. — 참고 자료의 실행 조언: lint, pre-commit 훅, CI를 내장한 즉시 쓸 수 있는 템플릿을 제공해 공학 기준을 자동화 파이프라인으로 만든다.

새 프로젝트·패키지·모듈에는 다음이 필수:

- [ ] 저장소 기존 기준과 일치한 lint / 포맷 설정
- [ ] pre-commit 훅(lint + 빠른 테스트)
- [ ] CI 설정(lint + 정적 검사 + 전체 테스트)
- [ ] 테스트 프레임워크와 실행 가능한 핵심 경로 테스트 최소 하나
- [ ] 구조화·단계별·검색 가능한 로깅 — 맨 print가 아닌

기존 저장소는 먼저 자기 자신의 기록된 기준을 따른다. 격차는 납품 노트에 기록되며, 조용히 무시하거나 사적인 평행 규범을 강요하지 않는다.

### 6. 문서 기준

- 중요한 변경 — 경계, 인터페이스, 데이터 구조, 운영 방식에 닿는 것 — 은 짧은 ADD를 기록한다: 결정, 적용 조건, 트레이드오프, 거부된 옵션. 설계 스킬의 결정 기록과 같은 형태이며 실행 계획으로 부풀리지 않는다.
- API·공개 인터페이스 계약은 변경과 함께 갱신된다. "지식이 누군가의 머릿속에만 있다"는 것은 미완으로 본다.

## Definition of Done

"완료"라고 하려면 모든 행이 필요하다. 어느 하나가 "아니오"면 계속한다:

| # | 항목 | 통과 기준 |
| --- | --- | --- |
| 1 | 행위가 인수 기준을 만족 | 구현 자체 점검 표가 모두 "예" |
| 2 | 경계가 명확 | 변경이 올바른 모듈/층에 있음. 의존 방향 무손상. 인터페이스 누출 없음 |
| 3 | 모듈이 충분히 깊음 | 새 추상이 실제 세부를 숨김. 얇은 전달도, 예약 매개변수도 없음 |
| 4 | 명명과 함수 | 이름이 실상과 일치. 단일 추상 수준. 오류 처리 통일 |
| 5 | 테스트 커버리지 | 핵심 경로 자동화. 단언 약화 없음 |
| 6 | 도구 체인 | lint / pre-commit / CI / 로깅이 제5절 기준 충족 |
| 7 | 문서 | 중요한 변경에 ADD. 인터페이스 계약 갱신 완료 |
| 8 | 증거 | 증거 봉투가 실제 영수증(테스트, diff, 시나리오)을 인용 |

## 워크플로를 타는 방식

```text
router (aios-workflow-router)
  └─ 코드 생산 Provider 선택 (rex-implement / rex-refactor-hardening / rex-code-review / rex-design)
       └─ aios-engineering-standards를 먼저 로드  ← 공통 품질 기준
            └─ Provider가 자신의 증거 기반 단계를 실행
                 └─ 완료 = Provider의 증거 계약 그리고 이 Definition of Done를 모두 통과
```

`pre-edit-safety-gate`는 또한 첫 편집 전에 선택한 변경 형태(로컬 변경 / 확장·재사용 / 리팩터 추출)를 이 기준으로 대조한다. 어떤 단계도 opt out할 수 없다 — "품질 건너뛰기" 경로는 없다. 기준은 정중함이 아니라 router에 의해 로드되기 때문이다.

## 참고 자료

### 공학 능력 4단계 모델

참고 대화는 공학 성장을 4단계로 설명하며, AIOS는 그 모두에 대응한다:

1. **단병 능력 다지기 — 코드 품질과 리팩터링**: 언어范式와 lint 규범 준수, KISS / DRY, 보이스카우트 규칙, 리팩터링에 보험을 거는 단위·통합 테스트.
2. **시스템 사고 진화 — 설계 패턴과 모듈 분할**: SOLID, 고응집 저결합, 최소 인터펆페이스, 대내 세부 캡슐화.
3. **공학 자동화 구축 — CI/CD와 품질 거버넌스**: Conventional Commits, Gitflow / Feature Branch, 매 커밋이나 PR에서 lint·정적 검사·테스트를 자동 실행. 구조화 로그와 메트릭 모니터링.
4. **복잡도 장악 — 프로젝트 관리와 납품 통제**: 큰 요구를 독립 납품 가능한 MVP로 분해하고 리스크 버퍼를 확보. ADD, API 문서, 요구 추적 매트릭스로 지식이 누군가의 머릿속에만 있는 상태를 피한다.

### 참고 서적 목록

| 서적 | 핵심 가치 |
| --- | --- |
| 『Clean Code』— Robert C. Martin | "나쁜 코드"와의 작별 가이드: 명명, 함수, 예외 처리, 클래스 조직 |
| 『Refactoring』(2판) — Martin Fowler | 외적 행위를 바꾸지 않고 내부 구조를 작은 단계로 개선, 악취 카탈로그가 구동 |
| 『The Pragmatic Programmer』(2판) — Hunt / Thomas | 개인 수련 가이드: 직업 태도, 공학 습관, 도구 선택, 문제 해결 사고 |
| 『Design Patterns』— GoF | 23가지 설계 패턴의 원천(추상적으로 느껴지면 먼저 『Head First Design Patterns』) |
| 『Clean Architecture』— Robert C. Martin | 아키텍처의 본질: 경계 긋기, 의존 격리, 비즈니스 로직과 DB/UI 프레임워크 분리 |
| 『Designing Data-Intensive Applications』— Martin Kleppmann | 분산 시스템과 백엔드 필독서: 데이터 저장, 일관성, 확장성, 내결함성 |
| 『A Philosophy of Software Design』— John Ousterhout | 스탠퍼드 교수의 극간 아키텍처 책: 복잡도 억제, 깊은 모듈, 전술적 vs 전략적 프로그래밍 |
| 『The Mythical Man-Month』— Frederick P. Brooks Jr. | 인월신화, 개념 무결성, 본질적 복잡도 vs 우발적 복잡도 |
| 『Making Things Happen』— Scott Berkun | 전 Microsoft 수석 PM의 실용 가이드: 요구 정의, 기술 결정, 리스크 평가, 팀 간 소통 |

### 무료이고 합법적인 자료

- **『A Philosophy of Software Design』** — GitHub에서 "A Philosophy of Software Design 中文" 검색. 여러 커뮤니티가 관리하는 양질의 중국어 번역과 심층 해설 노트
- **『Clean Architecture』** — Uncle Bob 체계에 기반한 오픈 문서와 실천 가이드(예: GitHub의 `clean-architecture-go`, `clean-architecture-python` 예제 저장소). 코드와 함께 보면 더 직관적
- **『System Design Primer』** — GitHub `donnemartin/system-design-primer`(250k+ Star, 완전 중국어 번역 내장)
- **『Architecture of Open Source Applications』** — 공식 사이트 aosabook.org, 완전 무료 온라인
- **『Pro Git』** — git-scm.com/book/zh/v2, 공식 무료 중국어판(온라인 + EPUB/PDF)
- **『Software Engineering at Google』** — abseil.io/resources/swe-book 무료 영문 온라인판, GitHub에 커뮤니티 중국어 번역
- **Refactoring.Guru** — refactoring.guru, 23가지 설계 패턴과 리팩터링 기법을 도해로 설명, 무료 중국어 콘텐츠 제공
- **Google Style Guides** — GitHub `google/styleguide`(C++, Python, Go, TypeScript)
- **Google Code Review Developer Guide** — Code Review 방법에 대한 공식 가이드, GitHub에 중국어 번역
- **Roadmap.sh** — roadmap.sh, 커뮤니티 기반 Backend / DevOps / System Design 기술 지도
- 상업 서적도 시/도립 도서관 디지털 대출이나 합법적인 무료 플랫폼으로 읽을 수 있다

### 서적 원리 → AIOS 메커니즘

| 서적 원리 | AIOS 메커니즘 |
| --- | --- |
| Clean Architecture 의존 규칙, 경계 | 제1절 기준 + `pre-edit-safety-gate` 변경 형태 대조 + `rex-design` 옵션 비교 |
| 깊은 모듈, 복잡도 예산 | 제2절 기준 + Definition of Done 2~3행 |
| Clean Code 명명/함수/오류 처리 | 제3절 기준 + `rex-code-review` 기준 축 |
| Fowler 악취, 행위 보존 변경 | `rex-code-review` 악취 기준선 + `rex-refactor-hardening` 영수증 |
| Pragmatic Programmer DRY/직교성 | 제3절 기준 + `pre-edit-safety-gate` 재사용 우선 규칙 |
| 리팩터링의 보험으로서의 테스트 | `rex-tdd` / `rex-strict-tdd` / `verification-loop` + DoD 5행 |
| 기준의 자동화(템플릿 + lint + pre-commit + CI) | 제5절 도구 체인 기준 |
| ADD, 개념 무결성 | 제6절 문서 기준 + 타입화된 결정 기록 |
| Brooks: 본질적 vs 우발적 복잡도 | 깊은 모듈 발견법; 투기적 범용성 삭제 |

## 함께 보기

- [워크플로 정책](workflow-policy.md) — 턴이 어떻게 분류되고 게이트되는지
- [아키텍처](architecture.md) — 이 기준이 보호하는 제어 평면 아키텍처
- [스킬 후보](skill-candidates.md) — 새 능력이 카탈로그에 들어오는 곳
