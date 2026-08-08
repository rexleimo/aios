---
title: "v5.5.1: 증거 기반 Agent 라이프사이클 승격"
description: "v5.5.1은 Agent 승격의 하드코딩 병목을 제거하고 모든 canonical role을 smoke 대상으로 삼아 검증된 evidence로 live workflow에 진입하게 합니다."
date: 2026-08-08
tags: ["Harness CLI", "agents", "smoke", "workflow", "release"]
---

# v5.5.1: 증거 기반 Agent 라이프사이클 승격

v5.5.0은 Agent live smoke evidence를 도입했지만 catalogue에는 여전히 6개 Agent만 허용하는 하드코딩 승격 목록이 남아 있었습니다. 유효한 smoke, provenance, 양방향 metrics가 있어도 candidate로 남는 문제였습니다.

## 변경 사항

- `agents smoke`가 기본적으로 19개 canonical Agent role 전체를 검사합니다.
- 관리형 evidence가 검증되면 모든 canonical Agent가 `projected`로 승격됩니다.
- 잘못되거나 부족한 evidence는 계속 fail-closed로 처리됩니다.
- status가 Agent blocker와 quality-gate blocker를 구분합니다.
- macOS `/var`와 `/private/var` 경로 차이를 테스트에서 canonicalize합니다.

## 검증

Codex로 19개 Agent 전체 smoke가 통과했습니다. Rex workflow policy 74/74, Rex integration 52/52, 루트 전체 테스트는 1023 passed, 10 skipped, 0 failed입니다.
