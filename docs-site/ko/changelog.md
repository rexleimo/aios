---
title: 변경 로그
description: 릴리스 이력, 업그레이드 안내, 관련 문서 링크.
---

# 변경 로그

## v5.4.4（2026-08-06）— 에이전트 스모크 테스트 신뢰성: 출력 계약 클라이언트와 타임아웃 자동 에스컬레이션

### 주요 변경 사항

- `agents smoke --live`가 JSON 출력 계약을 따르는 클라이언트(예: Codex)에서 더 이상 실패하지 않습니다. 프로브 프롬프트는 이제 계약을 명시적으로 재정의하여 ACK만 요구하고, ACK 감지는 JSON으로 감싸진 응답도 허용합니다. post-receive 압축 증명은 `minRawBytes` 이상의 출력에만 적용되며(짧은 출력은 설계상 인라인), 빈 압축 refs로 인해 증거 기록이 충돌하지 않습니다.
- 하드코딩된 30초 프로브 타임아웃은 `AIOS_AGENT_SMOKE_TIMEOUT_MS`와 `agents smoke --timeout-ms <ms>`로 대체되었습니다(기본값은 60초로 상향).
- 프로브는 일시적인 느린 응답에 대해 타임아웃을 자동 에스컬레이션하며 재시도합니다(60s → 120s → 240s). 모두 소진할 때까지 blocked가 되지 않습니다——한 번의 느린 콜드 스타트나 모델 대기 지연으로 에이전트가 영구적으로 워크플로 비활성화되지 않습니다. 최종 blocker 메시지에는 복구 명령이 포함됩니다.

### 업그레이드 노트

- 기존 설치자는 `aios update`로 업그레이드할 수 있습니다. 이전에 "command 무효 / workflow 카드" 상태(live smoke 증거 드리프트로 에이전트가 blocked)를 겪었다면 `aios agents smoke --live --client <이름> --timeout-ms <ms>`를 다시 실행하여 v2 증거를 재생성하세요. 데이터 마이그레이션은 필요 없습니다.

## v5.4.3（2026-08-06）— CRG 결정 체크포인트와 Worker Journal 이름 변경

### 주요 변경 사항

- 워크플로 레이어에 CRG(code-review-graph) 결정 체크포인트 도입: `aios-workflow-router`와 `rex-workflow`는 작업 전 `get_minimal_context`, 편집 전 `get_impact_radius` + `query_graph(tests_for)`, 코드 검색 시 `semantic_search_nodes`/`query_graph` 우선, 각 단계 종료 시 `detect_changes`를 호출합니다. CRG를 사용할 수 없으면 `rg` + 파일 읽기로 폴백하며 흐름을 차단하지 않습니다.
- `aios init`에 `--yes` / `--retry` / `--force` 옵션 추가 및 새 `install-state` 모듈로 설정/업데이트를 멱등화(미설치 컴포넌트에서 재개 또는 강제 클린 재설치).
- solo harness 저널 디렉터리를 `solo-harness`에서 `worker-journal`로 이름 변경. 세션 산출물은 이제 `artifacts/worker-journal/`에 위치합니다. 기존 `solo-harness` 디렉터리는 첫 읽기 시 자동 마이그레이션되며, solo worktree 임시 접두사도 새 이름을 따릅니다.
- 클라이언트 프롬프트(AGENTS.md / CLAUDE.md / GEMINI.md)에 CRG 워크플로 섹션 동기화.

### 업그레이드 메모

- 기존 설치본은 `aios update`로 업데이트할 수 있습니다. 기존 `solo-harness` 세션 디렉터리는 자동 마이그레이션되므로 수동 작업이 필요 없습니다.

## v5.4.2 (2026-08-05) - 로컬 Browser MCP를 단일 브라우저 진입점으로

### 주요 변경 사항

- 브라우저 MCP 선택·설치·마이그레이션·수명주기 복구에서 은퇴한 `ai-browser-book` / `AIOS_BROWSER_USE_REPO` 런타임 의존성을 제거.
- 리포지토리 내 Node/Playwright MCP(`scripts/run-local-browser-mcp.mjs`)를 유일한 브라우저 MCP 진입점으로 통일하고, 완전한 dist 검증과 source/tsx 폴백을 구현.
- 브라우저 설치 시 로컬 MCP 의존성·Playwright Chromium 설치, MCP 서버 빌드, 클라이언트 설정 마이그레이션을 수행하고 `browser_health`로 런타임 준비 상태 확인을 공개.
- 크로스플랫폼 브라우저 MCP 회귀 커버리지, Hermes 마이그레이션 커버리지, GitHub release 워크플로의 로컬 브라우저 설치 경로 검증 추가.

## v5.4.1 (2026-08-02) - Windows 런타임 자체 업데이트 안전성 수정

### 주요 변경 사항

