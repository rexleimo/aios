---
title: 솔로 Harness
description: ContextDB, run journal, resume/stop 제어, 선택적 worktree 격리로 하나의 coding agent 를 밤새 안전하게 실행합니다.
---

# 솔로 Harness

`Solo Harness` 는 Harness CLI 의 **단일 agent 장시간 실행 레인**입니다.

하나의 provider 가 하나의 목표를 밤새 계속 밀어붙이게 하면서, 읽기 쉬운 run journal, 명시적인 stop/resume 제어, 필요할 때의 git worktree 격리를 유지하고 싶을 때 사용합니다.

## 언제 Solo Harness 를 쓰나요

잘 맞는 경우:

- “내일 아침 인계 메모 정리”, “릴리스 체크리스트 마무리”처럼 목표가 명확함.
- 여러 worker 로 쪼갤 만큼의 작업은 아님.
- one-shot 명령보다 재개 가능한 operator loop 가 필요함.
- 야간 변경을 메인 checkout 과 분리하고 싶음.
- `--hooks` / `--no-hooks`로 lifecycle hook 증거 기록을 제어하고 싶음.

잘 맞지 않는 경우:

- 작업을 독립 모듈로 나눠 병렬 처리할 수 있음 -> [Agent Team](team-ops.md) 사용.
- preflight gate 가 있는 단계형 DAG 가 필요함 -> `aios orchestrate ...` 사용.
- 요구가 아직 모호함 -> 먼저 일반 인터랙티브 `codex` / `claude` 로 분석.

## 빠른 시작

```bash
# 분리된 worktree 에서 야간 실행 시작
aios harness run --objective "내일 아침 인계 메모 정리" --session nightly-demo --worktree --max-iterations 20

# 구조화된 상태 확인
aios harness status --session nightly-demo --json

# 같은 session 을 HUD 로 확인
aios hud --session nightly-demo --json

# 안전한 경계에서 멈추도록 요청
aios harness stop --session nightly-demo --reason "아침에 사람이 인계"

# 나중에 같은 session 재개
aios harness resume --session nightly-demo --max-iterations 10
```

## 래핑된 CLI 에서 agent 자체 트리거

shell wrapping 이 켜져 있으면 대화형 `codex` / `claude` / `gemini` / `opencode` 세션이 AIOS route prompt 를 받습니다. 기본은 여전히 `single`이며, 명시적인 장시간/야간/재개 가능/checkpoint 중심 목표에만 agent 가 `harness` 를 선택해야 합니다.

이때 주입되는 명령 형태는 다음과 같습니다:

```bash
node <AIOS_ROOT>/scripts/aios.mjs harness run \
  --objective "<task>" \
  --provider codex \
  --max-iterations 8 \
  --worktree \
  --workspace <project-root>
```

provider 와 루프 예산은 환경 변수로 조정할 수 있습니다:

```bash
export CTXDB_HARNESS_PROVIDER=claude
export CTXDB_HARNESS_MAX_ITERATIONS=12
```

route prompt 를 완전히 끄려면 `CTXDB_INTERACTIVE_AUTO_ROUTE=0` 를 설정하세요.

## 먼저 dry-run

artifact 계약만 먼저 확인하고 token 은 쓰고 싶지 않다면:

```bash
aios harness run --objective "내일 아침 인계 메모 정리" --session nightly-demo --worktree --max-iterations 3 --dry-run --json
```

dry-run 은 session journal 만 만들고 provider 는 호출하지 않습니다.

## Hooks 제어

`run`과 `resume`은 hooks를 명시적으로 켜고 끌 수 있습니다:

```bash
aios harness run --objective "내일 아침 인계 메모 정리" --session nightly-demo --hooks
aios harness resume --session nightly-demo --no-hooks
```

- 기본값은 `--hooks`(활성)이며 lifecycle hook 증거를 기록합니다.
- 저노이즈 실행이 필요하면 `--no-hooks`를 사용하세요.

## 반복 예산과 workspace 제어

- `--max-iterations <n>` 은 `run` / `resume` 루프 예산을 제한합니다. CLI 기본값은 `20`, 래핑된 클라이언트 자체 트리거 prompt 기본값은 `8` 입니다.
- `--workspace <path>` 는 ContextDB session artifact 를 지정한 프로젝트 루트에 쓰도록 강제합니다. wrapper, 외부 checkout, 상위 디렉터리에서 AIOS 를 호출할 때 사용합니다.
- `--provider <codex|claude|gemini|opencode>` 는 루프가 사용할 로컬 CLI 를 선택합니다.

## 생성되는 파일

artifact 는 다음 경로에 저장됩니다:

```text
.aios/context-db/sessions/<session-id>/artifacts/solo-harness/
```

핵심 파일:

- `objective.md`: 정규화된 목표.
- `run-summary.json`: 현재 상태, 반복 횟수, backoff, worktree 정보.
- `control.json`: stop 요청과 operator 메모.
- `hook-events.jsonl`: hooks 활성 시 lifecycle 증거 로그.
- `iteration-0001.json`: 각 반복의 정규화 결과.
- `iteration-0001.log.jsonl`: 디버깅용 원시 로그.

## 실전 operator 루프

실용적인 야간 루프는 보통 이렇게 갑니다:

1. `aios harness run --worktree` 로 시작.
2. 자리를 뜨기 전에 `aios harness status --session <id> --json` 확인.
3. 사람이 읽기 쉬운 스냅샷이 필요하면 `aios hud --session <id>`.
4. 다음 안전한 경계에서 멈추게 하려면 `aios harness stop --session <id>`.
5. 다음 날 또는 수동 수정 후 `aios harness resume --session <id>`.

## Worktree 격리

야간 실행에는 `--worktree` 를 강하게 권장합니다.

현재 harness session 전용 git worktree 를 만들어 agent 가 메인 checkout 을 직접 수정하지 않게 합니다. 의미 있는 출력이 없으면 임시 worktree 를 자동 정리할 수 있고, 남길 가치가 있는 변경이 있으면 run summary 에 metadata 를 남겨 operator 가 이어받을 수 있게 합니다.

이 흐름은 무차별적인 `git reset --hard` 복구를 전제로 하지 않습니다.

## Provider / Runtime 참고

live 실행은 기존 one-shot `scripts/ctx-agent.mjs` provider 경로를 재사용합니다.

따라서 해당 로컬 CLI 가 설치되어 직접 실행 가능해야 합니다:

- `codex`
- `claude`
- `gemini`
- `opencode`

provider CLI 가 준비되지 않았다면 먼저 dry-run 으로 artifact 를 확인하고 readiness 를 맞추세요.

## Solo Harness 와 Agent Team 선택 기준

| 필요 | 더 적합한 것 |
|---|---|
| 단일 목표, 단일 provider, 재개 가능한 야간 실행 | `aios harness ...` |
| 분리 가능한 작업을 여러 worker 로 병렬 실행 | `aios team ...` |
| preflight gate 가 있는 단계형 orchestration | `aios orchestrate ...` |

## 관련 문서

- [HUD 가이드](hud-guide.md)
- [Agent Team](team-ops.md)
- [시나리오별 명령 찾기](use-cases.md)
- [문제 해결](troubleshooting.md)
