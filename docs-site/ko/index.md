---
title: "AIOS — Local-First Graph Engine"
description: "A local-first Graph Engine for coding agents — composes project memory, adaptive routing, multi-agent teams, and verification into a verifiable graph on top of Claude Code, Codex, Gemini CLI, OpenCode, Hermes, and Grok."
---

# AIOS

**로컬 우선 Graph Engine.** AIOS는 로컬 우선 agent 워크플로 레이어입니다. 이미 사용하는 codex, claude, gemini, opencode, hermes, grok을 대체하지 않고 세션 간 프로젝트 기억, 병렬 협업, 재개 가능한 실행, 검증 게이트를 추가합니다.

[빠른 시작](getting-started.md){ .md-button .md-button--primary }
[사용 사례 보기](use-cases.md){ .md-button }
[Workflow Policy 읽기](workflow-policy.md){ .md-button }
[블로그 읽기](/blog/ko/){ .md-button }
[GitHub](https://github.com/rexleimo/aios){ .md-button }

## 먼저 답하면

한 문장으로 지시하면 AIOS가 프로젝트 사실을 기억하고, 독립 작업을 여러 agent에 분산하며, 긴 작업을 멈췄다가 나중에 재개합니다. 기본 coding client를 바꾸지 않으며 모든 기록을 매번 prompt에 자동으로 넣는 시스템도 아닙니다.

## 핵심 기능

| 기능 | 역할 | 시작점 |
|---|---|---|
| **ContextDB** | 필요할 때 읽는 프로젝트 기억, memo, checkpoint, context pack | aios init / [ContextDB](contextdb.md) |
| **Workflow Policy** | 위험도에 맞춰 noop, direct, guarded, planned route 선택 | [Workflow Policy](workflow-policy.md) |
| **Agent Team** | governance와 HUD 증거를 포함한 독립 작업 병렬 협업 | aios team / [Agent Team](team-ops.md) |
| **Solo Harness** | journal과 재개 경로가 있는 장기 작업 | aios harness run / [Solo Harness](solo-harness.md) |
| **RTK / Caveman** | 로컬 출력 잡음과 response style을 각각 처리 | [Token Intelligence](token-compression.md) |
| **Headroom MCP** | 지원 MCP client에서 명시적으로 압축하고 가져오기 | [Token Intelligence](token-compression.md) |
| **Verification / Privacy** | doctor, 테스트, quality gate, 민감 정보 redaction | [문제 해결](troubleshooting.md) |

## 지금 실행

~~~bash
# 프로젝트 루트에서 client guidance와 marker를 초기화합니다.
aios init --all

# native sync, runtime, 보안 검사를 확인합니다.
aios doctor --native --verbose
~~~

marker는 .aios/context-db/index.json을 가리킵니다. ContextDB는 pull-based 방식으로 필요한 project material만 검색합니다. 시작할 때마다 전체 기록을 읽는 방식이 아닙니다.

## 목표별 시작점

| 목표 | 추천 |
|---|---|
| 질문하거나 읽기만 하기 | [Workflow Policy](workflow-policy.md)의 direct |
| 작고 명확한 로컬 변경 | guarded + verification |
| 여러 파일, 장기 작업, 재개 가능한 작업 | planned / [Solo Harness](solo-harness.md) |
| 독립 작업 패키지 병렬화 | [Agent Team](team-ops.md) |
| 단계별 quality-gated orchestration | [사용 사례](use-cases.md) |

## 실행 경계

~~~text
사용자
  -> codex / claude / gemini / opencode / hermes / grok
  -> native guidance + .aios/context-db/index.json
  -> ContextDB 검색 / memo / checkpoint
  -> Team, Solo Harness, Orchestrate (필요한 경우)
  -> browser-use CDP (브라우저 작업인 경우)
~~~

Playwright MCP는 compatibility path로 유지되고 브라우저 기본 문서는 browser-use CDP를 사용합니다. RTK, Caveman, Headroom MCP는 각각 별도의 install, consent, verification 경계를 가집니다.

## 첫 사용 흐름

1. [빠른 시작](getting-started.md)에서 aios init --all을 실행합니다.
2. aios doctor --native --verbose의 evidence를 확인합니다.
3. 지원 client를 평소처럼 실행합니다.
4. 기억의 세부 사항은 [ContextDB](contextdb.md), route 선택은 [Workflow Policy](workflow-policy.md)에서 확인합니다.

## 관련 페이지

- [Windows 가이드](windows-guide.md) - PowerShell 설치와 복구.
- [아키텍처](architecture.md) - runtime과 compatibility 경계.
- [사례 라이브러리](case-library.md) - cross-client, browser, privacy 재현 사례.
- [Friends](friends.md) - 관련 프로젝트와 ecosystem.
- [블로그](/blog/ko/) - 튜토리얼, 릴리스, 기술 deep dive.

## 블로그 추천

- [4.0.0 Adaptive Workflow Policy](/blog/ko/2026-07-v400-adaptive-workflow-policy/)
- [Agent workflow 선택 방법](/blog/ko/2026-07-choose-agent-workflow/)
- [Raw CLI에서 reliable workflow로](/blog/ko/2026-07-raw-cli-to-reliable-workflow/)
- [ContextDB Search Upgrade](/blog/ko/contextdb-fts-bm25-search/)

## 핵심 글

- [AIOS RL Training System](/blog/ko/rl-training-system/)
- [ContextDB Search Upgrade](/blog/ko/contextdb-fts-bm25-search/)
- [Windows CLI Startup Stability](/blog/ko/windows-cli-startup-stability/)
- [Orchestrate Live](/blog/ko/orchestrate-live/)
