---
title: 블로그 허브
description: Harness CLI — codex, claude, gemini, opencode에 기억, 협업, 검증을 추가하는 로컬 agent 워크플로 레이어에 대한 스토리, 튜토리얼, 심층 분석.
---

# 블로그

AI 코딩 에이전트를 더 똑같이, 더 신뢰할 수 있게, 더 쉽게 작업할 수 있게 만드는 스토리, 튜토리얼, 심층 분석.

Harness CLI(AIOS라고도 함)는 로컬 agent 워크플로 레이어입니다. 새로운 코딩 에이전트가 아니라 기존 `codex`, `claude`, `gemini`, `opencode` 에 기억, 팀워크, 자기 진단을 추가하는 레이어입니다.

## 여기서 시작하기

Harness CLI를 처음 사용하시나요? 이 게시물들이 방향을 잡아줄 것입니다:

- [Harness CLI 이야기](launch-post.md) — 왜 만들었는지, 어떤 문제를 해결하는지
- [CLI 비교: Raw vs. Harness CLI](cli-comparison-post.md) — 레이어를 추가하면 무엇이 달라지는지
- [자동화 플레이북](automation-playbook-post.md) — 일상적 사용 패턴

## 최신 글

- [v1.50.1: All-Client Token Compression Compliance](2026-06-v1501-token-compression-compliance.md)
- [v1.50.0: 기억, 문서, 계획, 코드를 가로지르는 통합 AIOS 검색](2026-06-v150-unified-aios-search.md)
- [Codemap：AI 에이전트에게 코드베이스 지도를](2026-05-codemap-crg.md)
- [ContextDB Token 압축: 더 작은 context pack과 안전한 recall](2026-05-token-compression.md)
- [네이티브 Token 압축: Harness CLI가 RTK나 Caveman을 설치하지 않는 이유](2026-05-native-token-compression.md)
- [Model Router: 모든 태스크에 맞는 올바른 모델](2026-05-model-router.md)
- [aios memo GUI: 에이전트의 기억을 살아있는 그래프로 시각화](2026-05-aios-memo-gui.md)
- [Solo Harness: 한 Agent를 밤새 돌려도 통제를 잃지 않는 방법](2026-04-solo-harness.md)
- [debug-hub: 에이전트가 스스로 디버깅하는 시대](2026-05-debug-hub-mcp.md)
- [Browser MCP 개선: 더 똑같은 페이지 읽기](2026-04-browser-mcp-weak-model-upgrade.md)
- [고급 디자인 스킬로 페이지 제작: 모호한 프롬프트를 실전 UI로](advanced-design-skills-page-building.md)
- [Harness CLI TUI 리팩토링: React Ink 기반의 현대적 터미널UI](2026-04-rexcli-ink-tui-refactor.md)
- [Windows CLI 시작 안정성 업데이트](windows-cli-startup-stability.md)

## 심층 분석

- [AIOS RL Training System: 에이전트에게 학습시키는 법](rl-training-system.md)
- [ContextDB 검색: 히스토리에서 바늘 찾기](contextdb-fts-bm25-search.md)
- [Orchestrate Live: 프로덕션에서 Subagent 실행](orchestrate-live.md)

## FAQ

### 어디서 시작해야 하나요?
먼저 [Harness CLI 이야기](launch-post.md)를 읽고, [퀵스타트](https://cli.rexai.top/ko/getting-started/) 가이드를试试하세요.

### 기억과 컨텍스트 관리가 중요하다면?
[Token 압축](2026-05-token-compression.md)에서 시작해서 [ContextDB 검색](contextdb-fts-bm25-search.md)을 읽어보세요.

### 에이전트를 밤새 실행하고 싶다면?
[Solo Harness](2026-04-solo-harness.md)를 읽고 [Solo Harness 문서](https://cli.rexai.top/ko/solo-harness/)를 확인하세요.

### 에이전트가 스스로 디버깅하게 하고 싶다면?
[debug-hub](2026-05-debug-hub-mcp.md)를 읽고 [debug-hub 문서](https://cli.rexai.top/ko/debug-hub/)를 확인하세요.

### Harness CLI는 새로운 코딩 에이전트인가요?
아닙니다. `codex`, `claude`, `gemini`, `opencode` 를 감싸서 기억, 팀워크, 자기 진단을 추가합니다. 워크플로우는 변하지 않습니다.
