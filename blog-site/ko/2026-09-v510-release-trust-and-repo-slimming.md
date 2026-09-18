---
title: v5.10.0 — 릴리스 신뢰성과 저장소 슬림화
date: 2026-09-06
description: "Windows 회귀 스위트 완전 그린, 릴리스 증거 게이트 순서 수정, Actions SHA 고정과 gitleaks 및 npm audit 게이트, 저장소 461 파일 감축, 프롬프트 작성 규범 도입. 새 기능 없이 신뢰성만 고친 릴리스이며 업그레이드 절차도 담았습니다."
---

# v5.10.0 — 릴리스 신뢰성과 저장소 슬림화

> 2026-09-06 · 새 기능 없이 "신뢰성"에 집중한 릴리스

## 주요 변경

- **Windows 회귀 스위트 완전 그린**: 만성적인 실패 2건은 CRLF 아티팩트에 불과했습니다. drift guard는 줄바꿈 정규화로 비교하고, `.gitattributes`가 주요 소스를 LF로 고정하여 Windows와 Linux CI가 동일한 게이트를 통과합니다.
- **릴리스 증거 게이트 강화**: 증거 게이트를 전체 테스트 이전으로 이동(빠른 실패). `release-preflight.sh`는 커밋되지 않은 증거가 있으면 통과를 거부합니다——증거는 태그된 커밋에 존재해야 합니다.
- **공급망 고정**: 모든 GitHub Actions를 전체 커밋 SHA로 고정. gitleaks 시크릿 스캔 잡 추가. 루트와 mcp-server에 `npm audit --omit=dev --audit-level=critical` 게이트(기준: critical 0). Windows 스모크는 `npm ci`로 변경.
- **저장소 슬림화**: pptx node_modules 351개 파일과 `.cache/` 폰트 110개 파일을 Git에서 제거. 루트의 흩어진 디버그 로그 4개 삭제. 인증 산출물은 gitignore 화이트리스트화되어 `git add -f` 불필요.
- **프롬프트 작성 규범**: `docs/prompt-authoring-norms.md`——계약 우선, 의미 판단은 모델 자기 보고(ReAct 방식), 하드 게이트는 검증 프로토콜. 키워드/정규식 기반 의도 추측 금지.
- **내러티브 정렬**: AGENTS.md / mkdocs 4개 언어 / README를 "AIOS 오케스트레이션 컨트롤 플레인" 포지셔닝으로 통일. 브라우저 MCP는 legacy 구성요소로 명시.

## 업그레이드 노트

파괴적인 동작 변경은 없습니다. CI는 critical 수준의 npm 권고와 시크릿 스캔 발견 시 실패합니다. Windows 개발자는 풀 후 재체크아웃으로 줄바꿈을 정규화하세요.
