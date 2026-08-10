---
title: "Token Intelligence 계층: ContextDB, RTK, Caveman, Headroom MCP"
description: "AIOS의 현재 token intelligence를 설명합니다. pull-based ContextDB, 로컬 압축, 명시적 Headroom MCP를 다룹니다."
date: 2026-05-12
tags: ["AIOS", "token intelligence", "ContextDB", "RTK", "Caveman", "Headroom MCP"]
---

# Token Intelligence 계층: ContextDB, RTK, Caveman, Headroom MCP

> **Quick Answer:** AIOS는 token 효율을 여러 계층으로 나눕니다. ContextDB는 필요한 프로젝트 컨텍스트를 저장·검색하고, RTK와 Caveman은 로컬에서 명령과 출력을 줄이며, Headroom MCP는 다음 단계에 필요한 자료를 명시적으로 compress/retrieve하는 도구를 제공합니다. Headroom은 모든 model request를 투명하게 interception하는 기능이 아닙니다.

긴 Agent 세션에서는 로그, 브라우저 boilerplate, 반복 이력이 실제 판단에 필요한 컨텍스트를 가립니다. 중요한 것은 만능 스위치가 아니라 저장, 압축, 검색의 경계를 분리하는 것입니다.

## 각 계층의 책임

| 계층 | 책임 | 경계 |
| --- | --- | --- |
| ContextDB | 사실, 이벤트, refs, handoff를 저장하고 필요한 자료를 검색 | pull-based이며 전체 이력을 매번 주입하지 않음 |
| RTK | 지원되는 CLI 출력을 로컬에서 압축 | 검증을 대신하지 않음 |
| Caveman | prompt/skill로 Agent 출력을 간결하게 유지 | 오류, 경로, 명령, 위험 경고를 보존 |
| Headroom MCP | 다음 단계에 필요한 자료를 명시적으로 compress/retrieve | 필요할 때 호출하며 투명 interception이 아님 |

설치는 다음부터 시작합니다.

```bash
aios init --all
aios doctor --native --verbose
```

선택적 압축 도구와 Headroom MCP 설치 권한은 따로 처리해야 합니다.

## ContextDB는 기억의 경계

안정적인 사실, 선택한 작업, handoff를 ContextDB에 저장하고 다음 판단에 필요한 것만 pull합니다. context pack은 token budget으로 제한할 수 있습니다.

```bash
cd mcp-server
npm run contextdb -- context:pack --session <session_id> --token-budget 1200 --token-strategy balanced
```

registry marker는 등록 정보가 있다는 뜻일 뿐 전체 이력이 모든 prompt에 자동 주입된다는 뜻은 아닙니다.

## 압축해도 근거는 남긴다

압축 결과에는 정확한 명령, 파일 경로, 최신 상태, 오류, 경고, 검증 공백, 원문을 찾을 수 있는 참조를 남깁니다. 짧게 만드는 것이 목적이 아니라 같은 판단 품질을 더 작은 컨텍스트로 유지하는 것이 목적입니다.

## FAQ

### 모든 계층을 도입해야 하나요?

아닙니다. 먼저 ContextDB를 사용하고 로그가 클 때 로컬 압축을 추가하세요. 다음 단계에서 명시적인 검색이 필요할 때만 Headroom MCP를 사용합니다.

### Headroom이 현재 model request를 자동으로 바꾸나요?

아닙니다. 호출자가 대상을 선택하는 명시적인 MCP 도구입니다.

### 현재 동작은 어디서 확인하나요?

[Token Intelligence](https://cli.rexai.top/ko/token-compression/), [ContextDB](https://cli.rexai.top/ko/contextdb/), [문제 해결](https://cli.rexai.top/ko/troubleshooting/)을 참고하세요.
