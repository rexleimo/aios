---
title: "Windows CLI 시작 안정성: 크로스 CLI 신뢰성 체인 보호"
description: "Windows cmd 런처 수정이 ContextDB 연속성, wrapper policy, Codex·Claude·Gemini의 네이티브 시작 경로를 보호하는 방법입니다."
date: 2026-03-20
tags: ["Windows", "CLI 신뢰성", "ContextDB", "Codex", "Claude"]
---

# AIOS Windows 업데이트: 단순 “시작 문제”가 아니라, 크로스-CLI 신뢰성 체인 전체를 지키는 변화

이번 업데이트는 일반적인 Windows 팁이 아니라, AIOS 코어 아키텍처와 직접 연결되어 있습니다.

## 빠른 결론

AIOS는 서로 연결된 3개의 레이어로 구성됩니다.

1. 브리지 레이어: `contextdb-shell-bridge.mjs` 가 wrap vs passthrough 를 결정
2. 세션 레이어: `ctx-agent` 가 ContextDB 세션 컨텍스트를 주입/재사용
3. 실행 레이어: 네이티브 CLI(`codex` / `claude` / `gemini`)는 그대로 실행

Windows cmd 기반 런처 수정은 1번 레이어에 들어갔지만, 결과적으로 전체 체인을 보호합니다.

## 왜 AIOS 관점에서 중요한가

AIOS가 없다면 `.cmd` 시작 이슈는 대부분 “CLI가 안 켜진다” 수준의 문제입니다.

하지만 AIOS에서는 같은 이슈가 아래까지 깨뜨립니다.

- 컨텍스트 연속성(`session -> context:pack -> inject`)
- 래퍼 정책 동작(`repo-only` / `opt-in` / `all`)
- 안정적인 엔트리를 전제로 하는 orchestrate 플로우

즉, 단순한 셸 트윅이 아니라 “크로스-CLI 워크플로 계약”을 지키는 문제입니다.

## 무엇이 바뀌었나

공유 프로세스 런처 + `contextdb-shell-bridge` 경로에서, Windows cmd 기반 실행이 더 안전해졌습니다.

- npm/cmd 런처 해석이 더 견고
- 래퍼 엔트리포인트를 못 찾는 경우에도 안전하게 폴백
- 가능하면 네이티브 실행 파일을 계속 우선

Codex/Claude/Gemini 래퍼 시작 경로를 커버합니다.

## 60초 재현/검증

최신 `main` 을 받고 터미널을 재시작한 뒤:

```bash
codex
```

브리지 라우팅 진단:

```bash
export CTXDB_DEBUG=1
codex
```

기대 결과:

- cmd 래퍼 엣지 케이스에서도 시작이 실패하지 않음
- 브리지가 wrap/passthrough 를 계속 올바르게 판단
- 일상 커맨드를 바꾸지 않고 컨텍스트 기반 워크플로가 유지됨

## 엔드투엔드 가치(AIOS 관점)

이 수정이 지키는 체인:

`shell wrapper -> contextdb-shell-bridge -> ctx-agent -> contextdb -> native CLI`

Windows에서 한 링크라도 끊기면 “메모리 있는 크로스-CLI” 약속이 깨집니다. 이번 업데이트는 그 링크를 강화합니다.

## FAQ

### 명령어를 바꿔야 하나요?

아니요. `codex` / `claude` / `gemini` 를 그대로 쓰면 됩니다.

### 시작 문제만 고친 건가요?

아니요. 시작 레이어의 수정이지만, AIOS에서는 wrap과 세션 컨텍스트 주입이 그 엔트리 경로에 의존하므로 워크플로 전체에 영향을 줍니다.

### 토큰 사용량이 바뀌나요?

모델 정책 자체는 바뀌지 않습니다. 프로세스 신뢰성과 래퍼 동작의 안정화입니다.

## 공식 문서

현재 설치와 복구 절차는 [Windows Guide](https://cli.rexai.top/ko/windows-guide/), [Getting Started](https://cli.rexai.top/ko/getting-started/), [ContextDB](https://cli.rexai.top/ko/contextdb/), [Troubleshooting](https://cli.rexai.top/ko/troubleshooting/)를 참고하세요.