- `aios update` 자체 업데이트가 Windows 릴리스 설치에서 안전해졌습니다. 이전에는 설치 트리 내부에서 업데이트를 실행하면 프로세스 작업 디렉터리가 설치 프로그램이 삭제해야 하는 디렉터리에 남아 있었고, Windows는 cwd가 유지하는 디렉터리를 삭제할 수 없어 삭제가 조용히 실패하고 새 버전이 `<install>/aios/`에 중첩되어 이후 업데이트가 `MODULE_NOT_FOUND`로 실패했습니다.
- 업데이터는 릴리스 설치 프로그램을 실행하기 전에 작업 디렉터리를 설치 트리 밖으로 이동합니다. 설치 프로그램은 이전 디렉터리가 실제로 삭제되었는지 검증하고(실패 시 중첩하지 않고 명시적으로 오류), 업데이트 후 재실행은 진입점을 확인하고 교체 실패 시 명확한 복구 메시지를 출력합니다.
- 업데이터는 릴리스 설치 프로그램 업데이트에 로컬 `scripts/aios-install.ps1`을 우선 사용하므로 방어적 설치 프로그램 수정이 즉시 적용됩니다.
- 이전에 gitlink를 제거한 후 남아 있던 추적되지 않은 `agent-sources/skills/` 디렉터리를 제거했습니다(token-discipline 동기화 테스트를 깨뜨리고 있었습니다).

### 업그레이드 메모

- 기존 설치본은 이 릴리스를 설치한 후 `aios update`로 정상 업데이트할 수 있습니다. 수정 자체는 릴리스 자산에 포함되어 있습니다.

## v5.4.0 (2026-08-01) - 워크플로 이터레이션 v2.1: Activation 안전성과 타입 기반 Evidence 계약

### 주요 변경 사항

- Rex activation store가 선행 쓰기 트랜잭션 방식으로 변경(`.aios/workflow-activations/transactions/`): Workflow와 Activation 투영이 원자적으로 영구화되고, 재시작 시 잔여 트랜잭션을 자동 롤 포워드하며, 읽기 시 양자의 일관성을 검증하여 불일치 시 fail-closed(`stale-activation-projection`).
- store 파일 잠금으로 Command token 진행을 직렬화: 병렬 호출은 `AIOS_REX_STORE_BUSY`를 받으며, 동일 token의 이중 소비를 방지합니다.
- Wayfinder Artifact 타입 schema(`wayfinder-artifact.mjs`)를 추가했습니다: Navigation Map, Decision Graph, Decision Ticket, Next Slice 구조를 검증하며, partial/blocked 상태는 Ticket 또는 Next Slice를 선언할 수 없습니다.
- Planning Artifact 타입 schema(`planning-artifact.mjs`)를 추가했습니다: Frontier의 ready/blocked 상호 배타 및 중복 금지, Parallel Group의 여러 그룹 간 유일성, Convergence Gate, Runtime Artifact Contract를 검증합니다.
- `normalizeEvidenceRefs()`를 추가했습니다: evidence ref에 프로토콜 프리���스(`artifact:`, `receipt:` 등)가 필수이며 TODO/TBD/placeholder는 거부됩니다. Wayfinder, Planning, Requirements 전체 산출물에 적용됩니다.
- Client projection이 중단된 백업을 복원하기 전에 마커 다이제스트를 `projection-history.json`에서 재검증하여, 위조된 junction이 승격되는 것을 방지합니다(`interrupted-backup-untrusted`).
- Plan evidence mirror(`syncEvidenceToMatchingPlan`)가 실패 시 예외를 던지는 대신 구조화된 `planEvidence.status = 'failed'`를 반환하도록 변경되어, 이미 커밋된 Rex 상태가 계속 표시됩니다.
- AIOS MCP server에 `wayfinderArtifact` / `planningArtifact` 툴 파라미터를 추가했습니다.
- S1-S5 전체 배치에서 13개 canonical Skill이 SkillOpt eval을 완료했으며, digest가 `projection-history.json`에 추가되었습니다.

### 가용성 경계

- 이번 버전의 타입 기반 artifact schema는 rex runtime 내부에서만 검증됩니다. 기존 `.aios/workflow-activations/` 상태는 후방 호환되며 마이그레이션이 필요하지 않습니다.
- Evidence ref 프로토콜 프리픽스 검증은 이번 버전부터 제출되는 신규 evidence에 적용되며, 기존에 저장된 ref는 소급 검증되지 않습니다.

## v5.3.0 (2026-07-30) - Context Lifecycle 안전성과 호환성

### 호환성이 깨지는 변경

- 다음 명시적 plan write에서 structured plan은 schema v3로 업그레이드되며, 이전 runtime은 업그레이드된 plan state를 읽을 수 없습니다.
- Session close는 shared memo를 자동 게시하지 않고 검토 가능한 memo candidate sidecar를 작성합니다.
- trusted broker와 concurrency authority가 마련되기 전까지 Dream approve, reject, archive, restore, GC는 DENY receipt를 반환하며 Dream apply는 proposal-only 상태를 유지합니다.

### 제공 범위 경계

- Context Lifecycle V1은 S0-S2 observe/shadow instrumentation으로만 릴리스됩니다. 이 릴리스는 selective enforcement, opt-in pilot, default hard enforcement를 활성화하거나 주장하지 않습니다.
- Context proposal에는 명시적인 human confirmation이 필요합니다. confirmed targets 또는 context가 없는 plan은 execution-context unit을 전혀 전달하지 않을 수 있으며, 이 릴리스는 out-of-the-box context intelligence를 약속하지 않습니다.

## v5.0.0 (2026-07-20) - Rex-only 워크플로 마이그레이션

