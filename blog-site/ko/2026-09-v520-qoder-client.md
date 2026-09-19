---
title: "v5.20.0: Qoder가 AIOS에 합류 — 열 번째 클라이언트, 정의 블록 하나"
description: "AIOS v5.20.0은 Qoder를 열 번째 1급 클라이언트로 추가한다: `.qoder/skills` 투사, Qoder가 실제로 읽는 settings.json의 MCP 설정, AGENTS.md 네이티브 컨텍스트, `-p` 헤드리스 team 실행."
date: 2026-09-19
tags: ["AIOS", "Qoder", "클라이언트", "agents", "MCP", "release", "v5.20.0"]
---

# v5.20.0: Qoder가 AIOS에 합류 — 열 번째 클라이언트, 정의 블록 하나

Qoder(알리바바의 AI IDE, 코딩 에이전트 CLI가 함께 배포된다)가 열 번째 1급 AIOS 클라이언트가 되었다. codex, claude, gemini, opencode, hermes, grok, workbuddy, pi, zcode와 나란히 서고, 레지스트리 재구축 이후의 모든 클라이언트와 마찬가지로 `scripts/lib/clients/core/definitions.mjs`의 정의 블록 하나일 뿐이다 — skills 투사, 네이티브 동기화, MCP 배치 대상, 셸 심, doctor 게이트가 전부 여기서 파생된다.

## 가정하지 않고 실측했다

기능은 기능 목록이 아니라 Qoder가 실제로 읽는 것으로 검증했다. skills는 SKILL.md 마크다운 디렉터리 형식으로 `.qoder/skills/`에 동기화된다(사용자 수준은 `~/.qoder/skills/`). 그것이 Qoder의 권위 있는 조회 지점이고, 공유 `.agents/skills` 프로젝트 루트에는 늘 그렇듯 AIOS 미러가 놓이지만 Qoder의 해당 루트 스캔은 검증되지 않았으므로 어떤 기능도 그것에 의존하지 않는다. 지침 파일은 AGENTS.md — AIOS의 관리 블록을 그곳에 쓰고 Qoder가 이를 로드한다. QODER.md는 허용되는 별칭이지만 AIOS는 의도적으로 쓰지 않는다. 두 배포판 모두 커버한다: 국제판은 CLI `qoder`·홈 `~/.qoder`, 중국 내수판은 `qoderclicn`·홈 `~/.qoder-cn`.

## Qoder가 실제로 읽는 파일에 MCP

마이그레이터는 AIOS 관리 서버를 Qoder의 실제 설정 파일에 투사한다 — 사용자 수준 `~/.qoder/settings.json`과 프로젝트 수준 `.qoder/settings.json`, 둘 다 최상위 `mcpServers` JSON 네임스페이스. 원격 HTTP MCP는 Qoder 자신의 CLI CRUD(`qoder mcp add --scope user|local|project --transport stdio|sse|http|ws`)로 등록하고, 검증된 증거를 확보한 뒤에만 등록 성공으로 보고한다. gitignore되는 `settings.local.json` 스코프는 실재하지만 AIOS는 건드리지 않는다.

## team과 harness를 위한 헤드리스 실행

`aios init --agent qoder`가 설정을 마무리하고, 자동 감지는 힌트 없이도 CLI를 찾는다. team과 harness의 spawn 라우팅은 `-p` print 모드로 Qoder를 헤드리스 실행하고, 무인 실행에는 `--yolo`, 결과 파싱에는 `--output-format`을 쓴다(플래그는 공식 CLI 문서 기준). doctor와 호스트 능력 보고는 Qoder를 zcode와 같은 L2(MCP 프록시)에 놓는다 — 인터셉션과 투사에는 충분하고, 한계도 그대로 기록한다: Qoder에 호스트 훅이 존재하지만 AIOS init은 아직 주입하지 않으며, 턴 압축을 주장하지도 않는다.

## 모델 라우팅은 own

모델 라우팅은 `own`이다. Qoder의 모델은 계정에 귀속되어 `/model`로 대화형 선택하며, 검증된 헤드리스 `--model`이 없으므로 AIOS는 엔드포인트를 중계하지 않는다. zcode·grok·workbuddy와 같은 정직한 상태이고, 레지스트리는 경로를 지어내지 않고 빈 값으로 기록한다.

## 업그레이드

`aios init --agent qoder`(또는 `aios init --all`, `aios update`)를 실행하면 skills 투사, MCP 설정 마이그레이션, AGENTS.md 관리 블록 작성까지 끝난다. 이후 Qoder를 재시작하고, 이미 실행 중인 세션에서는 `/mcp reload`로 MCP 변경을 반영한다. 변경 이력은 영어·중국어·일본어·한국어로 제공된다.
