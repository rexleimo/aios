---
title: "v5.8.0: AIOS의 안전한 자기 진화 — Session Memory, 증거 게이트, 롤백 가능한 승격"
description: "AIOS v5.8.0은 끊겨 있던 memo 트리거 체인을 연결하고 결정적 검증, 카나리 승격, 감사 기록, 롤백을 갖춘 자기 진화 파이프라인을 추가합니다."
date: 2026-08-22
tags: ["AIOS", "release", "self-evolution", "memory", "governance", "memo", "dream"]
---

# v5.8.0: AIOS의 안전한 자기 진화

AIOS v5.8.0은 완료된 작업에서 경험을 학습하되, 에이전트가 프로덕션 동작을 마음대로 바꾸지 못하게 하는 릴리스입니다.

## 끊겨 있던 memo 트리거 체인 연결

기존에는 일반적인 세션 종료 시 checkpoint만 저장되고 `autoMemoSessionClose()`가 호출되지 않았습니다. 그래서 수동으로 session close를 실행하지 않으면 후보가 거의 만들어지지 않았고, dream 통합도 오랫동안 실행되지 않았습니다.

이제 흐름은 명시적입니다.

```text
session end -> candidate -> trigger/status -> dream proposal
-> deterministic verdict -> approval/canary -> telemetry -> rollback/stable
```

candidate는 active shared memory에 직접 공개되지 않고 항상 검토 가능한 상태로 남습니다.

## 주요 변경

- 정상 종료, 중단, timeout, 예외 종료를 하나의 멱등 finalizer로 처리합니다.
- `manual`, 후보 수 `threshold`, `schedule` 기반 evolution trigger를 제공합니다.
- `aios evolution status`가 후보 수, cooldown, 다음 실행 가능 시각, 실행되지 않은 이유를 보여줍니다.
- schema, provenance, scope, 안전성, baseHash, replay, holdout, 회귀, memory conflict를 JSON verdict로 평가합니다.
- `candidate -> reviewing -> validated -> proposed -> approved -> canary -> active -> stable` 상태 머신을 추가했습니다.
- 감사 이벤트, 이전 stable 버전, canary, rollback을 기록합니다.
- patch/minor/major, stable/beta/dev 채널, 보안 업데이트와 알림 중복 제거를 지원합니다.

## 업그레이드

```bash
aios update --check
aios evolution status
```

기존 memo 데이터 마이그레이션은 필요하지 않습니다. `update allowed`는 정책상 업데이트 흐름에 들어갈 수 있다는 뜻일 뿐, Agent가 사용자 승인 없이 설치한다는 뜻은 아닙니다.

AIOS의 자기 진화는 몰래 자신을 수정하는 것이 아닙니다. 증거를 모으고, 범위가 제한된 후보를 제안하고, 재현 가능한 검증을 거쳐, 언제든 되돌릴 수 있는 버전 기록으로 보존하는 것입니다.
