---
title: 블로그 허브
description: "AIOS 기술·성장 블로그(한국어판)입니다. 기억 시스템, 단일 agent harness, Agent Team 병렬 협업, 브라우저 자동화, 워크플로 정책, 멀티 클라이언트 운영 실전을 다루며 각 글에 재현 가능한 명령과 검증 증거를 함께 제공합니다."
---

# 블로그

AI 코딩 에이전트를 더 똑같이, 더 신뢰할 수 있게, 더 쉽게 작업할 수 있게 만드는 스토리, 튜토리얼, 심층 분석.

AIOS는 로컬 agent 워크플로 레이어입니다. 새로운 코딩 에이전트가 아니라 기존 `codex`, `claude`, `gemini`, `opencode` 에 기억, 팀워크, 자기 진단을 추가하는 레이어입니다.

## 여기서 시작하기

AIOS를 처음 사용하시나요? 이 게시물들이 방향을 잡아줄 것입니다:

- [AIOS로 Google Harness²를 재현했다 — harness 엔지니어링의 값어치는 몇 점인가](2026-10-harness2-jobbench-aios-measurement.md) — AIOS 책상을 같은 채점대에서 실측: 맨 51.1 → AIOS 85.8(+34.7pp), 논문값과 우리 트랙의 재귀법 모두 초과
- [AIOS 이야기](launch-post.md) — 왜 만들었는지, 어떤 문제를 해결하는지
- [CLI 비교: Raw vs. AIOS](cli-comparison-post.md) — 레이어를 추가하면 무엇이 달라지는지
- [자동화 플레이북](automation-playbook-post.md) — 일상적 사용 패턴
- [v4.0 적응형 워크플로 정책](2026-07-v400-adaptive-workflow-policy.md) — 라우트와 계획을 고르는 방법
- [AI 에이전트 워크플로는 어떻게 고를까?](2026-07-choose-agent-workflow.md) — 판단표와 실전 예시
- [CLI 명령에서 신뢰할 수 있는 워크플로로](2026-07-raw-cli-to-reliable-workflow.md) — 반복 가능한 경계 만들기

## 최신 글

- [v8.2.0: AIOS 플러그인을 GitHub에서 한 명령으로 설치할 수 있게 되다](2026-11-plugin-ecosystem.md) — 커뮤니티 플러그인을 현재 프로젝트에 설치하고 해석된 commit에 고정하며 저장소 빌드 스크립트를 건너뛰고 PR로 목록에 추가

- [v6.7.0: 한 명령, 모든 클라이언트 — 'aios skill add'가 커뮤니티 스킬에 정문을 열어주다](2026-10-v670-external-skills-get-a-front-door.md) — 가장 쓸모 있는 커뮤니티 스킬이 한 클라이언트의 전역 스킬 디렉터리에만 머물고 나머지 아홉은 볼 수 없었다. `aios skill add <source>`가 로컬 디렉터리나 git URL을 canonical 외부 레지스트리에 스테이징하고 모든 클라이언트의 사용자 레벨 스킬 루트로 배포한다 — 멱등, fail-closed 선택, 자가복사 가드가 `clone-website` 원본을 지켰다

- [v6.6.0: 에이전트 작업 공간이 프로젝트 목록에 새었다](2026-10-v660-scratch-space-leaked-into-your-project-list.md) — `-p` 없는 `mktemp -d` 가 `cwd` 에 써서 프로젝트 상위에 샌드박스 41 개 (9.9 GB) 가 자랐다. `AGENTS.md` 로 규칙을 명시하고 `scripts/aios-tmp-gc.mjs` 는 객관적 사실만으로 회수하며 읽을 수 없는 건 남긴다

- [v6.5.0: OpenCode 2.x 플러그인 계약, 그리고 AIOS의 위치를 거짓으로 적지 않게 된 설정](2026-10-v650-opencode2-contract-config-stops-lying.md) — OpenCode 2.x는 `default` export만 읽어 AIOS 플러그인이 조용히 죽어 있었다. 1.x/2.x dual export화와 설치 시 자기 복구, `aios interception mcp-repair`로 무효 MCP 경로를 안정 runtime root로 되돌린다

