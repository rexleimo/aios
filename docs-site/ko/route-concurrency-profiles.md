---
title: 라우팅/병렬 프로필
description: AIOS 라우팅과 병렬 설정을 최소 변수로 선택하는 빠른 가이드.
---

# 라우팅/병렬 프로필

환경 변수를 많이 기억하지 않으려면 이 페이지의 프리셋을 그대로 사용하세요.

## 핵심 변수

- `CTXDB_INTERACTIVE_AUTO_ROUTE`: interactive 자동 라우팅(`single/subagent/team/harness`) 사용 여부
- `CTXDB_CODEX_DISABLE_MCP`: wrapper로 실행한 `codex`에서 MCP 시작 건너뛰기 여부 (`1` = 더 빠른 시작, 해당 실행에서 MCP 도구 없음)
- `CTXDB_HARNESS_PROVIDER`: 주입되는 `harness` route provider (`codex|claude|gemini|opencode|hermes|grok|hermes|grok`, 기본값은 현재 CLI)
- `CTXDB_HARNESS_MAX_ITERATIONS`: 주입되는 `harness` route 반복 예산 (기본값 `8`)
- `CTXDB_TEAM_WORKERS`: `aios team ...` 병렬 worker 수
- `AIOS_SUBAGENT_CONCURRENCY`: `aios orchestrate --execute live` 및 GroupChat 라운드당 speaker 실행 동시성 (기본값: `3`)
- `AIOS_SUBAGENT_TIMEOUT_MS`: 라이브 실행 시 에이전트 턴당 타임아웃 (밀리초, 기본값: `600000` = 10분)
- `AIOS_ALLOW_UNKNOWN_CAPABILITIES`: 라이브 실행 시 capability guard 건너뛰기 (`1` = 위험 감수)

## 권장 프리셋

### 1) 균형 기본값(권장)

```bash
export CTXDB_INTERACTIVE_AUTO_ROUTE=1
export CTXDB_CODEX_DISABLE_MCP=1
export CTXDB_HARNESS_MAX_ITERATIONS=8
export CTXDB_TEAM_WORKERS=3
export AIOS_SUBAGENT_CONCURRENCY=3
export AIOS_SUBAGENT_TIMEOUT_MS=600000
```

일상 작업에 사용: 병렬 처리량을 유지하면서 일반적인 MCP 콜드 스타트 지연을 방지합니다.

### 2) 고처리량

```bash
export CTXDB_INTERACTIVE_AUTO_ROUTE=1
export CTXDB_CODEX_DISABLE_MCP=1
export CTXDB_HARNESS_MAX_ITERATIONS=12
export CTXDB_TEAM_WORKERS=4
export AIOS_SUBAGENT_CONCURRENCY=4
```

### 3) 디버그 안정 모드

```bash
export CTXDB_INTERACTIVE_AUTO_ROUTE=0
export CTXDB_CODEX_DISABLE_MCP=1
export CTXDB_HARNESS_MAX_ITERATIONS=4
export CTXDB_TEAM_WORKERS=1
export AIOS_SUBAGENT_CONCURRENCY=1
```

## 빠른 전환 별칭（선택）

```bash
alias rex-par3='export CTXDB_INTERACTIVE_AUTO_ROUTE=1 CTXDB_CODEX_DISABLE_MCP=1 CTXDB_HARNESS_MAX_ITERATIONS=8 CTXDB_TEAM_WORKERS=3 AIOS_SUBAGENT_CONCURRENCY=3'
alias rex-par4='export CTXDB_INTERACTIVE_AUTO_ROUTE=1 CTXDB_CODEX_DISABLE_MCP=1 CTXDB_HARNESS_MAX_ITERATIONS=12 CTXDB_TEAM_WORKERS=4 AIOS_SUBAGENT_CONCURRENCY=4'
alias rex-debug='export CTXDB_INTERACTIVE_AUTO_ROUTE=0 CTXDB_CODEX_DISABLE_MCP=1 CTXDB_HARNESS_MAX_ITERATIONS=4 CTXDB_TEAM_WORKERS=1 AIOS_SUBAGENT_CONCURRENCY=1'
```

사용 예:

```bash
rex-par3
codex
```

## 참고

- 변경 사항은 새 세션에서 반영됩니다(CLI 재시작 필요).
- 병렬 수는 `CTXDB_TEAM_WORKERS`와 `AIOS_SUBAGENT_CONCURRENCY`가 결정하며, `CTXDB_INTERACTIVE_AUTO_ROUTE`와는 무관합니다.
- GroupChat 라이브 모드에서 `AIOS_SUBAGENT_CONCURRENCY` 는 라운드당 병렬로 발언하는 에이전트 수를 제어합니다. 각 에이전트는 이전 라운드의 전체 공유 대화 히스토리를 볼 수 있습니다.
- Harness 자체 트리거는 단일 provider 루프이며 병렬 team 이 아닙니다. 주입되는 harness provider 를 현재 CLI 와 다르게 하고 싶을 때만 `CTXDB_HARNESS_PROVIDER` 를 설정하세요.
- `AIOS_ALLOW_UNKNOWN_CAPABILITIES=1` 은 라이브 실행 capability guard 를 우회합니다. 작업 범위를 신뢰하고 dry-run-first 요구사항을 건너뛰고 싶을 때 사용하세요.
- MCP 도구가 필요한 실행만 일시적으로:

```bash
CTXDB_CODEX_DISABLE_MCP=0 codex
```
