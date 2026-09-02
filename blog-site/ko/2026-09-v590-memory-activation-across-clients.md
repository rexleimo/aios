---
title: "v5.9.0 전 클라이언트 메모리 시스템 활성화: 정규식 트리거에서 프롬프트 주도로"
description: "AIOS v5.9.0이 메모리 활성화를 결정론적 진입점과 프롬프트 계약으로 전환한 방법: 세션 시작 자동 등록, aios-memory MCP 3개 도구, 5개 클라이언트 계약 투영, Codex 시작 프롬프트 근본 수정."
date: 2026-09-02
tags: ["AIOS", "메모리", "MCP", "Codex", "release"]
---

# v5.9.0 전 클라이언트 메모리 시스템 활성화: 정규식 트리거에서 프롬프트 주도로

> **핵심 요약:** v5.9.0은 메모리 활성화를 정규식 추측에서 3가지 결정론적 진입점으로 전환했습니다——세션 시작 시 ContextDB 자동 등록, `aios-memory` MCP 서버(recall / write / checkpoint), 5개 클라이언트 Memory Trigger Contract 투영. Codex 시작 프롬프트(trust 영속화 파일 미기록)도 근본 수정하고 Gemini deprecated를 해제했습니다. 7개 클라이언트 × 5개 MCP 모두 그린.

## 이 릴리스를 내보낸 이유

메모리 트리거 계층이 정규식으로 구축된 문제를 발견했습니다——정규식은 LLM에게 도구에 대한 진짜 이해를 주지 못해 효과가 좋지 않았습니다. 정규식 계층을 제거한 후 진짜 문제가 드러났습니다: **트리거 지점이 프롬프트 계층의 명시적 위치로 옮겨지지 않아** 메모리 시스템이 "비활성화된 것처럼 보이는" 상태였습니다.

v5.9.0은 이 리팩터링을 완성했습니다: **결정론적 데이터면(hook/플러그인 자동 주입) + 의미면(프롬프트로 트리거 지점 선언) + MCP 도구면(hook 없는 클라이언트의 결정론적 진입점)**.

## 주요 변경

- **세션 라이프사이클과 메모리 연결**: `aios session start`가 ContextDB 세션을 등록(멱등, `--session-id/--agent/--client`), 이전 handoff와 pinned memo를 즉시 이어받음.
- **`aios-memory` MCP 서버**: `memory_recall`(통합 검색), `memory_write`(확인 없이 memo 저장), `memory_checkpoint`(pinned 면으로 체크포인트). Gemini / Hermes / WorkBuddy 등 hook 없는 클라이언트의 결정론적 진입점.
- **OpenCode 플러그인 + hook 전체 커버리지**: Claude 이중 hook, Codex/Grok UserPromptSubmit 런타임 검증 완료. OpenCode는 플러그인을 통해 기존 파이프라인으로 매 턴 리콜 주입(TUI).
- **Memory Trigger Contract 5개 클라이언트 투영**: 새 세션에서 먼저 recall, 계속할 때 recall, 검증된 결론은 즉시 write, 완료 전 checkpoint. 트리거 지점은 계약으로 선언하고 관련성 판단은 LLM에 위임.
- **Codex 프롬프트 근본 수정**: codex 0.148+는 hooks/프로젝트 신뢰를 `~/.codex/config.toml`에 영속화하지만 AIOS는 기록하지 않았음 → 매 시작마다 반복 프롬프트. 설치 프로그램이 관리 영역(trust + 5개 MCP)을 기록하며, 멱등하고 사용자 콘텐츠 보존. 업데이트 후에도 재발하지 않음.
- **Gemini 전체 지원 복원**: 업스트림은 Antigravity로 이동했지만 전 클라이언트 일관 지원 약속에 따라 deprecated를 해제하고 메모리/투영/스킬 동기화를 전량 연결.

## 업그레이드 주의

- `aios session start --json` 출력이 베어 배열에서 `{ registration, lines }`로 변경.
- `opencode run`(헤드리스)은 프로젝트 플러그인을 로드하지 않음(업스트림 사양). TUI는 영향 없음.
- Codex 사용자는 업그레이드 후 마지막으로 한 번 신뢰 프롬프트가 표시될 수 있음——한 번 수락하면 영속화됨.

## 검증

세션 등록 단위 테스트 5/5, codex config 테스트 5/5, MCP 스모크 4/4, 클라이언트 회귀 47 pass / 0 fail. turn-recall은 3개 클라이언트에서 실측 검증, 실기기 E2E는 멱등 reused를 바이트 단위로 확인.
