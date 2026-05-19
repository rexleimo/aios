---
title: "Harness CLI TUI 리팩토링: React Ink 기반의 현대적 터미널 UI"
description: "Harness CLI는 수동 문자열 렌더링에서 React Ink + Ink UI 컴포넌트 아키텍처로 TUI 인스톨러를 마이그레이션하여 대화형 경험과 코드 유지보수성을 모두 개선했습니다."
date: 2026-04-02
tags: [Harness CLI, TUI, Ink, React, Terminal, Onboarding]
---

# Harness CLI TUI 리팩토링: React Ink 기반의 현대적 터미널 UI

기존 TUI 인스톨러는 수동 문자열 연결로 인터페이스를 렌더링했기 때문에 유지보수 비용이 높고 대화형 경험도 기본적인 수준이었습니다. 이번 리팩토링을 통해 **React Ink + Ink UI** 컴포넌트 아키텍처로 마이그레이션하여 터미널 인터랙션을 현대화했습니다.

## 왜 리팩토링했는가

이전 TUI 구현에는 몇 가지 문제가 있었습니다:

- 색상과 레이아웃을 위해 ANSI 문자열을 수동으로 연결하여, 한 곳을 변경하면 다른 곳에까지 영향을 미치기 쉬웠습니다
- 진정한 컴포넌트 추상화가 없었고, 상태 관리가 곳곳에分散되어 있었습니다
- 라우팅 개념이 없어 화면 전환 로직이 산발적으로 작성되어 있었습니다

Ink는 터미널 전용으로 설계된 React 렌더러로, React 컴포넌트 패턴을 사용하여 CLI 인터랙션 UI를 작성할 수 있습니다. Ink UI의 내장 컴포넌트(`Select`, `TextInput`, `ConfirmInput`)와 결합하면 개발이 크게 단순화됩니다.

## 새 아키텍처

```
scripts/lib/tui-ink/
├── App.tsx              # MemoryRouter + Routes 구성
├── index.tsx            # render() 엔트리 포인트
├── hooks/
│   └── useSetupOptions.ts  # 공유 설정 상태
├── screens/
│   ├── MainScreen.tsx      # 메인 메뉴
│   ├── SetupScreen.tsx     # Setup 설정
│   ├── UpdateScreen.tsx    # Update 설정
│   ├── UninstallScreen.tsx # Uninstall 설정
│   ├── DoctorScreen.tsx    # Doctor 설정
│   ├── SkillPickerScreen.tsx # 스킬 선택기
│   └── ConfirmScreen.tsx   # 실행 확인
├── components/
│   ├── Header.tsx          # 상단 헤더
│   ├── Footer.tsx          # 하단 단축키 힌트
│   ├── Checkbox.tsx        # 체크박스
│   └── ScrollableSelect.tsx # 스크롤 선택 목록
└── types.ts               # 공유 타입 정의
```

### 라우트 네비게이션

화면 전환은 `react-router`의 `MemoryRouter`로 관리합니다:

```
/ (MainScreen)
  → /setup
  → /update
  → /uninstall
  → /doctor

/setup → /skill-picker?owner=setup
/setup → /confirm?action=setup

/skill-picker → 이전 화면으로 돌아가기
/confirm → 실행 → 결과 표시 → 메인 메뉴로 돌아가기
```

### 상태 관리

`useSetupOptions` 훅이 각 화면에서 공유하는 전역 설정 상태를 제공합니다:

```typescript
interface SetupOptions {
  components: {
    browser: boolean;
    shell: boolean;
    skills: boolean;
    superpowers: boolean;
  };
  wrapMode: 'all' | 'repo-only' | 'opt-in' | 'off';
  scope: 'global' | 'project';
  client: 'all' | 'codex' | 'claude' | 'gemini' | 'opencode';
  selectedSkills: string[];
}
```

### 커스텀 컴포넌트

Ink UI의 `Select`는 스크롤 가능한 창 모드를 지원하지 않아 `ScrollableSelect`를 직접 구현했습니다:

- 키보드 ↑/↓ 네비게이션
- Space로 선택
- 그룹 표시 지원 (Core / Optional)
- 스킬 설명 및 설치됨 마커 표시

## 의존성

```bash
npm install ink @inkjs/ui react react-router
```

- `ink` 4.x — 터미널용 React 렌더러
- `@inkjs/ui` — 내장 인터랙티브 컴포넌트
- `react` 18.x + `react-router` 7.x

Node 버전: 프로젝트 요구사항 `>=22 <23`, Ink 4.x은 Node 18+을 지원하여 완전 호환됩니다.

## 시각 효과

- 현재 항목: 굵은 글씨 + cyan 색상
- 설치됨 마커: 초록색 `(installed)`
- 설명 텍스트: 회색 `dimColor`
- 그룹 헤더: 노란색 또는 inverse
- 오류/성공: 빨간색/초록색

## 호환성

비인터랙티브 모드(TTY 없음)는 기존 CLI 인자 모드를 유지합니다:

```bash
aios setup --components browser,shell --scope global
aios update --client codex
aios doctor
```

엔트리 포인트에서 TTY를 감지하여 자동으로 Ink 버전을 호출합니다.

## 관련 링크

- Ink 문서: <https://github.com/vadimdemedes/ink>
- Ink UI 문서: <https://github.com/vadimdemedes/ink-ui>
- 디자인 문서: `docs/superpowers/specs/2026-04-02-ink-tui-design.md`
- 구현 계획: `docs/superpowers/plans/2026-04-02-ink-tui-refactor.md`
