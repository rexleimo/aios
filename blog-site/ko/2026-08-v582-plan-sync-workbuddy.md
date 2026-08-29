---
title: "v5.8.2: 플랜이 더 이상 먼저 나서지 않음, AIOS가 이제 WorkBuddy를 지원"
description: "AIOS v5.8.2는 서브에이전트가 task id 없이 성공을 보고할 때 플랜이 스스로 진행되던 문제를 수정하고, WorkBuddy를 완전 지원 클라이언트로 추가합니다 — 네이티브 지시, MCP, 24/24 스킬, 그리고 동봉된 codebuddy CLI를 통한 harness 구동."
date: 2026-08-29
tags: ["AIOS", "릴리스", "플랜", "workbuddy", "harness", "안정성"]
---

# v5.8.2: 플랜이 더 이상 먼저 나서지 않음, AIOS가 이제 WorkBuddy를 지원

v5.8.2에는 두 가지가 들어갔습니다. 하나는 서브에이전트로 플랜을 돌리는 사람이라면 누구나 물린 조용한 버그입니다. 다른 하나는 AIOS가 WorkBuddy를 뒤늦은 패치가 아니라 진짜 클라이언트로 다루기 시작했다는 점입니다.

## 플랜이 스스로 앞서 나갔던 문제

서브에이전트 런타임으로 구조화된 플랜을 돌려본 적이 있다면, Agent가 실제로 손을 대기도 전에 *다음* 작업이 `in_progress`로 넘어가는 것을 봤을 수 있습니다. "완료"가 아니라 — 그냥 조용히 진행 중으로 표시되어, 플랜이 실제보다 앞서 있는 것처럼 보였습니다.

근본 원인: `syncPlanWithIterationOutcome`이 sync할 때마다 `markPlanTaskInProgress`를 호출했습니다. 서브에이전트 런타임은 성공을 보고할 때 어떤 작업을 끝냈는지 명시하지 않습니다(`phase-plan-sync.mjs`는 `taskId` 없이 `{outcome:'success', ok:true}`를 보냅니다). 묶을 id가 없으니, 예전 코드는 다음 pending 작업을 집어 올려버렸습니다. 수정: sync는 이제 증거만 기록하고, 명시적인 `taskId`가 있을 때만 움직입니다. `in_progress`를 정하는 것은 harness loop의 소유자 — sync는 그저 지켜볼 뿐입니다.

또한 죽은 코드인 `hasCommitEvidence` 헬퍼를 제거하고, `hasTargetFileChanges`의 경로 매칭 버그(절대 경로가 한 번도 매칭되지 않던)를 고쳤습니다. 테스트: plan-runtime 5/5, 전체 회귀 1064/0.

## WorkBuddy는 이제 제1급 클라이언트

이전에는 WorkBuddy가 네이티브 지시 생성만 받고 체인의 나머지는 없었습니다. 이제 끝에서 끝까지 연결됐습니다:

- 네이티브 워크플로 / 스킬 생성이 `.workbuddy/`로 출력됩니다
- MCP 설정이 `~/.workbuddy/mcp.json`에 기록됩니다(브라우저 / shell / 인증 MCP 모두 이주)
- 완전한 스킬 동기화 — 카탈로그 24/24 스킬이 모두 설치됩니다
- 동봉된 `codebuddy` CLI를 통한 solo-harness 구동: `aios harness run --provider workbuddy`가 프로바이더를 해석해 실행합니다

한 가지 주의: `codebuddy` 바이너리는 기본적으로 PATH에 없습니다. 셸 설정에 추가하세요:

```bash
export PATH="/Applications/WorkBuddy.app/Contents/Resources/app.asar.unpacked/cli/bin:$PATH"
```

## 업그레이드

```bash
aios update
```

설정 마이그레이션은 필요 없습니다. 클라이언트를 재시작하면 새로운 plan-runtime + WorkBuddy 통합이 적용됩니다.
