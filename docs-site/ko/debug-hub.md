---
title: debug-hub
description: 코딩 에이전트가 자신의 런타임 로그를 조회하고 스스로 오류를 진단할 수 있게 하는 MCP 네이티브 디버그 로그 서비스.
---

# debug-hub

> 코딩 에이전트가 스스로 디버깅하게 하세요.

debug-hub는 코딩 에이전트 전용으로 설계된 MCP 네이티브 디버그 로그 서비스입니다. 로그와 트레이스를 에이전트가 직접 조회할 수 있는 MCP 도구로 노출하여, 터미널 출력을 grep 하거나 오류 스팬을 수동으로 연결할 필요 없이 `search_logs`, `get_trace`, `get_stats` 등을 사용할 수 있게 합니다.

[블로그 글 읽기](/blog/ko/2026-05-debug-hub-mcp/){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="debug_hub_hero" data-rex-target="blog_post" }
[빠른 시작](#빠른-시작){ .md-button data-rex-track="cta_click" data-rex-location="debug_hub_hero" data-rex-target="quick_start" }

---

## 왜 debug-hub인가

코딩 에이전트가 에러 루프에 빠지거나, 결정에 멈추거나, 예상치 못한 출력을 생성할 때, 디버깅 워크플로우는 항상 **사람 중심**입니다:

1. 뭔가 잘못된 것을 알아차림
2. 터미널 기록을 스크롤하거나 로그 파일을 엶
3. 타임스탬프, 에러 메시지, 스팬을 수동으로 연결
4. 관련 부분을 에이전트 컨텍스트에 다시 붙여넣음
5. 에이전트가 복구에 충분한 신호를 받음

이는 밤새 실행되는 Harness 작업, 야간 실행, 사람이 감시하지 않는 다중 에이전트 오케스트레이션에서는 무너집니다.

**핵심 인사이트**: 에이전트는 자신의 실행 트레이스를 내성적으로 조회할 수 있어야 합니다. 이미 도구 접근(MCP)이 있습니다. 필요한 것은 자신의 런타임 상태에 대한 쿼리 가능한 표면입니다.

---

## 핵심 기능

<div class="feature-grid">
  <div class="feature-card feature-card--debug">
    <div class="feature-card__icon">🔧</div>
    <div class="feature-card__title">에이전트용 MCP 도구</div>
    <div class="feature-card__desc">
      <code>list_traces</code>, <code>get_trace</code>, <code>search_logs</code>, <code>get_stats</code>, <code>clear_logs</code> — 에이전트가 자신의 런타임을 조회할 수 있는 5가지 도구.
    </div>
  </div>
  <div class="feature-card feature-card--tool">
    <div class="feature-card__icon">📦</div>
    <div class="feature-card__title">3가지 SDK</div>
    <div class="feature-card__desc">
      Node.js, Browser, Go — 모든 런타임에서 일관된 API 패턴.
    </div>
  </div>
  <div class="feature-card feature-card--memory">
    <div class="feature-card__icon">📁</div>
    <div class="feature-card__title">제로 의존성</div>
    <div class="feature-card__desc">
      <code>~/.debug-hub/</code> 아래 파일 기반 JSONL 스토리지 — <code>cat</code>/<code>grep</code>으로 직접 읽을 수 있음.
    </div>
  </div>
  <div class="feature-card feature-card--workflow">
    <div class="feature-card__icon">🖥️</div>
    <div class="feature-card__title">내장 Web UI</div>
    <div class="feature-card__desc">
      다크 테마 대시보드와 로그 검색, 트레이스 뷰어, SSE 라이브 피드.
    </div>
  </div>
</div>

---

## 빠른 시작

```bash
cd packages/debug-hub
npm install
npm run dev
```

- **HTTP API + Web UI**: http://localhost:39200
- **MCP**: stdio 모드 (에이전트의 MCP 설정에서 구성)

### 테스트 로그 전송

```bash
curl -X POST http://localhost:39200/api/logs/single \
  -H 'Content-Type: application/json' \
  -d '{
    "id": "1",
    "timestamp": 1714500000000,
    "level": "info",
    "message": "hello from debug-hub",
    "source": {},
    "trace": {"traceId": "t1", "spanId": "s1"},
    "sdk": {"name": "test", "version": "0.1.0", "runtime": "node"}
  }'
```

그런 다음 `http://localhost:39200`를 열어 대시보드에서 확인하세요.

---

## SDK 사용법

### Node.js

```typescript
import { DebugHub } from '@debug-hub/node';

const debug = new DebugHub({ service: 'my-agent' });
debug.info('Tool call started', { tool: 'search', args: { query: '...' } });

const trace = debug.startTrace('agent-turn');
const span = trace.span('llm-call');
span.info('Prompt sent', { model: 'claude-opus-4-7' });
span.end();
trace.end();
```

### Browser

```typescript
import { DebugHub } from '@debug-hub/browser';

const debug = new DebugHub({ service: 'web-ui' });
debug.warn('API latency spike', { endpoint: '/api/chat', p99: 3200 });
```

### Go

```go
debug := debughub.New(debughub.Config{Service: "harness-runner"})
trace := debug.StartTrace("iteration-42")
span := trace.Span("checkpoint-write")
span.Info("Checkpoint saved", map[string]interface{}{"bytes": 12400})
span.End()
trace.End()
```

---

## MCP 도구 참조

| 도구 | 설명 |
|------|-------------|
| `debug_hub.list_traces` | 필터로 최근 실행 트레이스 목록 조회 |
| `debug_hub.get_trace` | 특정 트레이스의 전체 스팬 트리 조회 |
| `debug_hub.search_logs` | 키워드, 레벨, 시간 범위, 모듈, traceId로 검색 |
| `debug_hub.get_stats` | 집계 카운트, 에러 요약, 레벨 분석 |
| `debug_hub.clear_logs` | 보관 규칙으로 오래된 로그 정리 |

### 자가 진단 예제

반복 에러를 겪는 에이전트는 이제:

1. `{ level: "error", since: <5분 전> }`으로 `search_logs` 호출
2. 정확한 에러 메시지와 트레이스 ID 반환받음
3. 관련 트레이스에 대해 `get_trace` 호출로 전체 스팬 트리 확인
4. 파이프라인의 어떤 스텝이 실패하는지 자가 진단
5. 사람 개입 없이 자가 수정

---

## 아키텍처

debug-hub는 4개 컴포넌트를 하나의 Node.js 바이너리에 패키징합니다:

| 컴포넌트 | 역할 |
|-----------|------|
| **HTTP API** | SDK에서 로그 수신, 검색/통계 엔드포인트 제공 |
| **MCP 서버** | 코딩 에이전트용 5가지 쿼리 도구 노출 |
| **내장 Web UI** | 다크 테마 대시보드와 로그 검색, 트레이스 뷰어, SSE 라이브 피드 |
| **파일 스토리지** | `~/.debug-hub/` 아래 JSONL 파일 — 직접 읽을 수 있음 |

### 설계 결정

**데이터베이스 의존성 없음.** 스토리지는 디스크의 JSONL 파일입니다. 이 의미:
- `npm install` 이후 제로 설정
- 에이전트가 API를 우회하고 파일을 직접 읽을 수 있음
- 데몬 없음, Docker 없음, 연결 문자열 없음

**MCP 우선, HTTP 차선.** MCP 도구 정의는 동일한 스토리지 레이어를 공유하고 HTTP API와 공동 설계되었습니다.

**대시보드용 SSE.** 새 로그 엔트리는 Server-Sent Events를 통해 브로드캐스트됨 — WebSocket 복잡성 없음, 폴링 오버헤드 없음.

---

## 사용 사례

### 자가 진단 에러 루프

에이전트가 재시도 루프에 갇혔을 때, 자신의 최근 에러 로그를 조회하고 패턴을 식별하며 전략을 조정할 수 있습니다 — 모두 당신을 깨우지 않고.

### 장시간 실행 모니터링

야간 Harness 실행, 데이터 처리 작업, 또는 훈련 파이프라인은 구조화된 트레이스를 로깅할 수 있습니다. 문제가 발생하면, 다음날 진단 에이전트가 트레이스 히스토리에서 정확한 실패 지점을 가져올 수 있습니다.

### 다중 에이전트 실행 트레이싱

분산 오케스트레이터/워커 패턴은 에이전트 경계를 넘어 트레이스를 연관시킬 수 있어, 복잡한 다중 스텝 워크플로우에 대한 통합 뷰를 제공합니다.

---

## 향후 계획

debug-hub는 0.1.0입니다. 로드맵에는 다음이 포함됩니다:

- **Python SDK** — 더 넓은 AI/ML 에이전트 생태계용
- **트레이스 인식 압축** — 컨텍스트 윈도우 효율을 위한 긴 트레이스 요약
- **다중 에이전트 연관** — 오케스트레이터/워커 패턴을 위한 교차 에이전트 트레이스 연결
- **영구 알림 규칙** — 로그 패턴에서 발동하는 에이전트 구성 가능 감시 조건

---

## 리소스

- **심층 블로그**: [debug-hub: MCP 네이티브 디버그 로그 서비스](/blog/ko/2026-05-debug-hub-mcp/)
- **소스 코드**: rex-ai-boot monorepo의 `packages/debug-hub`
- **요구사항**: Node.js ≥ 22

---

## 관련 기능

- [솔로 Harness](solo-harness.md) — 저널링을 갖춘 장시간 싱글 에이전트 작업
- [Agent Team](team-ops.md) — 다중 에이전트 협업 및 조율
- [문제 해결](troubleshooting.md) — 일반 디버깅 및 진단
