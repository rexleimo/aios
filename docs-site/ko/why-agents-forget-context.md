---
title: "AI 코딩 에이전트가 세션 사이에 컨텍스트를 잊어버리는 이유 (그리고 해결 방법)"
description: "코딩 에이전트는 각 CLI 실행이 빈 윈도우로 시작하기 때문에 세션 사이에 컨텍스트를 잃습니다. 로컬 프로젝트 메모리(ContextDB)가 데이터를 서버로 보내지 않고 Claude Code, Codex, Gemini CLI, OpenCode에 지속적인 메모리를 주는 방법을 배웁니다."
date: 2026-08-10
schema_type: techarticle
---

# AI 코딩 에이전트가 세션 사이에 컨텍스트를 잊어버리는 이유 (그리고 해결 방법)

> **빠른 답:** 코딩 에이전트가 세션 사이에 컨텍스트를 잊는 이유는 모든 새 세션이 빈 프롬프트 윈도우로 시작하기 때문입니다——이전 결정, 파일 맵, 제약이 대화에 없습니다. 해결책은 지속적인 **로컬 프로젝트 메모리**입니다: 결정, checkpoint, 검색 가능한 컨텍스트를 프로젝트의 디스크에 저장하고, 에이전트가 필요할 때 필요한 것을 pull하게 하세요. AIOS는 이것을 `codex`, `claude`, `gemini`, `opencode`, `hermes`, `grok`와 함께 작동하며 프로젝트 데이터를 서버로 보내지 않는 pull 기반 메모리 저장소인 ContextDB로 제공합니다.

## 문제: 모든 세션은 새 기억상실증 환자

어제 작업한 프로젝트에서 `codex`나 `claude`를 엽니다. 에이전트는 다음을 기억하지 못합니다:

- 합의한 아키텍처 결정,
- 당신이 시행하는 네이밍 컨벤션,
- 쫓고 있던 실패하는 테스트,
- "생성된 dist 디렉터리는 절대 건드리지 마라"라는 제약.

에이전트는 파일을 다시 읽고, 다시 물어보고, 최악의 경우 지난주 결정과 모순되는 결정을 내리며 이 모든 것을 재발견합니다. 이것은 모델 품질 문제가 아닙니다. **컨텍스트 가용성 문제**입니다: 정보는 저장소에 존재하지만, 아무것도 올바른 시점에 대화로 끌어올리지 않습니다.

## "README 붙여넣기"가 해결책이 아닌 이유

순진한 임시방편——전체 프로젝트 컨텍스트를 모든 프롬프트에 붙여넣기——은 단순한 이유로 실패합니다: 컨텍스트는 예산입니다. 10,000줄 프로젝트 요약은 모델의 주의 예산을 익사시키고 상용구에 토큰을 태웁니다. 필요한 것은 **선택적 회상**입니다: 프로젝트가 무엇을 결정했는지 아는 저장소에서, 올바른 순간에, 올바른 몇 백 개의 토큰입니다.

## 해결책: pull 기반 로컬 프로젝트 메모리 (ContextDB)

AIOS의 [ContextDB](https://cli.rexai.top/ko/contextdb/)는 세 가지 구성 요소로 이루어진 프로젝트 로컬 메모리 저장소입니다:

| 구성 요소 | 역할 |
| --- | --- |
| **Memo** | 지속적인 결정이나 제약을 저장합니다: `aios memo add "Keep auth tests strict"`, 그런 다음 이후 어떤 세션에서든 `aios memo search "auth"`. |
| **Checkpoints** | 세션 상태를 기록하여 재개된 실행이 처음이 아닌 마지막 세션이 멈춘 지점에서 계속됩니다. |
| **검색 가능한 packs** | 관련 컨텍스트(문서, plan, 결정)를 에이전트가 요청 시 pull할 수 있는 제한된 검색 가능 단위로 묶습니다. |

ContextDB는 **pull 기반**입니다: 어떤 것도 모든 프롬프트에 주입되지 않습니다. 에이전트는 작업이 필요할 때 관련 자료를 검색하거나 회상합니다. 그렇게 프롬프트 예산을 작게 유지하고 메모리를 세션 전반에 걸쳐 지속시킵니다.

## 2분 안에 설정하는 방법

```bash
# 1. Install and initialize in your project root
curl -fsSL https://github.com/rexleimo/aios/releases/latest/download/aios-install.sh | bash
source ~/.zshrc
aios init --all

# 2. Verify ContextDB and client sync
aios doctor --native --verbose

# 3. Start saving decisions
aios memo add "Authentication tests must stay strict"
aios memo search "authentication"
```

그런 다음 같은 프로젝트에서 `codex`, `claude`, `gemini`, `opencode`, `hermes`, `grok` 중 하나를 엽니다——에이전트는 중요한 순간에 메모리를 찾습니다.

## 내 코드를 서버로 보내나요?

아닙니다. ContextDB는 프로젝트 안의 `.aios/context-db/`에 모든 것을 저장합니다. 엔진, 메모리, 토큰 압축(RTK / Caveman / Headroom), 브라우저 모두 로컬에서 실행됩니다. 데이터는 머신을 떠나지 않습니다. 자세한 내용은 [프라이버시 가드 사례 연구](https://cli.rexai.top/ko/case-privacy-guard/)를 참조하세요.

## FAQ

**같은 프로젝트에서도 에이전트가 세션 사이에 잊는 이유는 무엇인가요?**
각 CLI 세션이 새로운 프롬프트 윈도우로 시작하기 때문입니다. 어떤 것이 끌어올리지 않는 한 세션에는 어제의 결정으로 연결되는 것이 없습니다——그것이 프로젝트 메모리의 역할입니다.

**ContextDB는 벡터 데이터베이스와 같은가요?**
아닙니다. ContextDB는 명시적 거버넌스가 있는 구조화되고 검색 가능한 프로젝트 메모리(memo, checkpoint, pack)를 저장합니다——무엇을 기억하고 무엇을 제거할지 선택합니다.

**Claude Code와 작동하나요?**
네. ContextDB는 client 중립적입니다: 같은 프로젝트 마커를 통해 codex, claude, gemini, opencode, hermes, grok와 작동합니다.

## 다음 단계

전체 [ContextDB 문서](https://cli.rexai.top/ko/contextdb/)를 읽거나 [Quick Start](https://cli.rexai.top/ko/getting-started/)를 시도해 오늘 프로젝트에 메모리를 시작하세요.