- [한 문장의 요구, 하나의 소프트웨어: 소형 모델이 한 달에 36억 토큰 — AIOS가 '누구나 개발할 수 있다'를 현실로](2026-10-qwen-flash-aios-pi.md) — 필요한 새 기술은 하나뿐이다, 요구를 명확히 말로 정리하는 것. 캐시 히트 96%의 한 달 고강도 사용, 맨 모델 vs AIOS 비교, 요구부터 납품까지의 흐름이 만든 E:/coding 프로젝트 목록
- [v6.4.0: 추측하지 않는 컨트롤 플레인 — 원장은 갈라지지 않고, 거절은 기능이고, 게이트는 선언된 곳에서 돈다](2026-10-v640-control-plane-stops-guessing.md) — 계획 원장은 갈라지지 않는다(A21–A23), plan CLI는 읽기 전용 뷰로 치환하는 대신 거절한다(A19), 선언된 검사는 CI에서 돈다(A20 + 디렉터리 예산 + 영향 테스트), mattpocock v1.3 트리오 양면 채택

- [v6.3.0: /grill이 진짜 커맨드로, 인터뷰는 스스로 기록하고, pi는 자기 MCP 캐리어를 고른다](2026-10-grill-with-docs.md) — 청취 커맨드가 드디어 일곱 클라이언트에 등록되고, 확정된 용어는 CONTEXT.md로 결정은 ADR로. pi 0.99+는 버전으로 MCP 캐리어를 골라 시작 경고를 쌓지 않습니다

