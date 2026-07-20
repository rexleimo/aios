---
title: Rex 워크플로 마이그레이션
description: 폐기된 Superpowers 워크플로에서 Rex-only AIOS 워크플로로 안전하게 마이그레이션합니다.
---

# Rex 워크플로 마이그레이션

새 AIOS 설치와 관리되는 워크플로 투영에서 `rex-harness`는 유일한 기본 소프트웨어 엔지니어링 워크플로입니다. Superpowers는 AIOS 설치 구성요소와 워크플로에서 폐기되었습니다. 기존 `/superpowers/` URL은 이 마이그레이션 가이드로 유지되어, 폐기된 워크플로를 안내하는 대신 현재 동작을 설명합니다.

## 변경 사항

Rex는 소프트웨어 엔지니어링 제어 루프, 즉 Facts, Capability 선택, Workflow Activation, Command, Evidence Contract, 복구 상태를 소유합니다. AIOS는 Rex 제어면 주위에서 호스트 라우팅, 클라이언트 투영, ContextDB, 안전 검사, team 실행, 장기 실행 harness를 제공합니다.

새 설치는 Codex, Claude, Gemini, OpenCode, Hermes, Grok용 Rex 투영을 사용하며, 클라이언트가 지원하면 공유 `.agents` 투영도 사용합니다. 활성화할 Superpowers TUI 옵션이나 별도 Superpowers 워크플로는 없습니다.

## 안전한 업그레이드 동작

평소처럼 일반 업데이트를 실행합니다.

```bash
aios update
```

일반 업데이트는 Rex-only 워크플로를 설치하고 정리합니다. AIOS 소유 증명이 없는 과거 Superpowers 투영은 보존되고 conflict로 보고됩니다. 이 fail-closed 기본값은 이름이 이전 투영과 비슷하다는 이유만으로 AIOS가 사용자가 관리하는 경로를 삭제하지 않도록 합니다.

## 명시적인 이전 투영 정리

AIOS가 정확히 인식한 이전 Superpowers 투영을 채택하고 제거하도록 하려면 먼저 결과를 미리 본 뒤 명시적 정리를 실행하세요.

```bash
aios update --adopt-legacy-superpowers --dry-run
aios update --adopt-legacy-superpowers
```

`aios update`로 업그레이드하지 않는 사용자도 같은 opt-in을 사용할 수 있습니다.

```bash
aios init --all --adopt-legacy-superpowers
aios setup --adopt-legacy-superpowers
```

명시적 채택은 Codex, Claude, Gemini, OpenCode, Hermes, Grok, 공유 `.agents` 투영에서 인식된 AIOS 이전 링크를 대상으로 합니다. 알 수 없거나 수정되었거나 사용자 소유임을 증명할 수 없는 경로는 제거하지 않습니다. 소유권을 확인한 뒤 보고된 conflict를 수동으로 해결하세요.

## 마이그레이션 확인

```bash
aios doctor --native --verbose
```

doctor 출력은 클라이언트 투영과 워크플로 진단을 보여줍니다. 소스 기반 설치에서는 번들 `rex-harness` submodule도 사용할 수 있는지 확인하세요.

```bash
git submodule update --init --recursive -- rex-harness
```

## 관련 문서

- [워크플로 정책](workflow-policy.md) - 현재 Rex Command 주위에서 `direct`, `guarded`, `planned` 호스트 라우팅을 선택합니다.
- [시작하기](getting-started.md) - AIOS를 설치하고 초기화합니다.
- [변경 로그](changelog.md) - 릴리스별 마이그레이션 정보를 확인합니다.
