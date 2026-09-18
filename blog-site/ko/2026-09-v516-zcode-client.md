---
title: "v5.16.0: ZCode가 AIOS에 합류 — 진짜 서브에이전트 포함"
description: "AIOS v5.16.0은 ZCode를 1급 클라이언트로 추가한다: 공유 루트 skills, AGENTS.md 네이티브 컨텍스트, team 라우팅, strict-schema MCP 브리지, rex 역할 카드의 서브에이전트 설치."
date: 2026-09-16
tags: ["AIOS", "ZCode", "클라이언트", "agents", "MCP", "release", "v5.16.0"]
---

# v5.16.0: ZCode가 AIOS에 합류 — 진짜 서브에이전트 포함

ZCode(Z.AI의 데스크톱 코딩 앱)가 아홉 번째 1급 AIOS 클라이언트가 되었다. 레지스트리 재구축 이후의 모든 클라이언트와 마찬가지로 `scripts/lib/clients/core/definitions.mjs`의 정의 블록 하나일 뿐이다 — skills 투사, 네이티브 동기화, 인터셉션, 셸 심, doctor 게이트가 전부 여기서 파생된다.

## 가정하지 않고 실측했다

기능은 기능 목록이 아니라 실제 앱으로 검증했다. ZCode는 공유 `.agents/skills` 루트를 네이티브로 스캔하므로 AIOS는 그곳에 투사한다(중복 사본 없음). 지침 파일은 AGENTS.md이고, team 라우팅은 번들 CLI를 `--mode yolo`로 헤드리스 실행한다. ZCode 0.16.5에 정말로 없는 것은 두 가지다: `--model` 플래그(상류가 추가할 때까지 모델 라우팅은 비어 있음)와 프로젝트 범위 서브에이전트 정의.

## 서브에이전트는 플러그인 문으로 들어온다

없던 서브에이전트 표면은 중요했다 — ZCode에 실제로 있는 문을 찾을 때까지: plugin의 `agents/*.md` 디렉터리는 실행되는 서브에이전트로 취급된다(공식 document-skills plugin이 증거). v5.16.0은 rex 역할 카드를 `~/.aios/zcode-plugin` 아래 `aios-agents` inline plugin으로 실체화하고 사용자 수준 `plugins.dirs` 설정으로 등록한다 — GUI 클릭이 필요 없다. `doctor:zcode-agents` 게이트는 manifest 유효성, 에이전트 드리프트, 등록 상태를 보고한다.

## strict-schema 함정

ZCode는 알 수 없는 설정 키를 포함한 MCP 서버를 조용히 버린다. JSON 마이그레이터는 이제 중첩된 `mcp.servers` 네임스페이스를 이해하고, AIOS 관리 서버 3종을 ZCode의 strict schema로 정규화한다(`startupTimeoutSec` 초 → `timeoutMs` 밀리초, 필드 허용 목록). 사용자가 소유한 서버는 그대로 통과한다.

## 감지를 실제로 동작시키는 심

ZCode의 CLI는 앱 번들 안에 있고 PATH에 없다. 레지스트리 기반 네이티브 심과 번들 `zcode.cjs`용 런처가 감지와 배치를 해결했다 — `zcode --version`은 심 경로를 통해 종단 간 검증되었다.

## 이번 릴리스의 다른 내용

Pi 능력 사슬을 복구했다: `aios-bridge`가 Pi로 시드되는 MCP 서버에 합류하고, harness에 장수명 `--transport rpc` 드라이버가 생겼으며, `doctor:pi-bridge` 게이트가 추가되었고, `aios memo checkpoint`가 CLI에서 이정표를 고정하며, Pi 프로젝트 skills는 공유 `.agents/skills` 루트로 이동하고 레거시 정리도 짝을 이룬다.

## 업그레이드

`aios init --agent zcode`(또는 `aios update`)를 실행하면 skills 투사, agents plugin 등록, 심 설치까지 끝난다. 참고: ZCode 헤드리스 실행에는 한 번의 `zcode login`이 필요하다. 변경 이력은 영어·중국어·일본어·한국어로 제공된다.