- `rex-harness`는 새 AIOS 설치와 관리되는 클라이언트 투영의 유일한 기본 소프트웨어 엔지니어링 워크플로입니다. Superpowers는 AIOS 워크플로와 설치 구성요소에서 제거되었습니다.
- 일반 `aios update`, `aios init`, `aios setup`은 Rex를 정리하지만 AIOS 소유 증명이 없는 이전 Superpowers 투영은 보존하고 conflict로 보고합니다.
- 정확히 인식된 AIOS 이전 링크만 정리하려면 먼저 `aios update --adopt-legacy-superpowers --dry-run`을 실행하고 확인 후 adopt하세요. Codex, Claude, Gemini, OpenCode, Hermes, Grok, 공유 `.agents` 투영을 포함합니다.
- 변경된 skill은 `skill certify --changed`로 version control에 포함된 재계산 가능한 evidence를 만듭니다. release gate는 status file이나 content hash만 신뢰하지 않고 deterministic probe를 다시 실행합니다.

## v4.0.1 (2026-07-14) - 공개 콘텐츠와 SEO/GEO 범위

- 문서 버전 배지, 루트 `VERSION`, GitHub Release, 공개 changelog를 `4.0.1`로 동기화했습니다.
- 현재 AIOS workflow, 릴리스 탐색, 검색 및 AI answer engine이 이해하기 쉬운 공개 문서와 블로그 콘텐츠를 확장했습니다.

## v4.0.0 (2026-07-14) - 적응형 워크플로 정책

- `noop`, `direct`, `guarded`, `planned` 적응형 라우팅을 추가하여 요청에 맞는 개발 절차를 선택합니다.
- 여러 단계의 AI agent 작업을 위해 영속 계획, 편집 안전 게이트, 증거 기반 검증을 문서화했습니다.
- 릴리스 글: [v4.0 적응형 워크플로 정책](/blog/ko/2026-07-v400-adaptive-workflow-policy/).

## 문서와 workflow 메모

- **v3.6.0 Headroom token 인텔리전스 workflow**: `aios init`은 RTK와 Caveman에 더해 검증된 Headroom CLI range를 install합니다. Gemini/Grok의 user-scope MCP registration에는 별도 `--yes-headroom-mcp` consent가 필요합니다. Hermes는 실제 TTY가 필요하며 그렇지 않으면 `pending-interactive`를 보고합니다. 기존 external 또는 conflict entry는 덮어쓰지 않고 AIOS 소유 entry는 `~/.aios/integrations/headroom-mcp.json`에 기록합니다. MCP-only compression은 명시적이며 투명한 input interception을 주장하지 않습니다. 자세한 내용: [Token 인텔리전스와 압축](token-compression.md) 및 [Headroom + Ponytail 글](/blog/ko/2026-07-headroom-token-intelligence/).
- agent governance 설명을 Team 문서, scenario guide, ContextDB reference, blog에 추가했습니다.
- 새 smoke 증거 안내는 `.aios/agents/smoke/<agent>.json`, `.aios/agents/provenance/<agent>.json`, `.aios/interception/metrics/agents-smoke-<agent>.jsonl`을 가리킵니다.
- skill을 수정했다면 live workflow를 신뢰하기 전에 `node scripts/aios.mjs skill verify-training --changed --base HEAD --json`을 실행하세요.
- **Memo stale-lock repair**: `aios memo storage repair-locks`는 기록된 owner PID가 종료된 것으로 확인된 lock만 quarantine하며 active 또는 malformed lock file은 유지합니다.
- **Grok Build가 AIOS 최상위 클라이언트로 승격**: xAI Grok Build(`grok` / runtime id `grok-build`)가 skills, agents, native, team, harness 로 등록되었습니다. MCP는 Codex 형태 TOML(`~/.grok/config.toml`). 참고: [Grok Build + AIOS](/blog/ko/2026-07-grok-build-aios-client/).
- **Hermes Agent가 AIOS 최상위 클라이언트로 승격**: skills, native, harness. 참고: [Hermes Agent + AIOS 블로그 글](/blog/ko/2026-06-hermes-agent-aios-client/).

## v3.6.0（2026-07-10）— Headroom + Ponytail token 인텔리전스 workflow

### 추가

- Python 3.10+가 필요한 격리된 `uv tool` 또는 `pipx` environment에 `headroom-ai[all]>=0.31.0,<0.32.0`를 감지하고 install.
- 무인 package installation과 MCP user-configuration consent를 독립적으로 유지하도록 `--yes-headroom-mcp`를 추가.
- Gemini CLI, Grok Build, Hermes Agent의 native MCP command로 공식 `headroom mcp serve`를 등록. TTY가 없는 Hermes는 `pending-interactive` 상태를 유지합니다.

### 안전성과 호환성

- AIOS 소유 MCP registration fingerprint를 `~/.aios/integrations/headroom-mcp.json`에 저장하고 external 또는 conflict entry를 보존.
- MCP tool(`headroom_compress`, `headroom_retrieve`, `headroom_stats`)이 현재 request의 투명한 interception이 아니라 명시적인 on-demand compression임을 명확히 함.
- RTK, Caveman, ContextDB, Headroom 및 Ponytail에서 영감을 얻은 smallest-correct-change gate를 분리된 layer로 문서화.

