---
title: "Orchestrate Live: 안전한 opt-in Subagent Runtime"
description: "dry-run과 live의 차이, 제한된 병렬 phase, JSON handoff, 소유권 게이트, provider readiness를 설명합니다."
date: 2026-06-20
tags: ["오케스트레이션", "Subagent", "Agent Team", "dry-run", "runtime"]
---

# Orchestrate Live 실사용 가능: Subagent Runtime 추가

> **Quick Answer:** `dry-run`은 모델 runtime을 호출하지 않고 계획과 handoff를 로컬에서 검증합니다. `live`는 명시적 opt-in이며 선택한 CLI를 통해 phase를 실행하고 JSON handoff와 파일 소유권을 검증합니다. dry-run 성공이 provider, 브라우저, 인증 readiness를 증명하지는 않습니다.

`aios orchestrate`를 "blueprint + dry-run" 안전 하네스로 쓰고 있었다면, 이번 업데이트로 `subagent-runtime` 기반의 live 실행이 실제로 동작합니다.

## 바뀐 점

이전:

- `--execute dry-run`은 DAG 생성 + handoff 로컬 시뮬레이션만 수행 (0 token)
- `--execute live`는 gate가 있어도 실행은 사실상 stub

이제:

- `--execute live`가 `codex` / `claude` / `gemini` CLI를 통해 각 phase job을 실행
- 병렬 phase는 `AIOS_SUBAGENT_CONCURRENCY`로 동시 실행 수를 제어
- merge-gate가 JSON handoff를 검증하고 파일 소유권 충돌을 차단

## 사용 방법 (opt-in)

live 실행은 기본 비활성입니다:

```bash
export AIOS_EXECUTE_LIVE=1
export AIOS_SUBAGENT_CLIENT=codex-cli  # 또는 claude-code, gemini-cli
aios orchestrate --session <session-id> --dispatch local --execute live --format json
```

Tip (codex-cli): Codex CLI v0.114+는 `codex exec` 구조화 출력(`--output-schema`, `--output-last-message`, stdin)을 지원합니다. AIOS는 가능하면 자동 사용해 JSON handoff 안정성을 높입니다.

## 자주 쓰는 환경 변수

- `AIOS_SUBAGENT_CONCURRENCY` (default: `2`)
- `AIOS_SUBAGENT_TIMEOUT_MS` (default: `600000`)
- `AIOS_SUBAGENT_CONTEXT_LIMIT` (default: `30`)
- `AIOS_SUBAGENT_CONTEXT_TOKEN_BUDGET` (optional)

토큰 비용:

- `dry-run`은 모델 런타임 호출이 없습니다
- `live`는 선택한 CLI를 호출하므로 토큰/비용은 해당 클라이언트에 따라 다릅니다

## Failure Semantics（실패 시 표시되는 내용）

`subagent-runtime`은 구조화된 각 작업 결과를 반환합니다. 다음 경우 작업이 `blocked`로 표시됩니다:

- 의존성이 블록됨
- 선택한 CLI 명령이 누락됨
- 서브에이전트 출력이 유효한 JSON이 아님（handoff 스키마 파싱/검증 실패）
- merge gate가 파일 소유권 충돌로 블록됨

## 왜 중요한가

이를 통해 새로운 런타임을 발명하지 않고도 오케스트레이션을 실행 가능하게 합니다:

- 동일한 blueprints
- 동일한 ContextDB 세션 기억
- 동일한 merge/소유권 규칙
- 이제 실제（opt-in）병렬 실행 가능

## 2026-03-16 진행 업데이트

이 게시물 공개 이후 동일한 세션에서 라이브 샘플링을 계속하여 런타임 안정성을 검증하고 있습니다:

- 최신 라이브 아티팩트: `dispatch-run-20260316T111419Z.json` (`dispatchRun.ok=true`)
- 상류 handoff가 `filesTouched=[]`를 보고하면 `review` / `security`가 자동 완료됨(`0ms`)
- `learn-eval` 평균 경과 시간이 `160678ms`로 개선되었지만 `sample.latency-watch`는 아직 활성 상태입니다
- Timeout 예산은 latency-watch가 해소되고 Windows 호스트 검증 증거가 완전히 닫힐 때까지 의도적으로 변경하지 않습니다

실천적 요점: 라이브 오케스트레이션은 일상적 사용에 충분히 안정적이지만, 예산 축소는 증거 주도적이어야 합니다.

## 자주 묻는 질문

### dry-run은 모델 토큰을 사용하나요?

아닙니다. dry-run은 계획과 모의 handoff를 로컬에서 검증합니다. live는 선택한 CLI를 호출하므로 토큰이나 provider 비용이 발생할 수 있습니다.

### live phase가 blocked가 되는 이유는 무엇인가요?

CLI 누락, 유효하지 않은 JSON handoff, blocked 상태의 의존성, 파일 소유권 충돌, timeout, 사람의 게이트가 원인일 수 있습니다. 재시도하기 전에 구조화된 결과를 확인하세요.

### live가 기본으로 켜져 있나요?

아닙니다. 명시적인 opt-in과 실제로 사용할 수 있는 provider/client가 필요합니다. readiness, 인증 상태, 권한 범위는 서로 다른 점검 항목입니다.

## 공식 문서

[Agent Team](https://cli.rexai.top/ko/team-ops/), [Workflow Policy](https://cli.rexai.top/ko/workflow-policy/), [Solo Harness](https://cli.rexai.top/ko/solo-harness/), [Troubleshooting](https://cli.rexai.top/ko/troubleshooting/)를 참고하세요.
