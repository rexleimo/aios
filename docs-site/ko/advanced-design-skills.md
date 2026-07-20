---
title: 고급 디자인 스킬
description: DESIGN.md와 frontend-design으로 모호한 요구에서도 고품질 페이지를 안정적으로 구현합니다.
---

# 고급 디자인 스킬: 페이지 제작 가이드

사용자는 종종 "이 영역 좀 더 좋게 바꿔줘", "어떤 스타일로 다시 만들어줘"처럼 모호하게 요청합니다.
이 문서는 그런 입력에서도 일관된 UI/UX를 내기 위한 공식 워크플로를 설명합니다.

## 빠른 답변

두 스킬을 함께 사용합니다:

- `awesome-design-md`: `DESIGN.md`로 스타일 계약을 먼저 고정
- `frontend-design`: 고정된 계약을 기준으로 실제 구현

먼저 스타일을 잠그고, 그다음 구현하면 템플릿 느낌과 스타일 흔들림을 줄일 수 있습니다.

## 표준 워크플로

1. 대상 프로젝트에 스킬 설치:

```bash
node <AIOS_ROOT>/scripts/aios.mjs setup --components skills --client codex --scope project --skills awesome-design-md,frontend-design
```

2. 스타일 기준 생성:

```bash
npx --yes getdesign@latest list
npx --yes getdesign@latest add linear --force
```

3. 고정 프롬프트 사용:

```text
먼저 DESIGN.md로 스타일을 고정하고, 그다음 frontend-design으로 페이지를 구현해 주세요.
```

4. 비즈니스 요구를 붙여 바로 구현으로 진행합니다.

## 모호한 프롬프트 자동 수렴

구현 전에 요청을 3가지 모드로 분류합니다:

| 모드 | 사용자 입력 예시 | 산출물 기준 |
|---|---|---|
| `Patch` | "이 요소만 더 고급스럽게 바꿔줘" | 국소 수정 + 전체 상호작용 상태 |
| `Restyle` | "Stripe 느낌으로 다시 디자인해줘" | 구조 유지 + 시각 시스템 일괄 교체 |
| `Flow` | "완전한 SaaS 어드민을 만들어줘" | 연결된 화면/업무 플로우 제공 |

모호하다는 이유로 멈추지 말고, 짧은 가정을 명시한 뒤 구현을 진행합니다.

## 기본 스타일 추천

- SaaS / B2B: `linear`, `vercel`, `supabase`
- 마케팅 페이지: `framer`, `stripe`, `notion`
- 문서 사이트: `mintlify`, `hashicorp`, `mongodb`

도메인 힌트가 없으면 `linear`부터 시작합니다.

## SaaS 납품 최소 기준

`Flow` 요청은 최소한 다음을 포함해야 합니다:

- 대시보드
- 목록
- 상세
- 생성/수정 폼
- 설정 또는 결제
- 핵심 상태: `loading`, `empty`, `error`, `success`
- 상호작용 상태: `hover`, `focus`, `active`, `disabled`

## 권장 시스템 프롬프트

```text
사용자 의도가 모호하면 먼저 Patch/Restyle/Flow로 분류하세요. DESIGN.md로 스타일을 고정한 뒤 구현하고, hover/focus/active/disabled 및 loading/empty/error/success 상태를 반드시 포함하세요.
```

## 관련 링크

- [Rex 워크플로 마이그레이션](superpowers.md)
- [Skill Candidates Guide](skill-candidates.md)
- [고급 디자인 스킬 실전(블로그)](/blog/ko/advanced-design-skills-page-building/)
