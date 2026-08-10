---
title: "ContextDB 레이지 로드: 5초 부팅에서 에이전트 자율 발견으로"
description: "부팅 시 전체 팩 주입을 폐기하고 50ms 미만의 퍼사드 로드, 백그라운드 비동기 부트스트랩, 런타임 트리거 오케스트레이션을 통해 에이전트가 필요할 때 메모리를 로드하는 메커니즘을 구현했습니다."
date: 2026-04-19
tags: [ContextDB, 레이지 로드, 에이전트 메모리, AIOS, 성능]
---

# ContextDB 레이지 로드: 5초 부팅에서 에이전트 자율 발견으로

AIOS로 래핑된 CLI를 열 때마다 ContextDB는 `init → session → pack → inject` 전체 파이프라인을 실행했습니다. 이로 인해 한 글자도 입력하기 전에 2~5초의 대기 시간이 발생했습니다. 간단한 잡담이나 한 줄 수정만 필요한 사용자에게는 불필요한 마찰이었습니다.

오늘 **레이지 로드 경로**를 릴리스했습니다. 부팅 시간을 50ms 미만으로 단축하면서도 필요할 때 전체 메모리 기능을 사용할 수 있게 합니다.

## 문제

- **느린 콜드 스타트** — `context:pack`이 매번 전체 세션 마크다운을 재구성했습니다
- **인지적 노이즈** — 큰 컨텍스트 패킷이 단순한 작업에서도 매번 주입되었습니다
- **강제 연속성** — 이전 세션과 무관한 경우에도 모든 세션이 이전 세션의 연속으로 처리되었습니다

## 해결책: 3개의 계층

### 계층 1 — 부팅 시 퍼사드 프롬프트 (50ms 미만)

전체 히스토리를 패킹하는 대신 가벼운 `memory/context-db/.facade.json` 사이드카를 로드합니다:

```json
{
  "sessionId": "claude-code-20260419T095454-e6eb600d",
  "goal": "Shared context session for claude-code on aios",
  "status": "running",
  "lastCheckpointSummary": "Browser MCP weak-model remediation complete",
  "keyRefs": ["scripts/ctx-agent-core.mjs"],
  "contextPacketPath": "memory/context-db/exports/latest-claude-code-context.md"
}
```

이는 150토큰 미만의 프롬프트로 `--append-system-prompt`를 통해 주입됩니다:

> "이 프로젝트는 ContextDB를 사용하여 세션 메모리를 관리합니다. 최신 세션: ... 전체 히스토리는: ... 이전 컨텍스트가 필요할 때 로드하세요."

### 계층 2 — 백그라운드 비동기 부트스트랩

입력을 시작하는 동안 분리된 프로세스가 백그라운드에서 전체 컨텍스트 패킷을 재구성합니다:

```
부팅 ──► 퍼사드 로드 (20ms)
    ──► 프롬프트 주입 + CLI 실행
    ──► [백그라운드] contextdb init → pack → 퍼사드 업데이트
```

다음에 CLI를 열 때 퍼사드는 최신 상태이며 사이클이 반복됩니다.

### 계층 3 — 런타임 트리거 오케스트레이션 (A → B → C)

에이전트가 사용자 턴을 수신하면 세 가지 신호를 단락 순서로 평가합니다:

| 신호 | 확인 내용 | 트리거 예시 |
|------|-----------|-------------|
| **A. 의도** | 메모리 관련 키워드 | "remember", "之前", "continue", "resume" |
| **B. 복잡도** | 작업 구조 지표 | "first do X then Y", "orchestrate a team" |
| **C. RL 정책** | 학습된 로드 결정 | 향후: `rl-core` 정책 모델 |

어떤 신호가 발화되면 에이전트는 `@file` 또는 도구 사용을 통해 전체 히스토리를 로드합니다 — **래퍼 개입은 필요 없습니다**.

## 아키텍처

