---
title: "고급 디자인 스킬 페이지 제작: 모호한 프롬프트를 실전 UI로"
publish_date: 2026-04-18
description: "DESIGN.md와 frontend-design 조합으로 짧고 모호한 요청에서도 일관된 고품질 UI/UX를 만드는 실전 가이드입니다. 비주얼 계약 템플릿, 수용 체크리스트, 재작업이 생기는 전형적 원인을 담아 프런트엔드와 디자인의 협업에 적합합니다."
---

# 고급 디자인 스킬 페이지 제작: 모호한 프롬프트를 실전 UI로

사용자 요청은 보통 짧고 모호합니다:

- "이 섹션 좀 더 좋게 해줘"
- "Stripe 느낌으로 바꿔줘"
- "SaaS 어드민 전체를 만들어줘"

스타일 계약 없이 구현하면 결과가 템플릿처럼 평범해지기 쉽습니다.
해결 방법은 간단합니다. 먼저 스타일을 고정하고, 그다음 구현합니다.

## 두 스킬 조합

1. `awesome-design-md` - `DESIGN.md` 스타일 계약 생성
2. `frontend-design` - 계약 기준으로 실제 UI 구현

코드 생성 전에 시각 방향을 잠그면 품질 흔들림이 크게 줄어듭니다.

## 빠른 설정

```bash
node <AIOS_ROOT>/scripts/aios.mjs setup --components skills --client codex --scope project --skills awesome-design-md,frontend-design
npx --yes getdesign@latest add linear --force
```

고정 프롬프트:

```text
먼저 DESIGN.md로 스타일을 고정하고, 그다음 frontend-design으로 페이지를 구현해 주세요.
```

## 모호한 입력 처리: 3가지 모드

- `Patch`: 요소 단위의 부분 개선
- `Restyle`: 구조 유지 + 시각 언어 교체
- `Flow`: SaaS 업무 흐름 전체 화면 구성

먼저 모드를 정하고, 짧은 가정(목표, 사용자, 플랫폼, 범위)을 적은 뒤 구현합니다.

## SaaS 납품 최소 기준

`Flow` 요청은 최소한 아래를 포함해야 합니다:

- 대시보드
- 목록
- 상세
- 생성/수정 폼
- 설정/결제 상당 페이지
- 상태: `loading`, `empty`, `error`, `success`
- 상호작용 상태: `hover`, `focus`, `active`, `disabled`

이 기준이 있어야 화면 조각만 있는 데모를 피할 수 있습니다.

## 기본 스타일 선택

- SaaS/B2B: `linear`, `vercel`, `supabase`
- 마케팅: `framer`, `stripe`, `notion`
- 문서: `mintlify`, `hashicorp`, `mongodb`

도메인 힌트가 없으면 `linear`부터 시작합니다.

## 제품 기본값으로 넣을 문구

다음 시스템 프롬프트를 기본 탑재하면 안정적입니다:

```text
사용자 의도가 모호하면 먼저 Patch/Restyle/Flow로 분류하세요. DESIGN.md로 스타일을 고정한 뒤 구현하고, hover/focus/active/disabled 및 loading/empty/error/success 상태를 반드시 포함하세요.
```

프롬프트 예시를 많이 늘리는 것보다 이 규칙을 고정하는 편이 효과가 큽니다.

## 관련 문서

- [고급 디자인 스킬(문서)](https://cli.rexai.top/ko/advanced-design-skills/)
