---
title: CLI 비교
description: 원시 Codex/Claude/Gemini CLI 워크플로와 Harness CLI 오케스트레이션 레이어를 비교.
---

# 원시 CLI vs Harness CLI 레이어

> **Quick Answer:** 일회성이고 위험이 낮은 작업은 `codex`, `claude`, `gemini`, `opencode` 원시 CLI로 처리합니다. 세션 간 기억, 워크플로 라우팅, 멀티 클라이언트 핸드오프, 브라우저 안전, 검증 근거가 필요하면 Harness CLI를 추가하세요. 이것은 코딩 에이전트를 바꾸지 않는 로컬 레이어입니다.

## 판단표

| 필요한 것 | 권장 경로 |
| --- | --- |
| 영속 상태가 없는 짧은 작업 | 원시 CLI |
| 공유 프로젝트 기억과 검색 가능한 컨텍스트 | Harness CLI + ContextDB |
| 여러 클라이언트 또는 Agent Team | Harness CLI + Agent Team |
| 편집 안전과 완료 근거 | Harness CLI + 편집/검증 게이트 |

Harness CLI는 Codex, Claude 또는 Gemini CLI의 대체품이 아닙니다.
그것은 그 위에 있는 신뢰성 레이어입니다.

[GitHub에서 Star](https://github.com/rexleimo/harness-cli?utm_source=cli_rexai_top&utm_medium=docs&utm_campaign=english_growth&utm_content=comparison_hero_star){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="comparison_hero" data-rex-target="github_star" }
[빠른 시작](getting-started.md){ .md-button data-rex-track="cta_click" data-rex-location="comparison_hero" data-rex-target="quick_start" }
[케이스 집합](case-library.md){ .md-button data-rex-track="cta_click" data-rex-location="comparison_hero" data-rex-target="case_library" }

## Harness CLI로 무엇이 달라지나

| 워크플로 요구사항 | 원시 CLI만 | Harness CLI 레이어 있음 |
|---|---|---|
| 크로스 세션 기억 | 수동 복사/붙여넣기 컨텍스트 | 프로젝트 ContextDB 기본 재개 |
| 크로스 agent 핸드오프 | 임시적이고 취약함 | 공유 session/checkpoint 아티팩트 |
| 브라우저 자동화 | 도구별 설정 드리프트 | 통합 MCP 설치 + doctor 스크립트 |
| 민감 설정 읽기 안전성 | 프롬프트에 시크릿 유출이 쉬움 | Privacy Guard 리덕션 경로 |
| 작업 복구 | 수동 문제 해결 | Doctor 스크립트 + 재현 가능한 runbook |

## 원시 CLI만 사용 경우

- 핸드오프가 필요 없는 일회성 짧은 작업이 필요한 경우.
- 세션 지속성이나 워크플로 추적 가능성이 필요 없는 경우.
- 일회용 환경에서 실험하는 경우.

## Harness CLI 추가 경우

- 같은 프로젝트에서 `codex`, `claude`, `gemini`, `opencode`, `hermes`, `grok`를 전환하는 경우.
- 재시작 안전 컨텍스트와 감사 가능한 checkpoint가 필요한 경우.
- 브라우저 자동화와 인증벽 처리가 필요하며 명시적 human handoff가 있는 경우.
- 설정 읽기 중 의도치 않은 시크릿 노출을 줄여야 하는 경우.

## 빠른 증명 (5분)

```bash
git clone https://github.com/rexleimo/harness-cli.git
cd harness-cli
scripts/setup-all.sh --components all --mode opt-in
source ~/.zshrc
codex
```

그런 다음 영속화된 아티팩트가 존재하는지 확인:

```bash
ls .aios/context-db
```

기대값: `sessions/`, `index/`, `exports/`.

## 딥다이브 케이스

- [케이스: 크로스 CLI 핸드오프](case-cross-cli-handoff.md)
- [케이스: 브라우저 인증벽 플로우](case-auth-wall-browser.md)
- [케이스: Privacy Guard 설정 읽기](case-privacy-guard.md)

## 다음 액션

[GitHub에서 Star](https://github.com/rexleimo/harness-cli?utm_source=cli_rexai_top&utm_medium=docs&utm_campaign=english_growth&utm_content=comparison_footer_star){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="comparison_footer" data-rex-target="github_star" }

## FAQ

### Harness CLI가 코딩 에이전트를 대체하나요?

아닙니다. 지원 클라이언트 주변에 로컬 워크플로, 기억, 검증 레이어를 추가합니다.

### 원시 CLI가 더 나은 경우도 있나요?

있습니다. 작고 상태가 없으며 위험이 낮고 추가 컨텍스트가 결과를 개선하지 않는 작업에는 원시 CLI가 더 간단합니다.

## 공식 문서

현재 동작은 [워크플로 정책](workflow-policy.md), [ContextDB](contextdb.md), [빠른 시작](getting-started.md)에서 확인하세요.
