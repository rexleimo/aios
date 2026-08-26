---
title: "v5.8.1: 에이전트가 멈추지 않음 — aios-shell 동결 수정과 LLM 의미 판단 기반 요구사항 명확화"
description: "AIOS v5.8.1은 긴 명령 실행 중 opencode/codex를 얼려버리는 aios-shell MCP 동결 문제를 수정하고, 정규식 기반 모호성 감지를 LLM 의미 판단으로 교체합니다 — grilling은 실행 중에, 한 번에 하나의 결정 질문만 던집니다."
date: 2026-08-26
tags: ["AIOS", "릴리스", "MCP", "aios-shell", "요구사항", "grilling", "LLM", "안정성"]
---

# v5.8.1: 에이전트가 멈추지 않음 — aios-shell 동결 수정과 LLM 의미 판단 기반 요구사항 명확화

v5.8.1은 두 가지 오랜 문제를 수정합니다: 코딩 에이전트(opencode, codex)가 명령 실행 중 얼어붙어 복구할 수 없는 문제와, 워크플로 레이어가 '요청이 실제로 모호하다'는 것을 감지하지 못하는 문제입니다.

## 동결 문제: 긴 명령이 에이전트 전체를 얼림

`aios_shell`로 시간이 걸리는 명령(빌드, 테스트 실행, 수 분이 걸리는 스크립트)을 실행하면 에이전트가 완전히 죽었습니다. ping 응답 없음, 취소 불가, 진행 상황 없음. Esc를 누르고 "continue"를 보내야 다시 움직였습니다.

근본 원인은 아키텍처에 있었습니다: MCP server와 stdio proxy가 JSON-RPC를 **직렬**로 처리했습니다. 하나의 긴 명령이 뒤의 모든 요청을 차단했고, Esc가 보내는 `notifications/cancelled`도 포함됐습니다. 클라이언트는 말 그대로 명령을 취소할 수 없었고 어떤 응답도 돌아오지 않았습니다.

### 변경 내용

- shell server 메인 루프가 **동시 처리**로 바뀌었습니다: 명령 실행 중에도 ping·취소·기타 요청에 즉시 응답합니다.
- stdio proxy도 동시 전달하므로 프록시 레이어가 상위 명령에 의해 차단되지 않습니다.
- `notifications/cancelled`는 requestId 단위로 실행 중인 명령을 즉시 종료하며 타임아웃을 기다리지 않습니다.
- Windows에서는 `taskkill /T /F`로 **프로세스 트리 전체**를 정리합니다 — `cmd.exe` 종료 후 node/npm/git 자식 프로세스가 남지 않습니다.
- stdin 닫힘 시 실행 중인 모든 명령을 정리해 아무것도 남기지 않습니다.

aios-shell 프록시 체인은 유지됩니다: `aios-mcp-proxy.mjs`가 `_meta.aios` 관측 메타데이터와 로컬 ref를 계속 부여합니다. RTK/Caveman은 계속 클라이언트 측 출력 압축입니다(프록시는 실제로 출력을 압축하지 않고 그대로 전달합니다 — `SHELL_TOOL.description`은 더 이상 압축을 주장하지 않습니다).

동시성 수정 위에 안전망으로, 생성되는 MCP server 설정에 시작 타임아웃을 추가했습니다(Codex의 `startup_timeout_sec` 60/30/30, OpenCode는 `experimental.mcp_timeout: 90000` 주입).

## 또 다른 수정: 요청이 모호함을 알아채기

워크플로 레이어는 이전에 '이 요청은 모호하다'를 **정규식**으로 판단했습니다. `VAGUE_BEHAVIOR_PATTERN` 같은 패턴은 명시적 표현("优化一下", "tweak the login logic")에만 일치했고, 더 흔한 경우 — 구체적인 기능 이름은 있는데 수용 기준·범위·성공 정의가 없는 — 를 놓쳤습니다. 정규식은 사용자가 우연히 예상된 표현을 쓸 때만 발화했으므로 요구사항 명확화는 자주 트리거되지 않았고 에이전트는 잘못된 것을 만들었습니다.

### Grilling은 이제 LLM 판단 + 실행 중 내장

- `derive-facts.mjs`는 더 이상 정규식으로 문구에서 모호성을 도출하지 않습니다.
- requirements Capability는 `grill`/`spec` 인텐트(LLM의 의미 판단) 또는 도메인 용어 모호성 observation으로만 활성화됩니다.
- `rex-requirements`는 **실행 중 내장된 grilling**을 중심으로 다시 작성됐습니다: 한 번에 하나의 결정 질문·추천 답변 포함·3라운드 수렴, 그리고 진짜 결정 지점에서만 질문합니다. Grilling은 시작의 심문 게이트가 아닙니다 — 에이전트는 먼저 작업하고, 스스로 사실을 조사하며, 결정이 진짜로 사용자에게 속할 때만 멈춰 질문합니다.
- 워크플로 런타임이 각 단계 경계에서 다음 Capability를 다시 선택하므로, 명확화를 실행 중간에 삽입하고 완료 후 원래 Capability를 재개할 수 있습니다.

스킬 description은 이중 트리거입니다: LLM은 모호·범위 미정의·다중 해석 가능한 요청(구체적인 기능 이름이 있어도)에서 자체 트리거할 수 있고, rex-harness는 기존대로 활성화할 수 있습니다.

## 업그레이드

```bash
aios update
```

설정 마이그레이션은 필요 없습니다. 업데이트 후 opencode/codex를 재시작해 새 shell server와 proxy를 반영하세요.

## 이 릴리스의 다른 내용

- `rex-code-review`에 **시나리오 기반 서브에이전트 수용 모드** 추가: 격리·컨텍스트 프리 수용 실행으로 정상/경계/비정상 시나리오를 커버하고 각 발견에 증거를 첨부합니다.
- 모든 MCP 설정 생성기(Codex TOML, OpenCode JSON)가 시작 타임아웃을 기본 출력합니다.
