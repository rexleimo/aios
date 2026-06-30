---
title: 개요
description: Harness CLI는 codex, claude, gemini, opencode에 기억, 협업, 검증을 추가합니다. 워크플로우는 변경되지 않습니다.
---

# Harness CLI (AIOS)

> 로컬 agent 워크플로 레이어. `codex` / `claude` / `gemini` / `opencode` 에 기억, 협업, 검증을 추가합니다.

같은 명령어를 계속 사용합니다. 워크플로우는 변하지 않습니다. 다만 agent에게 뇌, 팀, 자기 진단이 추가될 뿐입니다.

[3분에 시작하기](getting-started.md){ .md-button .md-button--primary }
[실제 보기](use-cases.md){ .md-button }

## 핵심 기능

| 기능 | 설명 | 명령어 |
|---|---|---|
| **ContextDB** | 이벤트, 체크포인트, 컨텍스트 패킷을 가진 크로스 세션 프로젝트 메모리 | `codex` / `claude` / `gemini` / `opencode` 가 자동 로드 |
| **Memo Storage** | Git 친화적인 프로젝트 노트. 기본 추가 전용 파일 스토리지 plus 선택적 분할 파일 스토리지 | `aios memo add "note"` / `aios memo storage status` |
| **Native Route Shortcuts** | single/subagent/team/harness 레인용 클라이언트 네이티브 경로 프롬프트 | Claude/Gemini/OpenCode: `/team <task>`; Codex: `/prompts:team <task>` |
| **Native Token Compression** | RTK/Caveman 패턴에 영감을 받은 자체 입력/출력 감소. 경쟁 도구는 설치하지 않음 | `context:pack --token-budget 1200 --token-strategy balanced` |
| **Model Router** | Agent Team을 위한 지능형 멀티모델 디스패치. 능력, 비용, 성공률로 태스크 매칭 | `node scripts/aios.mjs model-router route --task "..."` |
| **Codemap** | Tree-sitter 코드 지식 그래프 — 단일 명령어로 모든 에이전트가 코드베이스 구조를 즉시 이해 | `aios internal codemap install` / `doctor` |
| **Agent Team** | HUD 추적, smoke 증거, governance check 가 있는 멀티 agent 병렬 협업 | `aios team 3:codex "task description"` / `node scripts/aios.mjs agents smoke --json` |
| **Solo Harness** | 재개 지원과 런 저널이 있는 단일 agent 야간 태스크 | `aios harness run --objective "goal" --worktree` |
| **Perception** | 콘텐츠 성과 추적 + 통계 인사이트 + perception 주입 | `aios perception record` / `insights` / `summary` |
| **Browser MCP** | CDP 기반 스텔스 브라우저 자동화 | `aios internal browser doctor` |
| **Hermes Agent** | 7번째 AIOS 클라이언트, MCP 브리지가 5개 AIOS 도구 노출 | `aios setup --client hermes` → Hermes에서 `@aios_context_pack` |
| **Superpowers** | 재사용 가능한 워크플로 스킬 (brainstorm/plan/debug/verify) | TUI에서 선택 |
| **Privacy Guard** | 공유 전 민감 파일 자동 리덕션 | `aios privacy status` |

## 동작 원리

```text
User → codex / claude / gemini / opencode
     → zsh wrapper (투명)
     → ctx-agent.mjs (ContextDB 통합)
        → contextdb CLI (기억 영속화)
        → launch native CLI (context pack 포함)
     → browser MCP (선택적 브라우저 자동화)
```

설치 후에는 평소처럼 `codex`, `claude`, `gemini`, `opencode` 를 사용하면 됩니다. Harness CLI가 백그라운드에서 프로젝트 기억을 자동 로드하고 클라이언트가 지원하는 곳에 경로 단축키를 프로비저닝합니다.

## 빠른 둘러보기

```bash
# TUI 실행
aios

# Git 친화적인 프로젝트 메모 저장
aios memo add "Remember to keep auth tests strict"
aios memo storage status

# 설정 후 네이티브 클라이언트 내 경로
# Claude/Gemini/OpenCode: /team <task>
# Codex: /prompts:team <task>

# 멀티 agent 협업
aios team 3:codex "Refactor the auth module and run tests"

# 단일 agent 야간 태스크
aios harness run --objective "Finish the handoff docs for tomorrow" --worktree

# 지능형 모델 라우팅
node scripts/aios.mjs model-router route --task "Review auth.js for security issues"

# 네이티브 token 압축 ContextDB 패킷
cd mcp-server && npm run contextdb -- context:pack --session <session_id> --token-budget 1200 --token-strategy balanced

# 콘텐츠 성과 추적
aios perception record --content-id note_001 --platform xiaohongshu --content-type note --title "Test" --metrics '{"likes":100}'

# 태스크 상태 확인
aios team status --provider codex --watch
```

## 처음 오셨나요?

**시작하려면:** [퀵스타트](getting-started.md) — 설치, 설정, 첫 agent 실행을 약 3분에.

**이미 설정됨?** 필요한 곳으로 이동:

| 하고 싶은 것 | 이동 |
|---|---|
| agent에 프로젝트 기억 부여 | [ContextDB](contextdb.md) |
| 여러 agent 함께 사용 | [Agent Team](team-ops.md) |
| 한 agent를 밤새 실행 | [Solo Harness](solo-harness.md) |
| 태스크를 지능적으로 라우팅 | [Model Router](model-router.md) |
| token 사용량 줄이기 | [Token Compression](token-compression.md) |
| 적절한 명령어 찾기 | [시나리오별 명령어](use-cases.md) |

## 요구사항

- Git
- Node.js 24 LTS + npm
- Windows: PowerShell 5.x or 7

## 개발

```bash
git clone https://github.com/rexleimo/harness-cli.git
cd harness-cli
```

확인:

```bash
cd mcp-server
npm test
npm run typecheck
npm run build
```

## 문서

- [퀵스타트](getting-started.md) — 설치, 설정, 첫 실행
- [Model Router](model-router.md) — Agent Team을 위한 멀티모델 디스패치
- [ContextDB](contextdb.md) — 프로젝트 메모리 시스템
- [Agent Team](team-ops.md) — 멀티 agent 협업과 workflow governance 가이드
- [Solo Harness](solo-harness.md) — 야간 태스크 가이드
- [Perception](perception.md) — 콘텐츠 성과 추적 & 인사이트
- [아키텍처](architecture.md) — 시스템 아키텍처
- [문제 해결](troubleshooting.md) — 일반적인 문제
- [사용 사례](use-cases.md) — 시나리오별 명령어 찾기

## 블로그 하이라이트

- [AIOS RL Training System](/blog/ko/rl-training-system/)
- [Agent Governance: Team live 실행 전에 증거 남기기](/blog/ko/2026-06-agent-governance/)
- [ContextDB Search Upgrade](/blog/ko/contextdb-fts-bm25-search/)
- [Windows CLI Startup Stability](/blog/ko/windows-cli-startup-stability/)
- [Orchestrate Live](/blog/ko/orchestrate-live/)
