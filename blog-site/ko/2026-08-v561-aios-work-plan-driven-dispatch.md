---
title: "v5.6.1: 플랜 기반 멀티 에이전트 디스패치 — aios work가 플랜을 읽습니다"
description: "v5.6.1에서 aios work는 플랜 기반이 됩니다. 활성 구조화 플랜의 대상 태스크가 의존성·소유 경로·수용 기준을 갖춘 병렬 워크 아이템이 됩니다."
date: 2026-08-12
tags: ["AIOS", "multi-agent", "parallel", "dispatch", "planning", "release", "v5.6.1"]
---

# v5.6.1: 플랜 기반 멀티 에이전트 디스패치 — `aios work`가 플랜을 읽습니다

## Problem

[v5.6.0](2026-08-v560-aios-work-concurrent-dispatch.md)에서 `aios work`는 병렬 멀티 에이전트 코딩의 원커맨드 진입점이 되었습니다. 플랜을 세우고 분해한 뒤 planner, implementer, reviewer, security-reviewer 잡을 merge gate로 묶어 디스패치합니다. 하지만 분해 단계는 여전히 암묵적이었습니다. 워크 아이템이 태스크 제목과 `--context` 힌트에서 추측되었기 때문입니다. 의존성·소유 경로·수용 기준이 담긴 구조화 플랜이 문서로 존재해도 디스패치가 읽지 않았고, 디스패치 후 보고서가 실제 실행된 워크 아이템과 어긋날 수도 있었습니다.

## Quick Answer

**v5.6.1에서 `aios work`는 플랜 기반이 됩니다. 구조화 플랜이 활성 상태면 플랜의 대상 태스크가 그대로 병렬 워크 아이템이 됩니다.** 각 워크 아이템은 플랜의 의존성, 소유 경로(`targets` + `allowedWrites`), 수용 기준을 유지하므로 병렬 서브에이전트는 플랜이 그린 경계 그대로 작업합니다. `;`로 구분된 `--context` 폴백은 플랜 없는 실행용으로 남고, 새 `aios-work-dispatch` 스킬은 언제 병렬 디스패치가 옳은지(플랜형 작업, 독립 아이템 2개 이상, 파일 소유권 중복 없음, 엄격한 순서 없음)와 미리보기/승인 경계를 에이전트에게 가르칩니다.

## v5.6.1에서 바뀐 것

1. **플랜 태스크가 워크 아이템으로.** `aios work`가 활성 구조화 플랜을 분해해, 대상 플랜 태스크를 의존성·소유 경로(`targets` + `allowedWrites`)·수용 기준과 함께 워크 아이템으로 승격합니다.
2. **세미콜론 context는 폴백으로 유지.** 활성 플랜이 없으면 `--context "mcp-server 重构; docs 更新; 测试补充"` 방식 그대로 분해됩니다. 플랜 없는 호출은 변함없습니다.
3. **보고서가 실행된 플랜과 일치.** 디스패치 후 보고서는 플랜 기반 분해를 유지하고 워크 아이템을 재계산하지 않으므로, 보이는 최상위 `workItems`가 실제 실행된 항목입니다.
4. **에이전트가 디스패치 시점을 학습.** 새 정식 `aios-work-dispatch` 스킬이 진입 조건(planned disposition, 독립 아이템 2개 이상, 파일 소유권 중복 없음, 엄격한 순서 없음), 분해 표현법, 미리보기/승인 경계를 고정합니다.
5. **라우터가 병렬 작업을 디스패치로.** `aios-workflow-router`가 병렬 가능한 플랜형 작업을 디스패치 스킬로 라우팅해, 플랜에서 병렬 실행까지의 루프가 추측이 아닌 가르쳐진 행동이 됩니다.

## 플랜 기반 분해의 작동 방식

