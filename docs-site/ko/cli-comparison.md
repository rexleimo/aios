---
title: CLI 비교
description: "순수 Codex / Claude / Gemini CLI 워크플로와 AIOS 계층의 실제 차이를 비교합니다. 순수 CLI는 기억, 라우팅, 검증을 직접 관리해야 하지만 AIOS는 한 문장으로 기억, 분담, 증거, 검증까지 처리합니다."
---

# 원시 CLI vs AIOS 레이어

> **Quick Answer:** 일회성이고 위험이 낮은 작업은 `codex`, `claude`, `gemini`, `opencode` 원시 CLI로 처리합니다. 세션 간 기억, 워크플로 라우팅, 멀티 클라이언트 핸드오프, 브라우저 안전, 검증 근거가 필요하면 AIOS를 추가하세요. 이것은 코딩 에이전트를 바꾸지 않는 로컬 레이어입니다.

## 판단표

| 필요한 것 | 권장 경로 |
| --- | --- |
| 영속 상태가 없는 짧은 작업 | 원시 CLI |
| 공유 프로젝트 기억과 검색 가능한 컨텍스트 | AIOS + ContextDB |
| 여러 클라이언트 또는 Agent Team | AIOS + Agent Team |
| 편집 안전과 완료 근거 | AIOS + 편집/검증 게이트 |

AIOS는 Codex, Claude 또는 Gemini CLI의 대체품이 아닙니다.
그것은 그 위에 있는 신뢰성 레이어입니다.

