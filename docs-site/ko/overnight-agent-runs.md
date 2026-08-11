---
title: "코딩 에이전트를 밤새 크래시나 이탈 없이 실행하는 방법"
description: "밤새 실행되는 에이전트는 크래시, 컨텍스트 드리프트, 복구 불가능한 상태로 실패합니다. Solo Harness의 checkpoint, 검증 게이트, git worktree 격리가 코딩 에이전트를 밤새 계속 작동시키는 방법을 배웁니다."
date: 2026-08-10
schema_type: techarticle
---

# 코딩 에이전트를 밤새 크래시나 이탈 없이 실행하는 방법

> **빠른 답:** 밤새 실행되는 에이전트는 세 가지 방식으로 죽습니다: 프로세스가 크래시하거나, 컨텍스트가 작업에서 벗어나거나(드리프트), worktree 상태를 복구할 수 없게 됩니다. 해결책은 **재개 가능한 하네스**입니다: 상태를 디스크에 checkpoint하고, 모든 마일스톤을 증거로 게이트하며, 파일을 git worktree로 격리하고, 어떤 중단 후에도 마지막으로 수락된 checkpoint에서 재개합니다. AIOS의 Solo Harness(`aios harness run --objective "..." --worktree`)는 정확히 이것을 위해 만들어졌습니다.

## 밤새 실행이 실패하는 이유

| 실패 모드 | 어떤 일이 벌어지나 |
| --- | --- |
| **크래시** | 새벽 3시에 프로세스가 죽습니다; 마지막 저장 이후의 모든 것이 유실됩니다. |
| **드리프트** | 에이전트가 objective에서 시작한 뒤 인접 작업으로 표류합니다; 루프가 수렴하지 않습니다. |
| **복구 불가능한 상태** | 절반만 기록된 파일, 더러운 worktree, 무엇이 수락되었는지에 대한 기록 없음. |

세 가지 모두 모델 문제가 아니라 상태 관리 문제입니다.

## 밤새 실행을 살아남게 하는 네 가지 요소

1. **Checkpoint된 상태** — 실행이 plan, 증거, 결정을 디스크에 기록하여 재개가 처음이 아닌 마지막 수락된 마일스톤에서 시작합니다.
2. **증거 게이트** — 각 마일스톤은 다음 단계가 시작되기 전에 결정적 검사(`verification-before-completion`, doctor, contract test)를 통과해야 합니다. 이렇게 하면 드리프트가 아침에 발견되는 대신 경계에서 멈춥니다.
3. **격리** — 실행이 [git worktree](https://cli.rexai.top/ko/solo-harness/) 안에서 수행되어 병렬 또는 반복 실행이 서로의 파일을 밟지 않습니다.
4. **수렴하는 루프** — objective에 명시적 중지 조건이 있습니다; 실행은 예산이 다 떨어졌을 때가 아니라 증거가 objective 완료를 말할 때 끝납니다.

## 밤새 실행 시작 방법

```bash
# 1. Initialize AIOS in the project
aios init --all

# 2. Launch a resumable, isolated objective
aios harness run --objective "Finish the release handoff checklist" --worktree

# 3. Check on it in the morning
aios harness status
```

머신이 재시작되거나 프로세스가 죽으면 하네스는 마지막 수락된 checkpoint에서 재개됩니다. 실패 분류와 dry-run 준비 검사는 [Solo Harness 문서](https://cli.rexai.top/ko/solo-harness/)를 참조하세요.

## FAQ

**에이전트 실행에 자연스러운 중지 지점이 없으면 어떻게 하나요?**
만드세요. 수렴하는 objective("src/routes/ 아래 모든 route에서 누락된 오류 처리를 감사")는 증거 목록이 완성되면 멈춥니다. 중지 조건이 없으면 무작위 행보에 비용을 지불하는 것입니다.

**밤새 실행이 내 터미널을 막나요?**
아닙니다. `aios harness run`은 실행을 재개 가능한 objective로 관리하므로 세션을 닫고 나중에 재개할 수 있습니다.

**worktree 격리가 필수인가요?**
실행이 실제로 파일을 병렬로 기록할 때만 필요합니다. 단일 밤새 실행에서도 여전히 가장 안전한 기본값입니다——실행이 수락될 때까지 작업 트리를 깨끗하게 유지합니다.

## 다음 단계

전체 실패 분류는 [Solo Harness](https://cli.rexai.top/ko/solo-harness/)를 읽거나, route가 실행을 어떻게 게이트하는지 이해하려면 [Workflow Policy](https://cli.rexai.top/ko/workflow-policy/)를 보세요.
