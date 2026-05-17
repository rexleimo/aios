---
title: "Solo Harness: Agent 에게 작업을 맡기고 주무세요, 아침에 결과를 확인하세요"
description: "AIOS 1.7 에서 도입한 무인 agent 실행 — 실행 저널, 중지/재개 제어, git worktree 격리까지."
date: 2026-04-26
tags: ["AIOS", "Solo Harness", "장시간 agent", "ContextDB"]
---

# Solo Harness: Agent 에게 작업을 맡기고 주무세요, 아침에 결과를 확인하세요

Coding agent 는 짧은 작업에 강합니다. "이 버그 고쳐줘", "이 함수 작성해줘", "이 파일 리팩터링해줘" — 몇 분이면 끝나죠.

하지만 더 큰 목표는 어떨까요? "인증 모듈 전체를 리팩터링하고 테스트도 작성해줘." 몇 시간이 걸릴 작업입니다. 옆에서 지켜볼 수는 없죠.

**Solo Harness 를 사용하면 큰 작업을 넘겨주고 완료될 때 돌아오면 됩니다.**

## 예전 방식 vs 새로운 방식

**예전:** 긴 작업을 실행하고, 잠자리에 들고, 아침에 일어나면... 뭔가가 되어 있었습니다. 완료되었을 수도, 멈췄을 수도, git 히스토리가 엉망이 되었을 수도 있습니다. 무슨 일이 일어났는지 알 수 없었죠.

**이후:** `--worktree` 로 harness 실행을 시작하고, 잠자리에 들고, 아침에:

- **실행 저널** 을 확인해 정확히 무슨 일이 있었는지 확인
- **구조화된 상태** 를 확인해 완료되었는지 확인
- 멈추었다면 멈춘 지점에서 **재개**
- 엉뚱한 방향으로 갔다면 **worktree 를 삭제** — 메인 브랜치는 그대로

## 작동 방식

```bash
# 저녁: 실행 시작
aios harness run \
  --objective "인증 모듈을 리팩터링하고 통합 테스트 작성" \
  --session nightly-auth \
  --worktree

# 아침: 무슨 일이 있었는지 확인
aios harness status --session nightly-auth --json

# 완료되었다면: 변경사항 리뷰
aios hud --session nightly-auth

# 멈추었다면: 문제를 해결하고 재개
aios harness resume --session nightly-auth --max-iterations 10
```

## `--worktree` 가 중요한 이유

`--worktree` 플래그는 중요합니다. Agent 가 자유롭게 변경할 수 있는 별도의 레포 복사본을 만듭니다.

- **좋은 결과?** worktree 를 메인 브랜치에 병합
- **나쁜 결과?** worktree 만 삭제하면 됩니다 — 코드에 영향 없음

`git reset --hard` 도 필요 없고, 위험한 정리도 필요 없습니다. 안전한 격리뿐입니다.

## 무엇이 기록되는가

모든 harness 실행은 저널을 작성합니다:

```
memory/context-db/sessions/<session-id>/artifacts/solo-harness/
  ├── objective.md           # 요청한 목표
  ├── run-summary.json       # 현재 상태와 진행률
  ├── control.json           # 중지 요청과 메모
  ├── iteration-0001.json    # 각 반복에서 일어난 일
  └── iteration-0001.log     # 상세 로그
```

이것은 **읽을 수 있는 인계 기록** 을 제공합니다 — "agent 가 한동안 실행되었다"가 아니라, 정확히 무엇을 했고, 무엇이 잘 되었고, 무엇이 안 되었는지 알 수 있습니다.

## Solo Harness 를 사용해야 할 때

**사용하세요:**
- 시간이 오래 걸리는 명확한 목표가 하나 있을 때
- 작업을 여러 agent 에 나눌 필요가 없을 때
- 지켜보는 대신 결과를 기다리고 싶을 때

**사용하지 마세요:**
- 작업을 독립적인 부분으로 나눌 수 있을 때 ([Agent Team](https://cli.rexai.top/ko/team-ops/) 을 대신 사용)
- 아직 요구사항을 정리하는 중일 때 (일반 세션으로 시작)
- 품질 게이트가 있는 단계별 실행이 필요할 때 (orchestrate 를 사용)

## 직접 해보세요

```bash
# 모든 것이 준비되었는지 dry run 으로 확인
aios harness run \
  --objective "결제 모듈에 대한 통합 테스트 작성" \
  --session test-dry \
  --worktree \
  --dry-run --json

# 준비되었다면 실제 실행
aios harness run \
  --objective "결제 모듈에 대한 통합 테스트 작성" \
  --session payment-tests \
  --worktree \
  --max-iterations 20
```

---

*Solo Harness 는 AIOS 1.7 에 포함되어 있습니다. [전체 문서](https://cli.rexai.top/ko/solo-harness/)를 읽거나 오늘 밤 직접 시도해 보세요.*
