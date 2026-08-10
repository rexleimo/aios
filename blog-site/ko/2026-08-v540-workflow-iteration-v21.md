---
title: "v5.4.0: 워크플로 Iteration v2.1 — Activation 안전성, 타입 기반 Evidence 계약, 전량 Skill 감사"
description: "AIOS v5.4.0은 원자적 Activation 상태, 병렬 토큰 잠금, 타입 기반 Wayfinder/Planning Artifact 스키마, 엄격한 evidence-ref 검증, S1–S5 전체 배치 Skill 감사를 추가합니다."
date: 2026-08-01
tags: ["AIOS", "rex-harness", "워크플로", "evidence 계약", "activation store", "Skill 감사", "개발 생산성"]
---

# v5.4.0: 워크플로 Iteration v2.1 — Activation 안전성, 타입 기반 Evidence 계약, 전량 Skill 감사

> **요약:** v5.4.0은 rex 워크플로 런타임의 세 가지 사일런트 실패를 해결합니다 — 크래시 후 Activation 상태 분리, 병렬 실행 시 토큰 이중 소비, 스키마 검증을 통과하는 placeholder evidence ref. 또한 Wayfinder와 Planning Artifact의 완전한 타입 기반 스키마를 처음으로 제공하고, 전체 13개 canonical Skill에 걸친 S1–S5 감사를 완료했습니다.

## 이 릴리스가 해결하는 문제

coding agent가 워크플로 중간에 중단될 때——크래시, 네트워크 단절, 또는 병렬 호출에 의해——두 가지 일이 조용히 잘못될 수 있습니다:

1. Workflow 파일과 Activation 프로젝션 파일이 동기화에서 벗어날 수 있습니다. 토큰은 로테이션됐지만 프로젝션은 여전히 이전 명령을 보여줍니다. agent는 오래된 상태에서 재개합니다.
2. 두 개의 병렬 호출이 동일한 Command 토큰을 받고 둘 다 성공하여, 잠금 위반 없이 중복된 evidence 수락이 발생합니다.

이 두 가지 모두 이 릴리스 이전에는 명시적인 오류를 생성하지 않았습니다. 워크플로가 조용히 진행(또는 조용히 정체)될 뿐이었습니다.

세 번째 실패 유형은 구조적입니다: Wayfinder와 Planning Artifact의 evidence `ref` 필드는 `"TODO: fill in later"`와 프로토콜 프리픽스 없는 파일명을 포함한 모든 문자열을 허용했습니다. 검증 게이트는 통과하고 agent는 계속 진행했으며 검토자는 쓸 수 없는 참조를 받았습니다.

## 변경 사항

### 선행 쓰기 트랜잭션을 통한 원자적 Activation store

Activation store는 이제 라이브 상태를 건드리기 전에 pending 트랜잭션 파일을 씁니다:

```
.aios/workflow-activations/transactions/<activationId>.json.pending
```

Workflow 쓰기와 Activation 프로젝션 쓰기 사이에서 프로세스가 크래시하면, 다음 시작 시 pending 파일이 감지되고 트랜잭션이 롤 포워드됩니다. 두 쓰기가 모두 완료된 경우 pending 파일은 마지막 단계로 삭제됩니다. 롤백은 없으며 설계는 롤 포워드 전용입니다.

읽기 시, 프로젝션에 기록된 Command 토큰이 Workflow의 현재 토큰과 일치하는지도 검증합니다. 불일치가 있으면——구 코드에서 두 쓰기 사이 크래시의 징후——읽기는 불일치 상태를 반환하는 대신 `stale-activation-projection`으로 페일 클로즈됩니다.

### 단일 토큰 직렬화 잠금

per-store 파일 잠금으로 이제 두 개의 병렬 호출자가 동일한 Command 토큰을 동시에 진행하는 것이 불가능해졌습니다. 두 번째 호출자는 `AIOS_REX_STORE_BUSY`를 받고 재시도해야 합니다.

### 타입 기반 Wayfinder・Planning Artifact 스키마

이 릴리스와 함께 두 개의 새로운 도메인 모듈이 출시됩니다:

- `src/domain/wayfinder-artifact.mjs` — Navigation Map, Decision Graph, Decision Ticket, Next Slice 검증. `partial` 또는 `blocked` Wayfinder artifact는 Decision Ticket 또는 Next Slice를 선언할 수 없습니다.
- `src/domain/planning-artifact.mjs` — Delivery Ticket, Frontier(ready와 blocked는 상호 배타적, 중복 없음), Parallel Group(작업 항목은 여러 그룹에 나타날 수 없음), Convergence Gate, Runtime Artifact Contract 검증.

두 스키마 모두 `normalizeEvidenceRefs()`를 통과하며, 프로토콜 프리픽스(`artifact:`, `receipt:`, `diff:`, `command:` 등)가 없거나 알려진 placeholder 패턴(`TODO`, `TBD`, `placeholder` 등)과 일치하는 `evidenceRef`를 거부합니다.

### 신뢰할 수 있는 백업 복구

Client projection의 `recoverInterruptedArtifacts`는 이제 백업을 승격하기 전에 `projection-history.json`에서 백업 마커 다이제스트를 재검증합니다. 관리된 projection에 의해 생성되지 않았거나 마커가 변조된 백업 junction은 조용히 복원되는 대신 `interrupted-backup-untrusted`로 거부됩니다.

### Plan evidence mirror 실패 가시성

`syncEvidenceToMatchingPlan`은 이전에 플랜 파일이 없거나 불일치할 때 예외를 던졌습니다. 이제 구조화된 `planEvidence.status = 'failed'`를 반환하여, 호출자가 "Rex가 evidence를 수락했다"와 "plan mirror가 실패했다"를 구별할 수 있습니다.

### S1–S5 Skill 감사

전체 13개 canonical Skill source가 S1–S5 배치 SkillOpt eval을 완료했습니다:

| 배치 | Skills |
|---|---|
| S1 | `rex-requirements`, `rex-implement` |
| S2 | `rex-debug`, `rex-tdd` |
| S3 | `rex-wayfinder`, `rex-planning` |
| S4 | `rex-code-review` |
| S5 | `rex-design`, `rex-strict-tdd`, `rex-refactor-hardening`, `rex-minimal-construction`, `rex-test-design`, `rex-workflow` |

## 업그레이드 안내

- `rex-harness`가 `0.4.3`에서 `0.5.0`으로 올라갑니다. `recoverInterruptedArtifacts`를 직접 사용하는 경우 호출 사이트를 업데이트하세요: 두 번째 인수가 `skillId` 문자열이 아닌 `plan` 객체 `{ skillId, sourceDigest, historicalDigests }`가 되었습니다.
- 기존 `.aios/workflow-activations/` 상태는 읽기 호환입니다. 마이그레이션이 필요하지 않습니다.
- 워크플로 상태에 이미 저장된 evidence ref는 소급 재검증되지 않습니다.

## 검증

```bash
npm run test:rex
# rex 191/191  contract 38/38  integration 52/52  workflow-policy 74/74
```
