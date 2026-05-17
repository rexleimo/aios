---
title: 아키텍처
description: wrapper, runner, ContextDB 구성.
---

# 아키텍처

## Components

- `scripts/contextdb-shell.zsh`: CLI 래퍼
- `scripts/contextdb-shell-bridge.mjs`: wrap/passthrough 판단 브리지
- `scripts/ctx-agent.mjs`: 통합 러너
- `mcp-server/src/contextdb/*`: ContextDB 구현

## Runtime Flow

```text
사용자 명령 -> zsh wrapper -> contextdb-shell-bridge.mjs -> ctx-agent.mjs -> contextdb CLI -> 네이티브 CLI
```

## Storage Model

각 래핑된 워크스페이스는 독립적인 로컬 스토리지를 가집니다（git 루트가 있으면 사용, 없으면 현재 디렉터리）：

```text
.aios/context-db/
  manifest.json
  index/sessions.jsonl
  sessions/<session_id>/
  exports/<session_id>-context.md
```

## Isolation Controls

`CTXDB_WRAP_MODE`로 래퍼 스코프를 설정합니다:

- `all`: 모든 워크스페이스에서 활성화 (비 git 디렉터리 포함)
- `repo-only`: `ROOTPATH` 워크스페이스만
- `opt-in`: 마커(`.contextdb-enable`)가 있는 워크스페이스만
- `off`: 래핑 비활성화

프로젝트 단위 엄격 제어가 필요하면 `opt-in`을 사용하세요.

## Harness Layer (AIOS)

AIOS는 ContextDB 위에 운영자용 harness를 제공합니다:

- `aios orchestrate`이 블루프린트에서 로컬 dispatch DAG를 생성합니다
- `dry-run`은 `local-dry-run`을 사용합니다 (토큰 소비 없음)
- `live`는 `subagent-runtime`을 사용하고 외부 CLI(`codex`)로 페이즈를 실행합니다 (현재 codex-cli만 지원)
- `AIOS_SUBAGENT_CLIENT=codex-cli`일 때, AIOS는 `codex exec`의 구조화된 출력(`--output-schema`, `--output-last-message`, stdin)을 우선하여 JSON handoff를 안정화합니다 (구버전은 폴백)

`live`는 기본적으로 비활성화되어 있습니다. 다음이 필요합니다:

- `AIOS_EXECUTE_LIVE=1`
- `AIOS_SUBAGENT_CLIENT=codex-cli`

### Browser MCP (browser-use CDP)

2026-04-10 부터 기본 브라우저 MCP 런타임은 **browser-use MCP over CDP** 입니다:

- 런처: `scripts/run-browser-use-mcp.sh`
- 마이그레이션: `aios internal browser mcp-migrate`
- 도구: `chrome.launch_cdp`, `browser.connect_cdp`, `page.*`, `diagnostics.sannysoft`
- 프로파일 설정: `config/browser-profiles.json`
- 스크린샷 타임아웃 가드: `BROWSER_USE_SCREENSHOT_TIMEOUT_MS` (기본: 15 초)

레거시 Playwright MCP(`mcp-server/`) 는 호환성을 위해 유지되지만 기본값은 아닙니다.

## RL Training Layer (AIOS)

AIOS는 셸, 브라우저, 오케스트레이터 태스크 전반에 걸쳐 공유 학생 정책을 지속적으로 개선하는 멀티 환경 강화학습 시스템을 포함합니다.

### Shared Control Plane (`scripts/lib/rl-core/`)

```
campaign-controller.mjs   # epoch 오케스트레이션 (수집 + 모니터링)
checkpoint-registry.mjs  # active / pre_update_ref / last_stable 계통 추적
comparison-engine.mjs     # better / same / worse / comparison_failed
control-state-store.mjs  # 재시작 안전한 제어 스냅샷
epoch-ledger.mjs         # epoch 상태 + 성능 저하 연속 추적
replay-pool.mjs          # 4レーン 라우팅 (positive/neutral/negative/diagnostic)
reward-engine.mjs        # 환경 reward + teacher shaping 융합
teacher-gateway.mjs      # Codex/Claude/Gemini/opencode의 정규화된 출력
schema.mjs               # 공유 계약 검증
trainer.mjs              # PPO 엔트리포인트 (online + offline)
```

### Environment Adapters

| Adapter | Path | Training Focus |
|---------|------|---------------|
| Shell RL | `scripts/lib/rl-shell-v1/` | 합성 버그픽스 태스크 → 실레포지토리 |
| Browser RL | `scripts/lib/rl-browser-v1/` | 제어된 실제 웹 플로우 |
| Orchestrator RL | `scripts/lib/rl-orchestrator-v1/` | 고가치 제어 결정 |
| Mixed RL | `scripts/lib/rl-mixed-v1/` | 크로스 환경 연합 학습 |

### Key RL Concepts

- **Episode contract**: 전체 환경의 통일된 구조화된 출력 (taskId, trajectory, outcome, reward, comparison)
- **3포인터 checkpoint 계통**: `active` → `pre_update_ref` → `last_stable`, 성능 저하 시 자동 롤백
- **4레인 replay pool**: positive / neutral / negative / diagnostic_only — 비교 결과에 의한 결정적 라우팅
- **Teacher gateway**: Codex CLI, Claude Code, Gemini CLI, OpenCode의 정규화된 신호

### Running RL

```bash
# Shell RL 파이프라인
node scripts/rl-shell-v1.mjs benchmark-generate --count 20
node scripts/rl-shell-v1.mjs train --epochs 5
node scripts/rl-shell-v1.mjs eval

# 혼합 환경 campaign
node scripts/rl-mixed-v1.mjs mixed --mixed
node scripts/rl-mixed-v1.mjs mixed-eval
```

### RL Status

- RL Core: 안정 (40+ 테스트)
- Shell RL V1: 안정 (Phase 1–3)
- Browser RL V1: beta
- Orchestrator RL V1: beta
- Mixed RL: 실험적 (엔드투엔드 검증 완료)
