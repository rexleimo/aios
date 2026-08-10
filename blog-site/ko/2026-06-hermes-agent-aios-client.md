---
title: "Hermes Agent가 AIOS 최상위 클라이언트로 승격"
description: "AIOS가 Hermes Agent (Nous Research)를 최상위 AIOS 클라이언트로 등록했습니다. MCP 브리지 서버가 5개 코어 도구(context-pack, doctor, token compression, skill validation, skill installation)를 Hermes 세션 내에서 직접 사용 가능하게 합니다."
date: 2026-06-30
tags: ["Hermes Agent", "AIOS", "MCP", "클라이언트", "Skills", "Token Compression"]
---

# Hermes Agent가 AIOS 최상위 클라이언트로 승격

Hermes Agent(Nous Research의 오픈소스 CLI AI Agent)가 Codex CLI, Claude Code, Gemini CLI, OpenCode, Crush와 함께 AIOS의 7번째 최상위 클라이언트가 되었습니다.

이것은 단순한 설정 추가가 아닙니다. 이번 통합의 핵심은 **MCP 브리지 서버** — AIOS의 가장 가치 있는 5가지 기능을 Hermes가 직접 호출할 수 있는 MCP 도구로 노출합니다.

## Hermes Agent에 이것이 필요한 이유

Hermes에는 `session_search`, `memory`, `delegate_task`, `skill_manage`, `cronjob` 등 내장 도구가 있습니다. 하지만 다른 AIOS 클라이언트와 마찬가지로 세 가지 영역에서 체계적 지원이 부족합니다:

1. **전략적 컨텍스트 재호출** — Hermes는 세션 기록을 검색할 수 있지만 token budget 기반 우선순위 정렬 후 잘라내기는 불가능합니다. 긴 세션에서 저가치 기록이 context window를 overflow합니다.
2. **환경 헬스 자가 검진** — MCP 설정 오류, Node 버전 불일치, skill 디렉토리 손상 — 이런 무음 문제가 전체 워크플로우를 저하시키지만 Hermes에는 자동 감지/수리 수단이 없습니다.
3. **대규모 출력 압축** — 브라우저 스크린샷, 긴 shell 출력, HTML dumps가 context window에 직접 들어가면 token이 낭비됩니다. Hermes에는 중간 intercept 레이어가 없습니다.

AIOS MCP 브리지가 이 세 가지 gap을 모두 채웁니다.

## 5개 MCP 도구

`scripts/aios-mcp-server.mjs`가 새 MCP 브리지 서버입니다. 5개 도구를 노출합니다:

### aios_context_pack

token budget 대응 컨텍스트 압축. 3가지 전략:

| 전략 | 동작 | 사용 사례 |
|------|------|-----------|
| `legacy` | 끝부분 잘라내기 | 단순 시나리오, 우선순위 불필요 |
| `balanced` | 우선순위 정렬 후 잘라내기 | 일상 사용, 가장 중요한 정보 유지 |
| `aggressive` | 중요 신호만 | harness/checkpoint 모드, 최대 압축 |

```bash
aios_context_pack(query="auth bug fix history", token_budget=2000, strategy="balanced")
```

### aios_doctor_suite

전체 헬스 체크 — MCP 설정, Node 버전, ContextDB 상태, skill 디렉토리, 클라이언트 연결성. `--fix` 자동 수리 지원.

```bash
aios_doctor_suite(workspace="/path/to/project", fix=true)
```

### aios_intercept_compress

대규모 도구 출력 압축. 3가지 압축 모드:

| 모드 | 압축 수준 | 사용 사례 |
|------|-----------|-----------|
| `tight` | 밸런스 | 기본값 |
| `ultra` | 최대 | harness/checkpoints |
| `precise` | 최소 | 안전 중요 작업 |

```bash
aios_intercept_compress(text="<raw browser output>", mode="tight", tool_name="page.screenshot")
```

### aios_skill_validate

Hermes/AIOS skill 디렉토리 구조 검증 — SKILL.md frontmatter 필수 필드(name, description, version, author), 내용 완전성, 참조 파일 존재성 검사.

```bash
aios_skill_validate(skill_path="/path/to/.hermes/skills/my-skill")
```

### aios_skill_install

AIOS skill-sources에서 Hermes의 `.hermes/skills/` 디렉토리에 skill 설치. `copy`(포터블)와 `link`(로컬 개발) 두 가지 설치 모드.

```bash
aios_skill_install(skill_name="context-pack", install_mode="copy")
```

## 클라이언트 등록 정보

Hermes는 `CLIENT_DEFINITIONS`에 다음 정보로 등록됩니다:

| 속성 | 값 | 참고 |
|------|----|------|
| capabilities | skills, native, harness, superpowers | team/agents는 아직 미지원 |
| commandName | hermes | CLI 명령 |
| runtimeClientId | hermes-agent | 런타임 식별자 |
| projectSkillRoot | `.hermes/skills` | skill 설치 디렉토리 |
| instructionFileName | AGENTS.md | Hermes가 프로젝트 루트 AGENTS.md 자동 로드 |
| modelArgFlag | `--model` | 모델 선택 플래그 |
| unattendedArgs | 빈 | Hermes에 `--yolo` 모드 없음 |

MCP 설정 이중 스코프:

| 스코프 | 파일 | 참고 |
|---------|------|------|
| 프로젝트 | `.mcp.json` | Claude Code와 공유 |
| 홈 | `config.yaml` (`~/.hermes/` 내) | Hermes YAML 설정 |

## 활성화 방법

### Step 1: AIOS 설치 확인

```bash
aios doctor
```

### Step 2: Setup 실행

```bash
aios          # TUI → Setup → hermes 선택
```

또는 직접:

```bash
aios setup --client hermes
```

### Step 3: MCP 브리지 확인

```bash
aios doctor --fix
# Doctor이 aios-mcp-server를 Hermes MCP 설정에 자동 등록합니다
```

### Step 4: Hermes 내에서 사용

프로젝트에서 Hermes를 시작하면 5개 AIOS MCP 도구가 자동으로 사용 가능합니다:

```bash
hermes
# 대화 내: @aios_context_pack query="..." token_budget=2000 strategy="balanced"
```

## 다른 클라이언트와의 차이

| 특징 | Codex/Claude | Hermes |
|------|-------------|--------|
| Skills 디렉토리 | `.codex/skills` / `.claude/skills` | `.hermes/skills` |
| 지시 파일 | AGENTS.md / CLAUDE.md | AGENTS.md(공유) |
| 무인 모드 | `--yolo` / `--dangerously-skip-permissions` | 없음(`delegate_task` 사용) |
| MCP 설정 | JSON / TOML | JSON + YAML 이중 스코프 |
| Team 오케스트레이션 | 지원 | 미지원(향후 확장) |

## 다음 단계

- **Hermes 네이티브 skill 추출** — `context-pack`, `hermes-doctor` 등을 AIOS skill-sources에서 `.hermes/skills/` 형식으로 추출
- **Team 오케스트레이션 확장** — Hermes의 `delegate_task`가 이미 sub-agent dispatch를 지원; 향후 AIOS 다중 클라이언트 Team 오케스트레이션과 통합
- **ACP sub-agent 브리지** — Hermes는 ACP(예: Copilot CLI)를 지원; AIOS `delegate_task`와의 융합으로 크로스 클라이언트 오케스트레이션 가능

---

전체 가이드는 [AIOS 문서](https://cli.rexai.top/ko/)를 참조. 다중 클라이언트 워크플로우 안전성은 [Agent Governance](/blog/ko/2026-06-agent-governance/)에서 확인하세요.