- [v6.0.1: 엔지니어링 표준을 rex-harness로 — 기준의 거주지를 소비자와 함께](2026-09-v601-engineering-standards-rex.md) — 품질 기준이它을 소비하는 능력 체인과 함께 출하된다
- [v6.0.0: 엔지니어링 표준 내장 — AIOS는 코드를 생성할 뿐만 아니라 소프트웨어를 구축한다](2026-09-v600-engineering-standards.md) — 고전 서적에서 도출한 하나의 품질 기준을 router가 코드 생산 Provider 전에 로드하고 모든 변경에 Definition of Done 적용
- [v5.20.0: Qoder가 AIOS에 합류 — 열 번째 클라이언트, 정의 블록 하나](2026-09-v520-qoder-client.md) — 열 번째 1급 클라이언트, Qoder가 실제로 읽는 settings.json의 MCP, AGENTS.md 컨텍스트, `-p` 헤드리스 team
- [Jev + AIOS 퀵스타트: 키워드 없이 백그라운드 자동 판단](2026-09-jev-aios-quickstart.md) — TYPESAFE_API_KEY를 설정하고 판단 게이트를 켜면 평소대로 대화만 해도 Jev가 백그라운드에서 판단한다
- [v6.2.0: 실제로 트리거되는 엔지니어링 표준](2026-09-engineering-standards-trigger-chain.md) — 모든 클라이언트 디스크에 있었지만 누구도 읽라고 지시받지 못한 표준 스킬, 공유 참조 프로젝션 경로, 그리고 완료를 판정하는 파일 입도 베이스라인
- [v5.19.2: Windows가 감당할 수 있는 이름](2026-09-v5192-names-windows-can-hold.md) — 후보 id를 파일 이름으로 쓰면 NTFS에서 대체 데이터 스트림이 되어 승격이 조용히 사라지고, 가져오기 쪽은 오류 0건을 보고한다
- [v5.19.1: 실제로 닿을 수 있는 선언 채널](2026-09-v5191-declaration-you-can-reach.md) — shell에서 선언할 수 있게 되었고, 그를 위해 쓴 가드가 82개 미실행 테스트 파일을 찾아냄
- [v5.19.0: 판단 게이트에 몸을 붙이다](2026-09-v519-judgment-gate-surfaces.md) — 꺼져 있으면 아예 없는 aios_judge 도구와 보류만 할 수 있는 rex 단계 게이트
- [v5.18.0: AIOS에 TypeSafe Jev 도입 — 기본값은 꺼짐, 의도된 선택](2026-09-v518-judgment-gate.md) — 자격 증명 설정, 문서 MCP가 판단하지 못하는 이유, fail closed opt-in 게이트
- [v5.16.0: ZCode가 AIOS에 합류 — 진짜 서브에이전트 포함](2026-09-v516-zcode-client.md) — 1급 클라이언트, agents plugin 브리지, strict-schema MCP, Pi 능력 사슬 복구
- [v5.15.0: Pi가 진정한 MCP 능력을 갖추다](2026-09-v515-pi-mcp-bridge.md) — codemap 검색, MCP 브리지, doctor 정리 짝
- [v5.14.0: LoopX 컨트롤 플레인 + 고아 프로세스 제거](2026-09-v514-loopx-control-plane.md) — 정산 턴, 무인 리듬, 고아 제거
- [Pi coding agent가 AIOS 퍼스트클래스 클라이언트로 승격](2026-09-pi-client-aios.md) — skills, extension, RPC
- [v5.8.1: 에이전트가 멈추지 않음 — aios-shell 동결 수정과 LLM 의미 판단 기반 요구사항 명확화](2026-08-v581-stall-fix-llm-judged-grilling.md)
- [v5.8.0: AIOS의 안전한 자기 진화 — Session Memory, 증거 게이트, 롤백 가능한 승격](2026-08-v580-governed-self-evolution.md)
- [v5.6.1: 플랜 기반 멀티 에이전트 디스패치 — aios work가 플랜을 읽습니다](2026-08-v561-aios-work-plan-driven-dispatch.md)
- [v5.6.0: 병렬 멀티 에이전트 코딩을 한 줄의 명령으로 — aios work](2026-08-v560-aios-work-concurrent-dispatch.md)
- [Graph Engine 로컬 구현: AIOS가 Loop Engineering을 Agent Graph로 연결하는 방법](2026-08-10-aios-loop-graph-engineering.md)
- [v5.5.1: 증거 기반 Agent 라이프사이클 승격](2026-08-v551-agent-lifecycle-promotion.md)
- [v5.5.0: Ask-First 요구사항 정렬 — 에이전트가 원치 않는 것을 더 이상 만들지 않습니다](2026-08-v550-ask-first-requirements-alignment.md)
- [v5.4.4: 에이전트 스모크 테스트 신뢰성——출력 계약 클라이언트와 타임아웃 자동 에스컬레이션](2026-08-v544-agent-smoke-reliability.md)
- [v5.4.3: CRG 결정 체크포인트, Worker Journal 이름 변경, 멱등한 aios init](2026-08-v543-crg-decision-checkpoints.md)
- [v5.4.1: Windows에서 "aios update"가 깨진 이유와 자체 업데이트 수정](2026-08-v541-windows-self-update-safety.md)
- [병렬 코딩 에이전트는 공짜가 아니다: Git Worktree는 파일을 격리하고 상태는 격리하지 않는다](2026-08-parallel-coding-agents.md)
- [Agent 보안은 상태 머신 문제: Codex 보안 스레드가 놓친 것](2026-08-ai-agent-security.md)
- [AI 코딩 비용이 통제 불능: Cursor는 숫자를 숨기고 Amazon은 180만 달러를 태웠으며, 로컬 레이어가 바꾸는 것](2026-08-ai-coding-cost-crisis.md)
- [v5.4.0: 워크플로 이터레이션 v2.1 — Activation 안전성, 타입 Evidence 계약, 전체 Skill 감사](2026-08-v540-workflow-iteration-v21.md)
- [v4.0 적응형 워크플로 정책](2026-07-v400-adaptive-workflow-policy.md)
- [AI 에이전트 워크플로는 어떻게 고를까?](2026-07-choose-agent-workflow.md)
- [날것의 CLI 명령에서 신뢰할 수 있는 AI 에이전트 워크플로로](2026-07-raw-cli-to-reliable-workflow.md)
- [v3.6.0: Headroom과 Ponytail로 더 안전한 Token 인텔리전스 workflow 만들기](2026-07-headroom-token-intelligence.md)
- [v3.2.0: Harness 신뢰성 및 스킬 라이프사이클 업그레이드](2026-07-v320-harness-reliability-upgrade.md)
- [Grok Build가 AIOS 1급 클라이언트가 되었습니다](2026-07-grok-build-aios-client.md)
- [Hermes Agent가 AIOS 최상위 클라이언트로 승격](2026-06-hermes-agent-aios-client.md)
- [v2.0.2: 더 안전한 Skill Health Records와 더 깔끔한 Crush Config](2026-06-v202-ecc-uplift.md)
- [Agent Governance: Team live 실행 전에 증거 남기기](2026-06-agent-governance.md)
- [v1.52.0: 결정론적 Shell 출력 압축 (MCP 기반)](2026-06-v152-aios-shell-mcp.md)
- [v1.50.1: All-Client Token Compression Compliance](2026-06-v1501-token-compression-compliance.md)
- [v1.50.0: 기억, 문서, 계획, 코드를 가로지르는 통합 AIOS 검색](2026-06-v150-unified-aios-search.md)
- [Codemap：AI 에이전트에게 코드베이스 지도를](2026-05-codemap-crg.md)
- [ContextDB Token 압축: 더 작은 context pack과 안전한 recall](2026-05-token-compression.md)
- [Model Router: 모든 태스크에 맞는 올바른 모델](2026-05-model-router.md)
- [aios memo GUI: 에이전트의 기억을 살아있는 그래프로 시각화](2026-05-aios-memo-gui.md)
- [Solo Harness: 한 Agent를 밤새 돌려도 통제를 잃지 않는 방법](2026-04-solo-harness.md)
- [debug-hub: 에이전트가 스스로 디버깅하는 시대](2026-05-debug-hub-mcp.md)
- [Browser MCP 개선: 더 똑같은 페이지 읽기](2026-04-browser-mcp-weak-model-upgrade.md)
- [고급 디자인 스킬로 페이지 제작: 모호한 프롬프트를 실전 UI로](advanced-design-skills-page-building.md)
- [AIOS TUI 리팩토링: React Ink 기반의 현대적 터미널UI](2026-04-rexcli-ink-tui-refactor.md)
- [Windows CLI 시작 안정성 업데이트](windows-cli-startup-stability.md)

