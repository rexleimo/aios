---
title: 변경 로그
description: 릴리스 이력, 업그레이드 안내, 관련 문서 링크.
---

# 변경 로그

이 페이지에서 `Harness CLI` 변경 이력을 추적하고 관련 문서로 이동할 수 있습니다.

## 공식 릴리스 이력

- GitHub 변경 파일: [CHANGELOG.md](https://github.com/rexleimo/harness-cli/blob/main/CHANGELOG.md)
- GitHub Releases: [releases](https://github.com/rexleimo/harness-cli/releases)

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
  - 래핑된 `codex`, `claude`, `gemini`, `opencode` 세션용 self-trigger harness routing 을 추가했습니다.
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
	  - **Agent self-trigger harness routing** (2026-05-05): 래핑된 `codex` / `claude` / `gemini` / `opencode` 세션이 `single/subagent/team/harness` 를 안내합니다; 장시간/야간/재개 가능 목표는 `aios harness run ... --workspace <project-root>` 를 자체 트리거할 수 있고, `--max-iterations` 및 `CTXDB_HARNESS_PROVIDER` / `CTXDB_HARNESS_MAX_ITERATIONS` 로 제어할 수 있습니다
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
