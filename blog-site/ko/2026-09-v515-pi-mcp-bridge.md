---
title: "v5.15.0: Pi가 진정한 MCP 능력을 갖추다"
description: "AIOS v5.15.0은 Pi 확장에 읽기 전용 aios_codemap_search를 추가하고, install 시 AIOS 관리 MCP 서버를 Pi에 브리징하며, skills doctor의 구버전 레이아웃 경고에 안전한 정리 경로를 제공한다."
date: 2026-09-14
tags: ["AIOS", "Pi", "MCP", "codemap", "release", "v5.15.0"]
---

# v5.15.0: Pi가 진정한 MCP 능력을 갖추다

v5.14.0에서 Pi는 AIOS의 일급 클라이언트가 되었지만 한 가지 구멍이 남았다. Pi 코어에는 MCP 표면이 없어 다른 클라이언트가 MCP로 받던 구조 코드·메모리 도구가 Pi에는 보이지 않았다. v5.15.0이 그 간극을 메우고 자잘한 마감 두 건을 함께 끝낸다.

## Pi 확장 내장 codemap 검색

Pi 확장에 읽기 전용 `aios_codemap_search` 도구를 추가했다. 모든 클라이언트가 쓰는 `search --source code` 경로를 그대로 재사용하므로, Pi 에이전트는 편집 전에 파일·심볼·호출자를 바로 조회할 수 있다. install/update가 사용자 측으로 자동 반영하며 별도 절차가 없다.

## MCP 브리지: Pi 전역 mcp.json에 서버 심기

`aios init --agent pi`는 고정(pinned)된 MCP-client 어댑터 확장을 설치하고, AIOS 관리 서버(`code-review-graph` 우선, 프로젝트 루트 인지 시 세션 추종 `aios-memory` 추가)를 Pi 전역 `mcp.json`에 심는다. 안전 규칙은 프롬프트가 아니라 병합 로직 자체가 강제한다:

- 사용자가 편집한 서버는 절대 덮어쓰지 않음 — 보존하고 이름을 보고;
- 잘못된 JSON의 `mcp.json`에는 fail-closed — 재작성하지 않음;
- 네트워크 실패는 경고로 강등 — 오프라인 머신도 어댑터와 프로젝트 `.mcp.json` 경로는 유지.

## doctor 경고와 짝을 이루는 정리

skills doctor는 구레이아웃 잔재(AIOS 관리 skill이 공유 `~/.agents/skills` 루트에 기록되어 Pi에서 중복 스캔 충돌을 발생)를 경고해 왔다. v5.15.0은 짝이 되는 `removeLegacySharedRootInstalls`를 추가했다. AIOS `managedBy` 메타데이터가 있는 디렉터리만 삭제하고 사용자 소유 skill은 건드리지 않으며, dry-run 미리보기로 삭제 대상을 목록만 출력한다.

## 업그레이드

`aios init --agent pi`(또는 `aios update`)를 다시 실행하면 어댑터와 심긴 서버가 적용된다. v5.15.0 release assets에서 설치 스크립트를 받을 수 있고, 변경 로그는 4개 언어로 제공된다.
