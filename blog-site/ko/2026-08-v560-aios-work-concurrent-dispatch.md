---
title: "v5.6.0: 병렬 멀티 에이전트 코딩을 한 줄의 명령으로 — aios work"
description: "v5.6.0에 aios work 추가: 한 줄의 명령으로 모든 작업을 계획된 동시 멀티 에이전트 디스패치로 전환 — plan, implement, review, security-check를 병렬 실행하고 merge gate로 수렴. 단일 에이전트 직렬 대기 불필요."
date: 2026-08-11
tags: ["AIOS", "multi-agent", "parallel", "orchestration", "release", "v5.6.0"]
---

# v5.6.0: 병렬 멀티 에이전트 코딩을 한 줄의 명령으로 — `aios work`

## 문제

단일 코딩 에이전트는 직렬로 동작합니다: 계획, 수정, 리뷰, 반복. 모든 단계가 같은 프로세스를 기다리므로, 독립된 세 부분으로 이루어진 작업은 한 부분의 세 배 시간이 걸립니다. AIOS에는 이미 병렬 멀티 에이전트 오케스트레이션(`aios orchestrate`)이 있었지만 opt-in이고 환경 변수 게이트가 있으며 여러 플래그가 필요했습니다. 그래서 일상 작업의 대부분은 여전히 단일 에이전트로 실행되었습니다.

## 빠른 답변

**`aios work`는 작업 설명을 동시 멀티 에이전트 디스패치로 바꾸는 한 줄의 명령입니다.** 작업을 계획하고 독립 작업 항목으로 분할한 뒤 planner, implementer, reviewer, security-reviewer를 병렬 실행(기본 동시성 3)하고 안전한 merge gate로 결과를 수렴합니다. CLI 호출 한 번이면 끝납니다. live 실행은 기본으로 켜져 있고, `--dry-run`으로 계획을 미리 보고, `--serial`로 안전한 직렬 실행을 강제할 수 있습니다. 기존 오케스트레이션 엔진을 감싼 것뿐이라 새 부품은 없습니다. 증거, 소유권, merge gate 가드는 모두 그대로 적용됩니다.

## 실행 단계

1. AIOS를 v5.6.0으로 업그레이드합니다(`aios update`).
2. 한 줄의 명령으로 작업 실행:

```bash
aios work --task "Ship the release checklist"
```

3. live 전에 미리 보기:

```bash
aios work --task "Ship the release checklist" --dry-run --json
```

4. 결합도가 높은 작업은 직렬 실행 강제:

```bash
aios work --task "Refactor the auth module" --serial
```

5. 동시성과 클라이언트 조정:

```bash
aios work --task "Review auth, update tests, write docs" --client codex-cli --concurrency 4
```

## 디스패치 작동 방식

- **자동 분해.** 작업 제목과 `--context` 힌트를 소유권 힌트(`docs/`, `scripts/tests/`, `mcp-server/src/`)가 붙은 작업 항목으로 나눕니다.
- **DAG 실행.** plan과 implement 단계는 직렬로, review와 security-review는 병렬로 실행합니다. merge gate가 handoff, 파일 소유권, 읽기 전용 리뷰 규칙을 검증한 뒤에만 병합합니다.
- **유계 병렬성.** `aios work`는 기본적으로 서브에이전트 3개를 동시 실행합니다(`--concurrency N`으로 변경, `--serial`로 1로 축소).
- **안전성은 낮추지 않습니다.** preflight readiness, capability manifest, owned path prefixes, file policy, merge gate가 모두 적용됩니다. 알 수 없는 능력 면에 대한 live 실행은 `--force`로 명시적으로 수용하지 않는 한 거부됩니다. 기존 `aios team` / `aios orchestrate --execute live` 경로와 완전히 동일합니다.
- **단계별 모델 라우팅.** planner, implementer, reviewer, security-reviewer 작업은 기본적으로 model router를 통해 각자 모델을 해석합니다.

## 예시

```bash
# 기본: live 동시 디스패치(동시성 3, merge gate 수렴)
aios work --task "Refactor mcp-server and add tests"

# 제로 비용 미리 보기(모델 클라이언트 기동 안 함)
aios work --task "Ship the release checklist" --dry-run --json

# 다중 작업 항목 분해 힌트(세미콜론 / 줄바꿈 구분)
aios work --task "Prepare the release" --context "update changelog; refresh docs; bump version"

# 세션 기반 재개 / blocked 리플레이
aios work --task "Ship the release checklist" --session codex-cli-20260811T... --retry-blocked
```

## 왜 `aios team`이나 `aios orchestrate`를 안 쓰나요?

그들은 그대로 존재하고 동작도 변하지 않습니다. `aios work`는 같은 엔진에 **일상 사용 기본값**을 붙인 것입니다: live 기본 활성, 한 줄의 명령, 기억할 환경 변수 없음. `aios team`은 여전히 상태/이력/관측 뷰이고, `aios orchestrate`는 완전히 명시적인 제어 표면입니다.

## FAQ

### `aios work`가 실제로 모델 클라이언트를 기동하나요?

네. live 모드는 실제 원샷 서브에이전트(codex, claude, gemini, opencode — `--client` / `AIOS_SUBAGENT_CLIENT`로 지정)를 실행합니다. 제로 비용 미리 보기는 `--dry-run`, 모델 호출 없이 파이프라인을 시험하려면 `AIOS_SUBAGENT_SIMULATE=1`을 설정하세요.

### 병렬 디스패치가 내 작업 공간에 안전한가요?

`aios team`과 동일한 가드가 적용됩니다: preflight readiness, capability manifest 검사, owned-path file policy, 병렬 출력 간 파일 소유권 중복을 차단하는 merge gate. 결합도가 높은 작업은 언제든 `--serial`로 직렬로 되돌릴 수 있습니다.

### rex workflow의 Command 선택을 대체하나요?

아니요. `aios work`는 병렬 디스패치 레인입니다. rex workflow(동시에 하나의 current Command)는 여전히 단계별 Provider 선택을 담당합니다. 둘은 직교합니다.

### 지원되는 클라이언트는?

`codex-cli`, `claude`, `gemini`, `opencode` — subagent runtime과 동일한 클라이언트 세트입니다. 기본값은 `codex-cli`입니다.

### 속도는 원하지만 비용은 제한하고 싶어요. 무엇을 쓰면 되나요?

`aios work --task "..." --concurrency 2`로 live 병렬성을 제한하고, `--dry-run`으로 DAG와 작업 항목을 먼저 미리 보고, `aios learn-eval`로 이전 디스패치 증거를 다음 실행 권장으로 바꾸세요.

## 관련 문서

- [Orchestrate Live: 프로덕션에서 서브에이전트 실행](orchestrate-live.md)
- [병렬 코딩 에이전트는 공짜가 아니다: Git Worktree는 파일을 격리하고 상태는 격리하지 않는다](2026-08-parallel-coding-agents.md)
- [Agent Governance: Team 실행은 live 전에 스스로 증명한다](2026-06-agent-governance.md)
- 문서: [Team Ops](https://cli.rexai.top/ko/team-ops/) · [Route & Concurrency Profiles](https://cli.rexai.top/ko/route-concurrency-profiles/)