```
┌──────────────────────────────────────┐
│  부팅 (50ms 미만)                     │
│  1. .facade.json 로드                 │
│  2. 퍼사드 프롬프트 주입               │
│  3. CLI 실행                          │
│  4. [bg] 비동기 부트스트랩            │
└──────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────┐
│  런타임 (에이전트 턴)                  │
│  사용자 입력 → 의도 → 복잡도 → RL    │
│  어떤 것 true → 에이전트가 히스토리 로드│
└──────────────────────────────────────┘
```

## 주요 설계 결정

- **기본 ON** — `CTXDB_LAZY_LOAD`는 기본값이 `1`. `CTXDB_LAZY_LOAD=0`으로 즉시 패킹으로 되돌립니다
- **원샷 보존** — `--prompt` 모드는 항상 전체 즉시 경로를 사용합니다(에이전트는 즉시 컨텍스트가 필요)
- **페일 오픈** — 퍼사드가 누락/만료된 경우 세션 헤더에서 즉시 생성합니다. 비동기 부트스트랩이 실패핏 경우 경고를 로깅하고 계속합니다
- **동적 주입 없음** — 현재 CLI 아키텍처에서는 부팅 시 시스템 프롬프트가 고정되므로 로드 책임을 에이전트 자체에 이전합니다

## 변경 내용

| 파일 | 역할 |
|------|------|
| `scripts/lib/contextdb/facade.mjs` | 퍼사드JSON 로드, TTL 검증, 폴백 생성 |
| `scripts/lib/contextdb/async-bootstrap.mjs` | 파이어앤포겟 팩 + 퍼사드 업데이트 |
| `scripts/lib/contextdb/async-bootstrap-runner.mjs` | 분리된 백그라운드 프로세스용 독립형 CLI 러너 |
| `scripts/lib/contextdb/trigger/intent.mjs` | 정규표현식/키워드 의도 감지 |
| `scripts/lib/contextdb/trigger/complexity.mjs` | 휴리스틱 작업 복잡도 스코어링 |
| `scripts/lib/contextdb/trigger/orchestrator.mjs` | A→B→C 단락 트리거 평가 |
| `scripts/ctx-agent-core.mjs` | `runCtxAgent` 내 레이지 로드 분기 |

## 검증

### 신규 테스트
- `contextdb-facade.test.mjs` — 4개 테스트 (히트, 미스, 만료, 폴백 생성)
- `trigger-intent.test.mjs` — 6개 테스트 (회상, 계속, 참조, 메타, 중립, 부정)
- `trigger-complexity.test.mjs` — 4개 테스트 (다단계, 교차, 오케스트레이트, 단순)
- `trigger-orchestrator.test.mjs` — 4개 테스트 (의도 발화, 부정 억제, 복잡도 발화, 미발화)
- `async-bootstrap.test.mjs` — 1개 테스트 (팩 후 퍼사드 쓰기)
- `contextdb-lazy-load.test.mjs` — 5개 테스트 (헬퍼, 통합)

### 회귀
- `ctx-agent-core.test.mjs` — 기존 24개 테스트, 모두 `CTXDB_LAZY_LOAD=0` 옵트아웃으로 통과

## 향후 계획

1. **RL 정책 통합** — 실제 보상 신호를 사용하여 "load memory?" 결정을 최적화하는 `rl-core` 정책 훈련
2. **텔레메트리** — 트리거 정확도, 로드 지연 시간, 작업 완료 효과를 추적하여 임계값을 지속적으로 개선
3. **모델 티어 프리셋** — 약한 모델과 강한 모델에 대해 다른 트리거 감도

---

**사용해 보세요:** 세션 히스토리가 있는 프로젝트에서 AIOS 래핑 CLI를 엽니다. 일반적인 팩 경로 대신 `Context packet: (lazy-load; agent self-discovers memory)`가 표시되어야 합니다. 에이전트에게 "지난번에 이어서"라고 말하면 필요에 따라 히스토리를 로드합니다.

## 관련 문서

- [ContextDB](https://cli.rexai.top/ko/contextdb/)
- [Quick Start](https://cli.rexai.top/ko/getting-started/) — 30초 안에 AIOS 설치
- [Workflow Policy](https://cli.rexai.top/ko/workflow-policy/) — direct / guarded / planned 라우트