[GitHub에서 Star](https://github.com/rexleimo/aios?utm_source=cli_rexai_top&utm_medium=docs&utm_campaign=english_growth&utm_content=comparison_hero_star){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="comparison_hero" data-rex-target="github_star" }
[빠른 시작](getting-started.md){ .md-button data-rex-track="cta_click" data-rex-location="comparison_hero" data-rex-target="quick_start" }
[케이스 집합](case-library.md){ .md-button data-rex-track="cta_click" data-rex-location="comparison_hero" data-rex-target="case_library" }

## AIOS로 무엇이 달라지나

| 워크플로 요구사항 | 원시 CLI만 | AIOS 레이어 있음 |
|---|---|---|
| 크로스 세션 기억 | 수동 복사/붙여넣기 컨텍스트 | 프로젝트 ContextDB 기본 재개 |
| 크로스 agent 핸드오프 | 임시적이고 취약함 | 공유 session/checkpoint 아티팩트 |
| 브라우저 자동화 | 도구별 설정 드리프트 | 통합 MCP 설치 + doctor 스크립트 |
| 민감 설정 읽기 안전성 | 프롬프트에 시크릿 유출이 쉬움 | Privacy Guard 리덕션 경로 |
| 작업 복구 | 수동 문제 해결 | Doctor 스크립트 + 재현 가능한 runbook |

## 지원 클라이언트

현재 10개 클라이언트. 아래 표는 레지스트리가 실제로 노출하는 능력 매트릭스이며, 출처는 `scripts/lib/clients/core/definitions.mjs`입니다. 설치 상태는 추측하지 말고 `aios doctor --native --verbose`로 확인하세요.

| 클라이언트 | 명령 | skills | native | harness | agents | team | 지시 파일 | 프로젝트 스킬 루트 |
|---|---|---|---|---|---|---|---|---|
| Codex CLI | `codex` | ✓ | ✓ | ✓ | ✓ | ✓ | `AGENTS.md` | `.codex/skills` |
| Claude Code | `claude` | ✓ | ✓ | ✓ | ✓ | ✓ | `CLAUDE.md` | `.claude/skills` |
| Gemini CLI | `gemini` | ✓ | ✓ | ✓ | — | ✓ | `GEMINI.md` | `.gemini/skills` |
| OpenCode | `opencode` | ✓ | ✓ | ✓ | ✓ | ✓ | `AGENTS.md` | `.opencode/skills` |
| Hermes | `hermes` | ✓ | ✓ | ✓ | — | — | `AGENTS.md` | `.hermes/skills` |
| Grok Build | `grok` | ✓ | ✓ | ✓ | ✓ | ✓ | `AGENTS.md` | `.grok/skills` |
| WorkBuddy | `codebuddy` | ✓ | ✓ | ✓ | — | — | `AGENTS.md` | `.workbuddy/skills` |
| Pi | `pi` | ✓ | ✓ | ✓ | — | ✓ | `AGENTS.md` | `.agents/skills`(공용 루트) |
| ZCode | `zcode` | ✓ | ✓ | ✓ | plugin | ✓ | `AGENTS.md` | `.agents/skills`(공용 루트) |
| Qoder | `qoder` | ✓ | ✓ | ✓ | — | ✓ | `AGENTS.md` | `.qoder/skills` |

열 의미: **skills** = 클라이언트 스킬 루트로 투영되는 스킬 팩 · **native** = 네이티브 지시 파일 기록 · **harness** = solo-harness 구동 · **agents** = 프로젝트 범위 서브에이전트 정의 · **team** = `aios team` 병렬 분배.

네 행은 각주가 필요합니다:

- **ZCode의 `agents`는 빠진 게 아닙니다.** ZCode 0.16.5에는 프로젝트 범위 서브에이전트 정의 면이 없어서, AIOS는 rex 역할 카드를 `~/.aios/zcode-plugin` 아래 `aios-agents` 인라인 플러그인으로 만들고 사용자 레벨 `plugins.dirs`로 등록합니다. `doctor:zcode-agents`가 manifest 유효성·agent 드리프트·등록 상태를 보고합니다. ZCode에는 `--model` 플래그가 없으므로 모델 라우팅은 비어 있고, headless 실행은 한 번만 `zcode login`이 필요합니다.
- **Pi와 ZCode는 `.agents/skills` 루트를 공유합니다.** 전용 사본을 두 벌 만드는 대신, 업그레이드 때 구본에 맞는 정리를 수행합니다.
- **Pi의 `agents`는 상류 경계이며, `team` 지원은 검증됐습니다.** Pi는 "의도적으로 내장 MCP·서브에이전트·권한 팝업·plan mode를 두지 않는다"는 설계로, 서브에이전트 실행은 확장으로 얹는 것이므로 AIOS가 rex 역할 카드를 넣을 프로젝트 범위 면이 없습니다(AIOS 도구는 config 마이그레이션이 아니라 `aios-bridge` MCP server와 Pi 확장을 통해 Pi에 닿습니다). `team`에는 그런 면이 필요하지 않습니다: 팀 워커는 다른 프로바이더와 같은 spawn 경로를 타는 headless `pi -p` 하위 프로세스일 뿐이며, 실제 `aios team --provider pi --live` 배치에서 검증됐습니다(planning 단계가 처음부터 끝까지 완료되고 implement 워커가 대상 파일을 생성). 오프라인 회귀는 `scripts/tests/team-pi-worker.test.mjs`가 지킵니다. 표는 "불가능"이 아니라 "검증됨"으로 읽고, 실제 상태는 `aios doctor --native --verbose`가 보여줍니다.
- **Qoder의 `agents`는 Pi·ZCode와 같은 경계입니다.** Qoder(Alibaba)는 AI IDE와 코딩 agent CLI를 함께 제공하는 도구로, 명령은 `qoder`, 런타임 클라이언트 id는 `qoder-cli`입니다. 중국 배포판은 `qoderclicn`이고 홈이 `~/.qoder-cn`이며, 국제판 홈은 `~/.qoder`(환경 변수 `QODER_HOME`으로 덮어쓸 수 있습니다). 프로젝트 범위 서브에이전트 정의 면이 없으므로 AIOS는 `skills` / `native` / `team` / `harness`를 선언하고 `agents`는 비워 둡니다. `team`과 `harness`가 동작하는 이유는 Qoder가 무인 실행을 지원하기 때문인데, 공식 CLI 문서에 있는 `-p` print 모드에 `--output-format`, 무인 실행용 `--yolo`를 다른 프로바이더와 같은 spawn 경로가 그대로 구동합니다. 모델 라우팅은 `own`입니다. 모델이 계정에 묶여 대화형 `/model`로 고르고 검증된 headless `--model` 플래그가 없으므로, AIOS는 아직 Qoder로 모델을 중계하지 않습니다(zcode·grok·workbuddy와 같은 상태). AIOS는 Qoder 자신의 루트 `.qoder/skills`(사용자 레벨은 `~/.qoder/skills`)에 스킬을 투영하고, MCP 항목은 `~/.qoder/settings.json`과 `<repo>/.qoder/settings.json`의 최상위 `mcpServers` 네임스페이스에 기록하며, 지시문은 `AGENTS.md`—codex / opencode / grok / hermes / workbuddy / pi / zcode와 함께 쓰는 네이티브 투영 파일—에 둡니다(`QODER.md`는 Qoder가 받아들이는 별칭이지만 AIOS는 쓰지 않습니다). Qoder 지원은 AIOS 5.20.0에 들어왔습니다.

단일 클라이언트만 투영하려면 `aios init --agent <client>`(예: `aios init --agent qoder`), 전부는 `--agent all`을 쓰세요. `qoder`가 `PATH`에 있으면 자동 감지되므로 플래그를 붙이지 않아도 됩니다.

## 원시 CLI만 사용 경우

- 핸드오프가 필요 없는 일회성 짧은 작업이 필요한 경우.
- 세션 지속성이나 워크플로 추적 가능성이 필요 없는 경우.
- 일회용 환경에서 실험하는 경우.

## AIOS 추가 경우

- 같은 프로젝트에서 `codex`, `claude`, `gemini`, `opencode`, `hermes`, `grok`(Grok Build), `workbuddy`(CodeBuddy CLI), `pi`, `zcode`, `qoder`(Qoder CLI, 중국 배포판은 `qoderclicn`)를 전환하는 경우.
- 재시작 안전 컨텍스트와 감사 가능한 checkpoint가 필요한 경우.
- 브라우저 자동화와 인증벽 처리가 필요하며 명시적 human handoff가 있는 경우.
- 설정 읽기 중 의도치 않은 시크릿 노출을 줄여야 하는 경우.

## 빠른 증명 (5분)

```bash
git clone https://github.com/rexleimo/aios.git
cd aios
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

[GitHub에서 Star](https://github.com/rexleimo/aios?utm_source=cli_rexai_top&utm_medium=docs&utm_campaign=english_growth&utm_content=comparison_footer_star){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="comparison_footer" data-rex-target="github_star" }

## FAQ

### AIOS가 코딩 에이전트를 대체하나요?

아닙니다. 지원 클라이언트 주변에 로컬 워크플로, 기억, 검증 레이어를 추가합니다.

### 원시 CLI가 더 나은 경우도 있나요?

있습니다. 작고 상태가 없으며 위험이 낮고 추가 컨텍스트가 결과를 개선하지 않는 작업에는 원시 CLI가 더 간단합니다.

## 공식 문서

현재 동작은 [워크플로 정책](workflow-policy.md), [ContextDB](contextdb.md), [빠른 시작](getting-started.md)에서 확인하세요.
