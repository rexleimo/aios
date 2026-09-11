---
title: "Pi coding agent가 AIOS 퍼스트클래스 클라이언트로 승격"
description: "AIOS가 Pi를 skills, native 지시, harness 구동, 코드 레벨 extension과 RPC 제어로 지원합니다."
date: 2026-09-11
tags: ["AIOS", "pi", "client", "extension", "harness", "skills"]
---

# Pi coding agent가 AIOS 퍼스트클래스 클라이언트로 승격

Pi는 최소 코어의 자기확장형 터미널 harness입니다. AIOS는 Pi를
`skills` / `native` / `harness` 일등 클라이언트로 등록했습니다.

## 내용

- 레지스트리 등록 (`pi` / `pi-coding-agent`). sub-agent이 없으므로
  `team` / `agents`는 주장하지 않습니다.
- MCP 정직 모델링 (`format: none`, 빈 scopes). 마이그레이션·검사는
  안전하게 건너뜁니다.
- native 지시 레이어, `.pi/skills`, 25개 스킬 전체 투사.
- 런타임: `pi -p` 원샷, harness 전략, shell-bridge 대응.

## 코드 레벨 내장

`aios-pi-extension` 패키지가 memory 도구 4종, 파괴적 명령어
`tool_call` 게이트, workflow policy hard inject,
`aios init --agent pi` 등록, `--mode rpc` 드라이버를 제공합니다.
프롬프트 의존에서 코드 제어로. 그것이 이번 변화의 본질입니다.
