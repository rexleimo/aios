---
title: "AIOS Skills 설치 경험 업데이트: Global/Project 스코프 및 더 명확한 선택기"
description: "이 업데이트는 skills 설치/제거 경험을 개선하고, canonical source를 skill-sources/로 통합하며, 기본 설치 모드를 이식 가능한 복사로 전환하고, Node 런타임 베이스라인을 22 LTS로 표준화했습니다."
date: 2026-03-17
tags: [AIOS, Skills, TUI, 온보딩, AI Development]
---

# AIOS Skills 설치 경험 업데이트: Global/Project 스코프 및 더 명확한 선택기

이번 이터레이션은 두 가지 실용적인 문제에 집중했습니다:

1. 모든 스킬이 모든 프로젝트에 기본으로 표시될 필요는 없습니다. 특히 강력한 비즈니스 또는 레포 고유 의미를 가진 스킬에 대해서는 더욱 그렇습니다.
2. '스킬 소스 파일'과 '설치된 스킬 대상'을 동일한 디렉터리 트리에 유지하면跨머신/跨프로젝트 동기화가 점점 유지하기 어려워집니다.

이를 해결하기 위해 AIOS는 skills 라이프사이클(설치/제거/동기화)을 정리하고 다음과 같은 경계를 명확히 했습니다:

- 시스템 핵심 기능
- 옵션 확장
- canonical source tree
- 생성된 호환 출력

## Canonical Source Tree가 `skill-sources/`로 이동

canonical skill 작성 소스는 더 이상 `.codex/skills` 나 `.claude/skills`가 아닙니다.

새로운 계약:

- `skill-sources/` 가 canonical source tree입니다
- `.codex/skills`, `.claude/skills`, `.agents/skills`, `.gemini/skills`, `.opencode/skills` 가 생성된 호환 트리입니다
- repo-local 호환 트리는 `node scripts/sync-skills.mjs`로 작성/업데이트됩니다

즉: 머신 간/프로젝트 간 스킬을 복사할 때는 특정 클라이언트 디렉터리가 아닌 `skill-sources/`를 진리의 원천으로 취급하세요.

또한 `node scripts/check-skills-sync.mjs`가 이제 릴리스 사전 확인의 일부가 되어 생성 출력이 canonical source tree에서 은밀히 벗어날 수 없습니다.

## Global vs Project 스코프 설치

Skills 설치는 이제 명시적 스코프 선택을 지원합니다:

- `global`: 사용자 단위 디렉터리에 설치（예: `~/.codex/skills`）
- `project`: 현재 레포지토리 디렉터리에 설치（현재 `pwd`）

이를 통해 범용 방법론 스킬은 글로벌로 유지하면서 강력하게 비즈니스/레포 결합된 스킬은 단일 프로젝트에 스코프할 수 있습니다.

## 카탈로그 중심 설치（「모두 스캔하여 설치」가 아닌）

설치는 이제 디렉터리 아래에서 발견된 것에 관계없이 선별된 카탈로그로 구동됩니다.

실용적 결과:

- 의도치 않은 도구 오염 감소
- TUI에서 '무엇이 왜 설치되었는지' 가시성 명확해짐
- 새 프로젝트 온보딩 시 더 안전한 기본값

## 관련 링크

- 문서: `/superpowers/`
- 레포: <https://github.com/rexleimo/aios>