- **진실의 원천은 플랜.** 대상 플랜 태스크는 의존성·소유 경로·수용 기준을 스스로 지니므로 `aios work`는 자유 텍스트에서 다시 추측하지 않고 읽습니다.
- **소유권은 명시적.** 각 워크 아이템의 `targets` + `allowedWrites`가 병렬 서브에이전트를 자기 차선 안에 유지하고, merge gate는 파일 소유권 중복을 계속 차단합니다.
- **폴백은 예측 가능.** 활성 플랜이 없으면 태스크 제목과 `;` 구분 `--context` 힌트로 분해하며 v5.6.0과 완전히 동일합니다.
- **안전은 그대로.** preflight readiness, capability guard, owned-path file policy, merge gate 모두 여전히 적용됩니다. `--dry-run`은 분해된 플랜과 워크 아이템을 제로 비용으로 미리봅니다.

## Examples

```bash
# 플랜 기반: 워크 아이템은 활성 구조화 플랜에서
aios work --task "Ship the release checklist"

# 실행 전에 플랜 기반 분해 미리보기
aios work --task "Ship the release checklist" --dry-run --json

# 플랜 없는 폴백은 그대로 작동
aios work --task "Prepare the release" --context "update changelog; refresh docs; bump version"

# 결합된 플랜 태스크는 강제 직렬
aios work --task "Refactor the auth module" --serial
```

## FAQ

### 디스패치가 내 플랜을 읽는지 어떻게 확인하나요?

`aios work --task "..." --dry-run --json`은 실행 전에 분해된 워크 아이템, 의존성, 소유 경로를 출력합니다. 활성 플랜이 있으면 워크 아이템은 플랜에서 옵니다.

### 플래닝 프로세스를 대체하나요?

아니요. 플랜이 유일한 진실의 원천으로 남고 디스패치는 그 경계를 따를 뿐입니다. 구조화 플랜을 쓰는 워크플로에서 `aios work`는 새 경계를 발명하지 않고 플랜의 경계를 실행합니다.

### 언제 병렬화하면 안 되나요?

병렬 디스패치에는 독립 아이템 2개 이상, 파일 소유권 중복 없음, 아이템 간 엄격한 순서 없음이 필요합니다. 결합된 변경은 단일 차선(`--serial`)에 속합니다. 새 `aios-work-dispatch` 스킬이 정확히 이 게이트를 고정하므로 에이전트가 추측하지 않습니다.

### 승인 경계는 여전히 사람이 제어하나요?

네. 디스패치 스킬은 라이브 실행 전 미리보기를 요구합니다. `--dry-run`이 플랜 기반 워크 아이템을 제로 비용으로 검토하는 방법이며, 라이브 디스패치는 v5.6.0의 readiness, capability, ownership, merge-gate 가드를 유지합니다.

### 업그레이드 후 또는 리포지토리 이동 후 MCP 서버가 고장 났습니다

클라이언트 설정(예: `~/.config/opencode/opencode.json`)의 MCP 항목은 이 리포지토리 `scripts/` 런처의 절대 경로를 저장합니다. 프로젝트나 설치 디렉터리가 이동하면 경로가 더 이상 존재하지 않아 서버가 시작되지 않습니다. 새 프로젝트 루트에서 수정합니다:

```bash
aios internal browser mcp-migrate
# 또는: aios update   (browser 컴포넌트는 기본 업데이트 세트에 포함)
```

그런 다음 클라이언트를 재시작하세요. `aios doctor`는 런처 경로만 확인하고 다시 쓰지 않습니다. 자세한 내용: [문제 해결](https://cli.rexai.top/ko/troubleshooting/).

## Related

- [v5.6.0: 한 명령으로 병렬 멀티 에이전트 코딩 — aios work](2026-08-v560-aios-work-concurrent-dispatch.md)
- [Orchestrate Live: 프로덕션에서 Subagent 실행하기](orchestrate-live.md)
- [병렬 코딩 에이전트는 공짜가 아님: Git Worktree는 파일을 격리하지 상태를 격리하지 않습니다](2026-08-parallel-coding-agents.md)
- [Agent 거버넌스: Team 실행은 Live 전에 스스로를 증명하게 하기](2026-06-agent-governance.md)
- Docs: [Team Ops](https://cli.rexai.top/ko/team-ops/) · [Route & Concurrency Profiles](https://cli.rexai.top/ko/route-concurrency-profiles/)