## v3.4.0（2026-07-09）— Grok Build 1급 클라이언트

- `grok` / `grok-build` 를 전체 기능 세트로 등록(team + harness 포함)
- 프로젝트 skills/agents: `.grok/skills`, `.grok/agents`; 지시 파일은 공유 `AGENTS.md`
- 무인 실행: `grok --always-approve -p "..."`
- 공식 문서, changelog, 다국어 블로그 동기화

## v3.3.0（2026-07-02）— 네이티브 인터셉션 런타임 폐기, RTK + Caveman 자동 설치

### Breaking Change: AIOS 네이티브 인터셉션 런타임 폐기

AIOS 네이티브 토큰 인터셉션 런타임(`scripts/aios-mcp-proxy.mjs`, `scripts/aios-intercept.mjs`, `config/aios-interception.json`)이 deprecated로 표시되었습니다. 코드는 유지되지만 적극적인 유지보수는 종료됩니다.

대체는 커뮤니티 도구입니다:

- **RTK** (https://github.com/rtk-ai/rtk) — Rust CLI 프록시, 명령 출력 60-90% 압축. 단일 바이너리, <10ms 오버헤드, 100+ 지원 명령. 로컬 실행, 외부 서비스 없음.
- **Caveman** (https://github.com/JuliusBrussee/caveman) — Claude Code 스킬, agent 출력 토큰 ~75% 압축. 기술적 정확성 유지, 표현 스타일만 압축. 로컬 prompt skill.

### 새 기능: 자동 설치

`aios init`이 RTK + Caveman을 자동 감지 및 설치:

```bash
node scripts/aios.mjs init --all
node scripts/aios.mjs init --all --yes-compression-tools
node scripts/aios.mjs init --dry-run
```

플로우: 감지 → 사용자 확인 → 다운로드 설치 → 검증 → PATH 설정 → `rtk init -g` 클라이언트 초기화.

플랫폼: macOS (brew), Linux/WSL (install.sh), Windows (PowerShell zip + 자동 PATH).

### 삭제된 정책

- `bidirectional-turn-compression` 강제 정책 삭제
- `pre_send` / `post_receive` 압축 검증 요건 삭제
- `uncontrolled_host_output` 정책 위반 마킹 삭제
- "Do not install RTK, Caveman" 금지 삭제

### 마이그레이션

1. `aios init`으로 RTK + Caveman 설치
2. 기존 `scripts/aios-mcp-proxy.mjs`는 삭제 불필요, 유지보수 종료
3. 기존 설정 `config/aios-interception.json`은 더 이상 읽지 않음
4. AI 클라이언트 재시작하여 RTK hook/plugin 활성화
5. Claude Code에서 `/caveman` 입력하여 Caveman 활성화

## v3.2.0（2026-07-01）— Harness 신뢰성 및 스킬 라이프사이클 업그레이드

### Harness Solo Runtime

- **consecutiveFailures 자동 중단**: `backoff.mjs`에 듀얼 카운터(`consecutiveFailures` + `consecutiveInfraFailures`) 추가. 5회 연속 비성공 outcome 시 자동 abort, 무한 재시도로 인한 token 낭비 방지.
- **Emergency 압축 티어**: `mermaid-canvas.mjs`에 세 번째 압축 레벨(100+ 노드에서 트리거) 추가. emergency 모드는 최근 5개 노드만 유지하여 canvas 오버플로우 방지.
- **Dry-run Readiness 사전 점검**: 신규 `dry-run-readiness.mjs`가 harness 시작 전 4차원(ContextDB, Git, Provider, Session)을 점검. `blocked` 레벨은 시작을 차단.

### Runtime Directive 시스템

- **Directive 주입**: 신규 `directive-inject.mjs`가 `.aios/config.json`의 `default_mode`를 읽어 해당 `systemPromptAdditions`를 매 harness 반복 prompt에 주입. 3개 내장 프리셋과 커스텀 `mode_presets` 지원.

### Auto-Dream (Phase A: 수동)

- **수동 메모리 정리 CLI**: `scripts/lib/memo/autodream.mjs`가 `--preview`(계획만)와 `--apply`(실행) 모드를 제공. 기존 taxonomy + 중복 제거 + TTL 만료 파이프라인을 래핑.

### Skill Workshop

- **Stale 감지**: apply 전 타겟 `SKILL.md`의 파일시스템 hash와 lock의 `computedHash`를 비교. 불일치 시 apply 거부, 사용자 수동 편집 보호.
- **파일 레벨 rollback**: apply 전 완전한 `SKILL.md` 내용을 `lock.rollbackSnapshot.previousContent`에 저장. rollback 시 실제 파일 내용을 복원.

### 검증

모든 변경사항은 37/37 유닛 + 통합 테스트로 검증됨.

상세: [v3.2.0 릴리스 글](/blog/ko/2026-07-v320-harness-reliability-upgrade/).

## v3.1.0（2026-06-30）— Hermes Agent 최상위 클라이언트 통합

- **Hermes Agent가 7번째 AIOS 최상위 클라이언트로 등록**: skills, native, harness, superpowers 모든 기능 보유.
- **MCP 브리지 서버**: `scripts/aios-mcp-server.mjs`가 Hermes 세션 내에서 5개 AIOS 도구(`aios_context_pack`, `aios_doctor_suite`, `aios_intercept_compress`, `aios_skill_validate`, `aios_skill_install`)를 노출.
- **Native emitter + MCP target**: AGENTS.md 출력 + JSON stdio(`.mcp.json` + `config.yaml` scopes).
- 다국어 문서 지원(영/중/일/한).
- 상세: [Hermes Agent + AIOS 블로그 글](/blog/ko/2026-06-hermes-agent-aios-client/).

## v2.0.2 (2026-06-15)

- **Skill health validation**: `recordSkillObservation()` 이 알 수 없는 status 를 거부해 producer 오타가 failure 로 저장되지 않도록 했습니다.
- **Help-first CLI parsing**: `aios skill ... --help` 와 `aios session ... --help` 는 필수 positional argument 검증보다 먼저 usage 를 보여줍니다.
- **Crush config hygiene**: `.crush.json` 과 `crush.json` 은 더 이상 repository 에서 추적하지 않습니다. 로컬 Crush config 는 계속 지원되지만 git 에서는 무시됩니다.
- 참고: [v2.0.2 release post](/blog/ko/2026-06-v202-ecc-uplift/).

## v2.0.1 (2026-06-13)

- **Browser MCP alias migration**: 기본 browser-use runtime 을 유지하면서 legacy alias compatibility 를 수정했습니다.

## v2.0.0 (2026-06-12)

- **Pull-based runtime context**: automatic ContextDB prompt injection 과 startup-mode injection 을 제거하고 필요한 때만 runtime context 를 읽도록 했습니다.

## v1.52.0 (2026-06-11)

- **aios_shell MCP 도구**: `aios-shell` MCP 별칭을 통해 모든 클라이언트에서 결정론적 shell 출력 압축 제공. shell 명령은 `scripts/shell-mcp-server.mjs`를 통해 실행되고 MCP proxy가 자동으로 **99%+ 절감률**로 압축합니다.
- **3계층 차단 방어**: MCP 도구 (전체 클라이언트) → shim+hook (Claude/전체) → 프롬프트 가이드. 단일 장애점 없음.
- **Shim 자가 치유**: 네이티브 shim이 4개 fallback 경로를 탐지 후 fail-open으로 실제 클라이언트 바이너리를 실행합니다.
- **민감 명령 가드**: `git push`와 `npm publish`가 실행 전 차단되어 호스트 권한 검토가 필요합니다.
- **aios-shell 전 클라이언트 등록**: `doctor --fix`로 `.mcp.json`, `.codex/config.toml`, `.gemini/settings.json`, `opencode.json`, `crush.json`에 등록.
- 참고: [v1.52.0 블로그 글](/blog/ko/2026-06-v152-aios-shell-mcp/).

## v1.51.0 (2026-06-10)

- **Crush smoke 검증**: Crush (charmbracelet)를 pending-smoke 게이팅에 추가하고 live execution 차단 강화.
- **Native strict 모드 업그레이드**: `clients doctor --native-strict`가 관리 shim 뒤에 실제 다운스트림 클라이언트 존재 여부를 검증.

## v1.50.1 (2026-06-05)

- **전체 클라이언트 turn compression compliance**: 모든 AIOS-managed client/host가 `bidirectional-turn-compression` metric을 공유하며 `pre_send`와 `post_receive` 기록을 필수로 만듭니다.
- **Bypass에 가짜 절감 없음**: AIOS-managed runner 밖의 direct host output은 `policy-violation` / `non_compliant`로 기록되고 `saved_bytes=0`이 됩니다.
- **Proof matrix**: `node scripts/aios.mjs interception proof --json` 및 `doctor --json`이 Codex, Claude, Gemini, Antigravity, OpenCode, Crush, Cursor, `aios-harness`, `generic-mcp`의 `turn_compression_matrix`를 출력합니다.
- **Skill training evidence**: `aios-interception-runtime`은 SkillOpt-Lite로 training되었으며 artifact는 `.skillopt/aios-interception-runtime-2026-06-05`에 있습니다.
- **Release tutorial**: [v1.50.1 token compression compliance post](/blog/ko/2026-06-v1501-token-compression-compliance/) 와 [Token 인텔리전스와 압축](token-compression.md)을 참고하세요.

## v1.50.0 (2026-06-04)

- **통합 AIOS 검색**: `node scripts/aios.mjs search "<query>"` 로 project memory, pinned memo, docs, plans, code 를 한 번에 검색합니다.
- **크로스 클라이언트 메모리 안전성**: `project_shared` 는 모든 클라이언트에 보이고, `agent_private` 는 일치하는 `--agent <runtime-client-id>` 에서만 보입니다.
- **모든 클라이언트 native guidance**: Codex/OpenCode/Crush 는 `AGENTS.md`, Claude 는 `CLAUDE.md`, Gemini/Antigravity 는 `GEMINI.md` 로 같은 search 지침을 받습니다.
- **릴리스 튜토리얼**: [v1.50.0 통합 검색 튜토리얼](/blog/ko/2026-06-v150-unified-aios-search/) 과 [ContextDB](contextdb.md#통합-프로젝트-검색v1500) 를 참고하세요.

이 페이지에서 `AIOS` 변경 이력을 추적하고 관련 문서로 이동할 수 있습니다.

## 공식 릴리스 이력

[⭐ GitHub에서 Star](https://github.com/rexleimo/aios){ .md-button .md-button--primary }
[📦 Releases 보기](https://github.com/rexleimo/aios/releases){ .md-button }

## 최신 안정 버전

- `1.17.0` (2026-05-16):
  - **Memo Storage**: `aios memo` 는 storage abstraction 을 사용하며 public implementation 은 `file` (기본 append-only JSONL: `.aios/memo/file/events.jsonl`) 과 `split` (memo event 마다 JSON 파일 하나) 두 가지입니다. `aios memo storage status`, `aios memo storage use split`, `aios memo storage use file`, `aios memo storage rebuild`, `aios memo storage doctor` 로 관리합니다.
  - **Git-friendly memo source of truth**: `.aios/memo/` 가 project memo 의 canonical root 입니다. ContextDB/SQLite 는 호환 mirror 와 재구축 가능한 cache 이며 memo source of truth 가 아닙니다.
  - **Runtime state alignment**: 새로운 ContextDB runtime state 는 `.aios/context-db/` 에 기록됩니다. legacy `memory/context-db` 는 이미 존재할 때만 compatibility read path 로 사용됩니다.
  - 자세한 내용은 [ContextDB](contextdb.md#workspace-memory-aios-memo) 의 memo storage boundary 를 참조하세요.

- `1.11.0` (2026-05-09):
  - **debug-hub v0.3**: 인스트루먼트 추적과 자동 정리. 새로운 MCP 도구: `instrument`, `list_instruments`, `cleanup_instruments`. 마커 규칙 `DH:<sessionId>`로 제로 의존성 디버그 코드 주입과 듀얼 모드 정리 (명시적 모드는 instrument 기록, 폴백은 workspace grep). `dryRun` 미리보기 지원. 워크스페이스 메모리를 통한 크로스 모델 디버그 프로토콜. 업스트림 debug 스킬을 debug-hub 스킬로 교체. 자세한 내용은 [debug-hub](debug-hub.md) 참조.

- `1.10.0` (2026-05-09):
  - **debug-hub v0.2**: 자동 Trace 물질화(디바운스), agent 디버깅 세션, 구조화 증거 이벤트, `/api/health`, `timeline` / `health` / `compact_context` MCP 도구를 추가했습니다. HTTP 엔드포인트 입력 검증, MCP 인수 검증, 경로 탐색 방지, 대소문자 구분 없는 검색, 디바운스된 트레이스 인덱싱이 포함됩니다. 자세한 내용은 [debug-hub](debug-hub.md)를 참조하세요.

- `1.8.0` (2026-05-08):
  - 래핑된 `codex`, `claude`, `gemini`, `opencode`, `hermes`, `grok` 세션용 self-trigger harness routing 을 추가했습니다.
  - **Model Router**: Agent Team 을 위한 지능형 멀티모델 디스패치. 모델 능력 레지스트리 (8개 모델), 태스크 유형별 모델 라우팅, 3가지 CLI 프로토콜 어댑터 (claude/codex/gemini), 비용 오름차순 폴백 체인, 에이전트 호출 가능한 `model-router` 스킬, `AIOS_MODEL_{ROLE}` 환경 변수 오버라이드, 피드백 루프 통합을 포함합니다. 자세한 내용은 [모델 라우터](model-router.md)를 참조하세요.
  - **GroupChat Runtime**: `aios team` 라이브 모드가 이제 공유 대화 히스토리를 갖춘 라운드 기반 에이전트 실행을 사용합니다. 각 라운드의 에이전트는 병렬로 실행되며, 모든 에이전트가 전체 누적 스레드를 볼 수 있습니다. 막힌 에이전트는 자동으로 re-plan 라운드를 트리거합니다. 기존의 일회성 격리 dispatch 모델과 대조됩니다.
  - **OpenCode CLI subagent 지원**: `opencode-cli` 가 모든 orchestration 경로 (subagent, team, GroupChat runtime) 에서 완전히 지원되는 `AIOS_SUBAGENT_CLIENT` 가 되었습니다.

## 이전 안정 버전

- `1.7.1` (2026-04-26):
  - Solo Harness 릴리스 게시글을 추가했습니다.
  - 기존 persona/user profile memory layer (`aios memo persona ...`, `aios memo user ...`) 를 명확히 문서화해 이전 문서 누락을 수정했습니다.

- `1.7.0` (2026-04-26):
  - 단일 agent 야간 실행용 `aios harness` 추가. run journal, stop/resume 제어, HUD 표시, 선택적 worktree 격리를 지원합니다.
  - 공식 `Solo Harness` 문서를 English, 中文, 日本語, 한국어 사이트에 동기화했습니다.

## 더 이전 안정 버전

- `1.6.3` (2026-04-25):
  - 중국어 문서의 시각적 온보딩 구조를 English, 日本語, 한국어 페이지로 동기화.
  - Overview, Quick Start, 시나리오별 명령, Agent Team 페이지를 같은 초보자 우선 흐름으로 업데이트.

- `1.6.2` (2026-04-25):
  - 공식 문서에 초보자 경로, TUI Setup/Doctor, ContextDB 기억 루프, Agent Team/HUD 시각 가이드를 추가.
  - 새 사용자가 고급 ContextDB, Agent Team, orchestration 개념보다 먼저 작업별 명령을 고를 수 있도록 온보딩을 개선.

- `1.6.1` (2026-04-25):
  - clean Linux checkout 에서 GitHub Release pipeline 이 통과하도록 복구.
  - 중국어 온보딩 문서를 단순화해 새 사용자가 작업별로 명령을 찾기 쉽게 개선.

## 최근 버전

- `main` (미릴리스):
  - **debug-hub MCP 네이티브 디버그 로그 서비스** (2026-05-06): coding agent 전용 MCP 네이티브 디버그 로그 수집. Node.js/Browser/Go SDK, 내장 Web UI, `~/.debug-hub/` 파일 기반 스토리지, 5개 MCP 도구 (`list_traces`, `get_trace`, `search_logs`, `get_stats`, `clear_logs`) 로 agent 자가 진단 제공. agent 가 인간 개입 없이 자신의 런타임 로그를 내성 가능
	  - **Agent self-trigger harness routing** (2026-05-05): 래핑된 `codex` / `claude` / `gemini` / `opencode` / `hermes` / `grok` 세션이 `single/subagent/team/harness` 를 안내합니다; 장시간/야간/재개 가능 목표는 `aios harness run ... --workspace <project-root>` 를 자체 트리거할 수 있고, `--max-iterations` 및 `CTXDB_HARNESS_PROVIDER` / `CTXDB_HARNESS_MAX_ITERATIONS` 로 제어할 수 있습니다
  - **래핑된 coding agent 용 Privacy Shield** (2026-04-24): ContextDB shell 대화형 CLI 시작 시 Privacy Guard 상태, 사용자 지정 모델 중계 엔드포인트 감지, `aios privacy read --file <path>` 안전 읽기 경로를 보여주는 컬러 프라이버시 패널을 출력; 자동 프롬프트도 LLM 개인정보 지시는 권고적이며 검증 가능한 보호는 deterministic AIOS gate 에서 수행된다고 명시
  - **ContextDB Shell 시작 최적화** (2026-04-22): `ctx()` 가 `npm run -s contextdb` 대신 컴파일된 `mcp-server/dist/contextdb/cli.js` 를 우선 사용하여 호출당 오버헤드를 ~0.3s 에서 ~0.06s 로 감소; one-shot 에이전트 실행을 ~2.2s 에서 ~0.5s 로 단축(약 78% 빨라짐); shell-bridge 의 `detectRunner` 가 `tsx` 를 더 이상 필요로 하지 않음; 설치 시 `dist/` 가 없으면 자동 빌드하고 빌드 실패 시 npm-run 모드로 우아하게 폴패
  - **기본 core skills 업데이트** (2026-04-19): `awesome-design-md`, `frontend-design`, `cap-commit-push` 를 기본 core skills 로 승격
  - **ContextDB 레이지 로드** (2026-04-18 ~ 2026-04-19): 대화형 세션이 기본적으로 레이지 컨텍스트 로드 (`CTXDB_LAZY_LOAD=on`) 를 사용; 에이전트가 전체 컨텍스트 팩 주입 대신 퍼싸드 프롬프트로 메모리를 자체 발견; [레이지 로드 문서](contextdb.md#lazy-load) 및 다국어 블로그 게시글 추가
  - **AIOS 워크플로우 라우터 skill** (2026-04-18): 안정적인 태스크에서 skill 로의 라우팅과 발견을 위해 `.claude/skills/aios-workflow-router` 추가
  - **Browser MCP 를 browser-use CDP 로 마이그레이션** (2026-04-10): 기본 브라우저 런타임을 Playwright 에서 browser-use MCP over CDP 로 전환；새 런처 `scripts/run-browser-use-mcp.sh`；마이그레이션 명령 `aios internal browser mcp-migrate`；스크린샷 타임아웃 가드 `BROWSER_USE_SCREENSHOT_TIMEOUT_MS` 설정 가능
  - **HUD/Team skill-candidate 기능 개선** (2026-04-09 ~ 2026-04-10): 상세 보기를 위한 `--show-skill-candidates` 플래그；설정 가능한 `--skill-candidate-limit <N>`；fast-watch 모드 기본 제한을 6 에서 3 으로 축소；performance 향상을 위한 artifact 읽기 캐싱；HUD 가 `skill-candidate apply` 명령 제안；team status 에서 skill-candidate artifacts 와 drafts 표시
  - **Quality-gate 가시성** (2026-04-08 ~ 2026-04-09): HUD minimal status 와 team history summary 에 quality-gate category 표시；quality-failed-only 필터；multi-value 지원 quality prefix 필터
  - **Learn-eval draft 권장** (2026-04-07 ~ 2026-04-09): hindsight lesson drafts；skill patch draft candidates；draft recommendation apply 플로우；skill-candidate draft artifacts 지속성
  - **Turn-envelope v0** (2026-04-07): turn 기반 텔레메트리 이벤트 링크；harness 의 clarity entropy memo 커버리지
  - **Browser doctor 자동 복구** (2026-04-06 ~ 2026-04-08): `doctor --fix` 로 CDP 서비스 자동 복구；setup/update 라이프사이클에서 browser doctor 자동 복구；문서에 CDP 퀵커맨드 추가
  - **멀티 환경 RL 트레이닝 시스템**: shell, browser, orchestrator 어댑터를 가진 공유 `rl-core` 제어 플레인; 3 포인터 checkpoint 계통; 4 레인 replay pool; PPO + teacher distillation 트레이닝
  - **혼합 환경 캠페인** (`rl-mixed-v1`): 하나의 라이브 배치가 shell + browser + orchestrator episode 에 걸치고 통합 롤백 판단으로 실행
  - ContextDB `search` 가 기본으로 SQLite FTS5 + `bm25(...)` 랭킹, FTS 사용 불가 시 자동 레キシ컬 폴백
  - ContextDB 시맨틱 리랭킹이 쿼리 스코프 레キシ컬 후보에서 동작하여 오래된 완전 일치 드롭 감소
  - `aios orchestrate` 의 `subagent-runtime` 라이브 실행（`AIOS_EXECUTE_LIVE=1` 로 opt-in）
  - 소유권 힌트와 함께 바운드 work-item 큐 스케줄링
  - no-op 패스트 패스: 상류 handoff 가 파일을 터치하지 않았을 때 `reviewer` / `security-reviewer` 자동 완료
  - `main` push 시 Windows PowerShell shell-smoke 워크플로（`.github/workflows/windows-shell-smoke.yml`）
  - `global` / `project` 타겟 선택을 가진 스코프 인식 `skills` 설치 플로우
  - canonical skill authoring 이 이제 `skill-sources/` 에 있으며, repo-local 클라이언트 루트는 `node scripts/sync-skills.mjs` 로 생성
  - 기본 skills 설치 모드가 이제 이식 가능한 `copy`; 명시적 `--install-mode link` 는 로컬 개발을 위해 사용 가능
  - 릴리스 packaging/preflight 이 이제 `check-skills-sync` 로 생성 skill roots 검증
  - 코어 기본값, 선택적 business skills, 제거 시 설치된 항목만 표시하는 카탈로그 중심 skill 피커
  - TUI skill 피커가 항목을 `Core` 와 `Optional` 으로 그룹화하고 터미널 가독성을 위해 설명을 잘라냄
  - `doctor` 가 이제 동일명 글로벌 설치의 프로젝트 skill 오버라이드를 경고
  - Node 런타임 안내가 이제 Node 24 LTS 에 명시적으로 정렬
  - **Ink TUI 리팩터** (v1.1.0): TypeScript + Ink 기반 React 컴포넌트 TUI; REXCLI ASCII 아트 시작 배너; 적응형 watch 간격; 좌우 옵션 사이클링
- `0.17.0` (2026-03-17):
  - TUI 제거 피커가 이제 작은 터미널에서 스크롤하고 `Select all` / `Clear all` / `Done` 을 하단에 고정
  - 제거 커서 선택이 렌더링된 그룹 목록과 정렬 유지
  - 설정/업데이트 skill 피커가 이미 설치된 스킬을 `(installed)` 로 표시
- `0.16.0` (2026-03-10): orchestrator agent catalog 및 생성기 추가
- `0.15.0` (2026-03-10): `orchestrate live` 를 기본으로 gate（`AIOS_EXECUTE_LIVE`）
- `0.14.0` (2026-03-10): `subagent-runtime` 런타임 어댑터 (stub) 추가
- `0.13.0` (2026-03-10): 런타임 manifest 외부화
- `0.11.0` (2026-03-10): 로컬 orchestrate preflight 범위 확장
- `0.10.4` (2026-03-08): 비 git 워크스페이스 wrapper fallback 및 문서 동기화
- `0.10.3` (2026-03-08): Windows cmd-backed CLI 실행 수정
- `0.10.0` (2026-03-08): 설치/업데이트/제거 라이프사이클을 Node 로 통합
- `0.8.0` (2026-03-05): 엄격 모드 Privacy Guard(Ollama 지원) 및 설치 흐름 통합
- `0.5.0` (2026-03-03): ContextDB SQLite 사이드카 인덱스 (`index:rebuild`), 선택적 `--semantic` 검색, `ctx-agent` 실행 코어 통합

## 2026-03-16 운영 상황

- Continuous live 샘플이 성공 중（`dispatchRun.ok=true`）, 최신 아티팩트:
  - `.aios/context-db/sessions/codex-cli-20260303T080437-065e16c0/artifacts/dispatch-run-20260316T111419Z.json`
- `learn-eval` 이 아직 권장:
  - `[fix] runbook.failure-triage`（`clarity-needs-input=5`）
  - `[observe] sample.latency-watch`（`avgElapsedMs=160678`）
- latency-watch 관찰이 계속되는 동안 Timeout 예산은 현상 유지.

## 관련 읽기

- [블로그: Skills 설치 경험 업데이트](/blog/ko/2026-03-rexcli-skills-install-experience/)
- [빠른 시작](getting-started.md)
- [ContextDB](contextdb.md)
- [문제 해결](troubleshooting.md)

## 업데이트 규칙

설치, 런타임 동작, 호환성에 영향을 주는 릴리스는 같은 PR 에서 문서를 함께 업데이트하고 이 페이지에 반영합니다.