## 심층 분석

- [AIOS RL Training System: 에이전트에게 학습시키는 법](rl-training-system.md)
- [ContextDB 검색: 히스토리에서 바늘 찾기](contextdb-fts-bm25-search.md)
- [Orchestrate Live: 프로덕션에서 Subagent 실행](orchestrate-live.md)

## FAQ

### 어디서 시작해야 하나요?
먼저 [AIOS 이야기](launch-post.md)를 읽고, [퀵스타트](https://cli.rexai.top/ko/getting-started/) 가이드를试试하세요.

### 기억과 컨텍스트 관리가 중요하다면?
[Token 압축](2026-05-token-compression.md)에서 시작해서 [ContextDB 검색](contextdb-fts-bm25-search.md)을 읽어보세요.

### 에이전트를 밤새 실행하고 싶다면?
[Solo Harness](2026-04-solo-harness.md)를 읽고 [Solo Harness 문서](https://cli.rexai.top/ko/solo-harness/)를 확인하세요.

### 에이전트가 스스로 디버깅하게 하고 싶다면?
[debug-hub](2026-05-debug-hub-mcp.md)를 읽고 [debug-hub 문서](https://cli.rexai.top/ko/debug-hub/)를 확인하세요.

### AIOS는 새로운 코딩 에이전트인가요?
아닙니다. `codex`, `claude`, `gemini`, `opencode` 를 감싸서 기억, 팀워크, 자기 진단을 추가합니다. 워크플로우는 변하지 않습니다.
