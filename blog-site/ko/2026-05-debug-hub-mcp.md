---
title: "debug-hub: Agent 가 스스로 디버깅할 수 있다면, 더 편하게 잘 수 있습니다"
description: "Coding agent 가 자신의 에러 로그를 읽고 여러분을 깨우지 않고 문제를 고칠 수 있다면 어떨까요? 그것이 debug-hub 입니다."
date: 2026-05-06
tags: ["debug-hub", "MCP", "Coding Agent", "관측가능성"]
---

# debug-hub: Agent 가 스스로 디버깅할 수 있다면, 더 편하게 잘 수 있습니다

이런 상황을 상상해 보세요: 새벽 3시, 야간 agent 실행이 에러를 만났습니다. 예전이라면 망가진 상태로 아침을 맞이하고, 로그를 뒤지며 오전을 보냈겠죠.

**Agent 가 스스로 디버깅할 수 있다면 어떨까요?**

그것이 바로 debug-hub 가 하는 일입니다. Agent 에게 자신의 로그를 검색하고, 실행 경로를 추적하고, 무엇이 잘못되었는지 파악할 수 있는 도구를 제공합니다 — 모두 여러분 없이, 스스로.

## 문제: Agent 는 눈이 먼 상태입니다

Agent 가 에러를 만나면, 자신의 로그를 볼 수 없습니다. 터미널 출력을 `grep` 하거나 타임스탬프를 연결할 수 없습니다. 디버깅 워크플로는 항상 이렇습니다:

1. **여러분이** 무언가 잘못되었음을 알아챔
2. **여러분이** 로그를 스크롤하며 확인
3. **여러분이** 에러를 찾아 agent 에게 다시 전달
4. Agent 가 마침내 이해함

빠른 세션에서는 괜찮습니다. 하지만 야간 실행, 멀티 agent 작업, 긴 harness 작업에서는 사람이 지켜보지 않습니다. Agent 는 그냥... 조용히 실패합니다.

## 해결책: Agent 를 위한 도구

debug-hub 는 MCP 를 통해 로그 도구를 노출합니다 — agent 가 이미 다른 도구에 사용하는 같은 프로토콜입니다. Agent 는 새로운 기능을 얻습니다:

| 도구 | Agent 가 할 수 있는 일 |
|---|---|
| `search_logs` | "최근 5분간 모든 에러 보여줘" |
| `get_trace` | "이 에러의 전체 실행 경로 보여줘" |
| `get_stats` | "에러가 몇 개나 있었어?" |
| `start_session` | "디버깅을 시작할게, 추적해줘" |
| `cleanup_instruments` | "디버그 코드를 제거해줘, 버그가 고쳐졌어" |

### 자가 디버깅 예시

재시도 루프에 빠진 agent 가 이제 다음과 같이 할 수 있습니다:

1. 자신의 최근 에러 로그 검색
2. 정확한 에러 메시지와 trace ID 발견
3. 전체 실행 트레이스를 가져와 어느 단계에서 실패했는지 확인
4. 문제를 진단하고 수정
5. 모든 것을 여러분을 깨우지 않고 수행

## 내부 구성

debug-hub 는 모든 것이 내장된 단일 Node.js 프로세스입니다:

- **HTTP API** — 코드에서 로그를 수신
- **MCP Server** — agent 를 위한 도구 노출
- **Web UI** — 다크 테마 대시보드 (인간용)
- **파일 스토리지** — `~/.debug-hub/` 아래 간단한 JSONL 파일

데이터베이스도, Docker 도, 연결 문자열도 필요 없습니다. `npm install` 하고 바로 시작하면 됩니다.

### 세 가지 SDK

어떤 런타임에서도 같은 API 를 사용할 수 있습니다:

**Node.js:**
```typescript
import { DebugHub } from '@debug-hub/node';
const debug = new DebugHub({ service: 'my-agent' });
debug.info('Tool call started', { tool: 'search' });
```

**Browser:**
```typescript
import { DebugHub } from '@debug-hub/browser';
const debug = new DebugHub({ service: 'web-ui' });
debug.warn('API latency spike', { endpoint: '/api/chat' });
```

**Go:**
```go
debug := debughub.New(debughub.Config{Service: "harness-runner"})
trace := debug.StartTrace("iteration-42")
```

## 시작하기

```bash
cd packages/debug-hub
npm install
npm run dev
# → HTTP API + Web UI: http://localhost:39200
# → MCP: stdio 모드
```

테스트 로그 전송:
```bash
curl -X POST http://localhost:39200/api/logs/single \
  -H 'Content-Type: application/json' \
  -d '{"id":"1","timestamp":1714500000000,"level":"info","message":"hello","source":{},"sdk":{"name":"test","version":"0.3.0","runtime":"node"}}'
```

http://localhost:39200 을 열어 대시보드에서 확인하세요.

## 더 큰 그림

debug-hub 는 AIOS 의 **관측가능성 레이어** 의 일부입니다. 다음과 함께 작동합니다:

- [ContextDB](https://cli.rexai.top/ko/contextdb/) — 세션 간 메모리
- [Solo Harness](https://cli.rexai.top/ko/solo-harness/) — 자가 진단 가능한 야간 실행
- [Agent Team](https://cli.rexai.top/ko/team-ops/) — 멀티 agent 트레이싱

Agent 가 스스로 디버깅할 수 있으면, 더 오래 실행하고, 더 복잡한 작업을 처리하고, 에러에서 복구할 수 있다고 신뢰할 수 있습니다 — 모든 것을 여러분의 지속적인 주목 없이.

---

*debug-hub 는 v0.3.0 이며 [AIOS](https://cli.rexai.top) 의 일부입니다. 사용해 보고 agent 에게 자기 성찰의 힘을 주세요.*
