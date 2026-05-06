---
title: "debug-hub: Coding Agent 가 스스로 디버깅할 수 있는 MCP 네이티브 디버그 서비스"
description: "debug-hub 0.1.0 출시 — coding agent 전용으로 설계된 경량 MCP 네이티브 디버그 로그 서비스. Node.js / Browser / Go SDK, 내장 Web UI, 에이전트가 직접 grep 가능한 파일 기반 스토리지 제공."
date: 2026-05-06
tags: ["debug-hub", "MCP", "Coding Agent", "관측가능성", "Node.js", "Go", "AIOS"]
---

# debug-hub: Coding Agent 가 스스로 디버깅할 수 있는 MCP 네이티브 디버그 서비스

모든 coding agent 는 로그를 생성합니다. 하지만 문제가 발생했을 때, agent 자신은 그 로그를 조사할 수단이 없습니다 — 터미널 출력을 grep 하거나, JSONL 트레이스를 파싱하거나, 스팬 간 오류를 연결할 수 없습니다. 결국 인간 운영자인 여러분이 하던 일을 멈추고 탐정 역할을 떠맡게 됩니다.

**debug-hub** 는 이 상황을 바꿉니다. coding agent 를 위해 처음부터 설계된 디버그 로그 수집 서비스로, 로그와 트레이스를 agent 가 직접 쿼리할 수 있는 MCP 도구로 노출합니다.

## 문제: Agent 는 자신의 런타임을 볼 수 없다

coding agent 가 오류 루프에 빠지거나, 판단에 막히거나, 예상치 못한 출력을 낼 때, 디버깅 흐름은 항상 "사람 우선"입니다:

1. 뭔가 잘못되었음을 알아챔
2. 터미널 히스토리를 스크롤하거나 로그 파일을 염
3. 타임스탬프, 오류 메시지, 스팬을 수동으로 연결
4. 관련 부분을 agent 컨텍스트에 붙여넣음
5. Agent 가 마침내 충분한 신호를 얻고 복구

짧은 세션에서는 괜찮습니다. 하지만 장시간 실행되는 하네스 작업, 야간 실행, 사람이 모니터링하지 않는 멀티 agent 오케스트레이션에서는 무너집니다.

핵심 통찰: **agent 는 자신의 실행 트레이스를 내성할 수 있어야 합니다**. 이미 도구 접근 권한(MCP)이 있고, 오류에 대해 추론할 수 있습니다. 부족한 것은 자신의 런타임 상태에 대한 쿼리 가능한 인터페이스뿐입니다.

## debug-hub 가 제공하는 것

debug-hub 는 단일 Node.js 바이너리로, 네 가지 구성 요소를 하나의 프로세스에 패키징합니다:

| 구성 요소 | 역할 |
|-----------|------|
| **HTTP API** | SDK 로그 수신, 검색/통계 엔드포인트 제공 |
| **MCP Server** | 5개 도구 (`list_traces`, `get_trace`, `search_logs`, `get_stats`, `clear_logs`)를 coding agent 에 노출 |
| **내장 Web UI** | 다크 테마 대시보드, 로그 검색, 트레이스 뷰어, SSE 실시간 피드 |
| **파일 스토리지** | `~/.debug-hub/` 아래 JSONL 파일 — `cat`/`grep` 으로 직접 읽기 가능 |

### SDK 지원

세 가지 SDK, 일관된 API 패턴:

**Node.js**
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

**Browser**
```typescript
import { DebugHub } from '@debug-hub/browser';

const debug = new DebugHub({ service: 'web-ui' });
debug.warn('API latency spike', { endpoint: '/api/chat', p99: 3200 });
```

**Go**
```go
debug := debughub.New(debughub.Config{Service: "harness-runner"})
trace := debug.StartTrace("iteration-42")
span := trace.Span("checkpoint-write")
span.Info("Checkpoint saved", map[string]interface{}{"bytes": 12400})
span.End()
trace.End()
```

### Agent 용 MCP 도구

debug-hub 를 agent 의 MCP 설정에 추가하면 5개의 새로운 도구를 사용할 수 있습니다:

```
debug_hub.list_traces   — 최근 실행 트레이스 나열
debug_hub.get_trace     — 특정 트레이스의 전체 스팬 트리 조회
debug_hub.search_logs   — 키워드, 레벨, 시간 범위, 모듈, traceId 로 검색
debug_hub.get_stats     — 집계 카운트, 오류 요약, 레벨 분포
debug_hub.clear_logs    — 오래된 로그 정리
```

반복적인 오류가 발생하는 agent 는 이제 다음과 같이 할 수 있습니다:

1. `search_logs` 를 `{ level: "error", since: <5분 전> }` 으로 호출
2. 정확한 오류 메시지와 trace ID 확보
3. 관련 트레이스에 `get_trace` 를 호출하여 전체 스팬 트리 확인
4. 파이프라인의 어느 단계에서 실패하는지 자가 진단
5. 인간 개입 없이 자가 수정

## 주목할 만한 아키텍처 결정

**데이터베이스 불필요.** 스토리지는 `~/.debug-hub/` 아래의 JSONL 파일입니다. 즉:
- `npm install` 외에 설정 불필요
- 데이터베이스, Docker, 연결 문자열 없음
- Agent 가 API 를 우회하여 `cat`/`grep` 으로 직접 파일 읽기 가능
- 인간 운영자도 익숙한 커맨드라인 도구로 문제 해결 가능

**MCP 우선, HTTP 차선.** MCP 도구 정의는 HTTP API 에 사후에 덧붙인 것이 아니라, 동일한 스토리지 계층을 공유하며 함께 설계되었습니다. HTTP API 는 SDK 수집과 Web UI 를 위해 존재하고, MCP 인터페이스가 agent 가 실제로 쿼리하는 창구입니다.

**SSE 로 대시보드 구동.** 새 로그 항목은 Server-Sent Events 를 통해 Web UI 로 브로드캐스트됩니다 — WebSocket 의 복잡함도, 폴링 오버헤드도 없습니다.

## 빠른 시작

```bash
cd packages/debug-hub
npm install
npm run dev
# HTTP API + Web UI: http://localhost:39200
# MCP: stdio 모드 (agent 의 MCP 설정에 추가)
```

테스트 로그 전송:
```bash
curl -X POST http://localhost:39200/api/logs/single \
  -H 'Content-Type: application/json' \
  -d '{"id":"1","timestamp":1714500000000,"level":"info","message":"hello from debug-hub","source":{},"trace":{"traceId":"t1","spanId":"s1"},"sdk":{"name":"test","version":"0.1.0","runtime":"node"}}'
```

그런 다음 `http://localhost:39200` 을 열어 대시보드에서 확인하세요.

## 다음 계획

debug-hub 는 0.1.0 입니다. 로드맵:

- **Python SDK** — 더 넓은 AI/ML agent 생태계 지원
- **트레이스 압축** — 긴 트레이스를 agent 친화적인 요약으로 압축하여 컨텍스트 윈도우 절약
- **멀티 agent 상관관계** — orchestrator/worker 패턴을 위한 크로스 agent 트레이스 링크
- **영구 알림 규칙** — 로그 패턴에 일치할 때 발동하는 agent 설정 가능한 감시 조건

## 사용해 보기

debug-hub 는 [rex-ai-boot](https://github.com/rexleimo/rex-cli) 모노레포의 `packages/debug-hub` 에 있습니다. Node.js ≥ 22 가 필요합니다.

coding agent, 하네스 러너, MCP 서버를 구축하고 있다면 — 당신의 agent 에게 스스로 디버깅할 수 있는 능력을 주세요.
