---
title: 빠른 시작
description: 설치부터 첫 사용까지 가장 짧은 경로. 먼저 TUI 를 열고 Doctor 를 실행한 뒤 프로젝트에서 agent 를 시작합니다.
---

# 빠른 시작

목표: **약 3분 안에 설치하고, TUI 를 열고, Doctor 를 한 번 실행한 뒤, 프로젝트에서 agent 를 시작합니다.**

RexCLI 의 모든 기능을 아직 몰라도 괜찮습니다. 먼저 이 페이지를 따라 하고, 그다음 [시나리오별 명령 찾기](use-cases.md)를 보세요.

## 필요한 것

- Node.js **22 LTS** 및 `npm`
- coding CLI 중 하나: `codex`, `claude`, `gemini`, `opencode`
- 작업할 프로젝트 디렉터리

Node 확인:

```bash
node -v
npm -v
```

Node 가 22 가 아니라면 먼저 전환하세요:

```bash
nvm install 22
nvm use 22
```

## 1) Stable Release 설치

=== "macOS / Linux"

    ```bash
    curl -fsSL https://github.com/rexleimo/rex-cli/releases/latest/download/aios-install.sh | bash
    source ~/.zshrc
    aios
    ```

    bash 를 사용한다면 `source ~/.zshrc` 를 `source ~/.bashrc` 로 바꾸세요.

=== "Windows PowerShell"

    ```powershell
    irm https://github.com/rexleimo/rex-cli/releases/latest/download/aios-install.ps1 | iex
    . $PROFILE
    aios
    ```

설치 기본 디렉터리는 `~/.rexcil/rex-cli` 이고, 통합 진입점은 `aios` 입니다.

!!! tip "git clone 은 언제 쓰나요?"
    미출시 `main` 브랜치 동작을 명시적으로 쓰고 싶을 때만 `git clone` 을 사용하세요. 일반 사용자는 GitHub Releases installer 를 우선 사용하세요.

## 2) TUI 에서 Setup 과 Doctor 완료

실행:

```bash
aios
```

권장 순서:

1. **Setup** 선택.
2. 구성요소는 `all`, 또는 최소 구성 `shell,skills,superpowers` 선택.
3. 설치가 끝나면 **Doctor** 선택.
4. Doctor 의 critical errors 가 0 이 된 뒤 사용을 시작합니다.

<figure class="rex-visual">
  <img src="../assets/visual-tui-setup-doctor.svg" alt="aios TUI 에서 먼저 Setup, 다음 Doctor 를 선택하는 그림">
  <figcaption>그림: TUI 를 열면 먼저 Setup, 그다음 Doctor 를 실행합니다. critical errors 가 0 이 되면 프로젝트로 이동해 `codex` / `claude` / `gemini` / `opencode` 를 시작하세요.</figcaption>
</figure>

shell wrapper 를 변경했다면 현재 shell 을 다시 불러옵니다:

=== "macOS / Linux"

    ```bash
    source ~/.zshrc
    ```

=== "Windows PowerShell"

    ```powershell
    . $PROFILE
    ```

## 3) 프로젝트에서 기억 켜기

프로젝트 디렉터리로 이동:

=== "macOS / Linux"

    ```bash
    cd /path/to/your/project
    touch .contextdb-enable
    codex
    ```

=== "Windows PowerShell"

    ```powershell
    cd C:\path	o\your\project
    New-Item -ItemType File -Path .contextdb-enable -Force
    codex
    ```

마지막 줄은 다음으로 바꿔도 됩니다:

```bash
claude
gemini
```

같은 프로젝트 디렉터리에서 실행하면 모두 같은 ContextDB 를 읽고 씁니다.

## 4) 첫 동작 확인

프로젝트 안에서 실행:

=== "macOS / Linux"

    ```bash
    aios doctor --native --verbose
    ls -la .aios/context-db
    ```

=== "Windows PowerShell"

    ```powershell
    aios doctor --native --verbose
    Get-ChildItem -Path .aios/context-db -ErrorAction SilentlyContinue
    ```

`sessions/`, `index/`, `exports/` 같은 디렉터리가 보이면 ContextDB 가 기록을 시작한 것입니다.

디렉터리가 아직 없다면 `codex` / `claude` / `gemini` / `opencode` 를 한 번 정상적으로 시작해 RexCLI 가 자동 초기화하도록 하세요. 바로 재설치할 필요는 없습니다.

그래도 보이지 않으면 실행:

```bash
aios doctor --native --fix
```

## 5) 가장 자주 쓰는 7개 명령

| 시나리오 | 명령 |
|---|---|
| TUI 열기 | `aios` |
| 기억이 붙은 Codex 시작 | `codex` |
| 현재 세션 상태 보기 | `aios hud --provider codex` |
| 한 agent 야간 실행 | `aios harness run --objective "내일 아침 인계 메모 정리" --worktree --max-iterations 20` |
| multi-agent 작업 실행 | `aios team 3:codex "X 구현 후 완료 전에 테스트 실행"` |
| team 진행 상황 모니터링 | `aios team status --provider codex --watch` |
| 제출 전 quality check | `aios quality-gate pre-pr --profile strict` |

setup 이후에는 네이티브 클라이언트 안에서 route shortcut 을 직접 사용할 수 있습니다:

- Claude/Gemini/OpenCode: `/single <task>`, `/subagent <task>`, `/team <task>`, `/harness <task>`.
- Codex: `/prompts:single <task>`, `/prompts:subagent <task>`, `/prompts:team <task>`, `/prompts:harness <task>`.
- 누락된 경우 `aios doctor --native --fix` 를 실행하세요.

## 6) Memo 로 지속 메모 관리

ContextDB 파일을 직접 만지지 않고도 지속적인 프로젝트 메모를 남기려면:

```bash
aios memo add "Need strict pre-PR checks #quality"
aios memo pin add "Avoid destructive git commands."
aios memo persona init
aios memo persona add "Response style: concise, direct, evidence-first"
aios memo user init
aios memo user add "Preferred language: zh-CN + technical English terms"
aios memo recall "quality gate" --limit 5
aios memo storage status
```

메모 레이어:

- `memo add/search/recall` -> canonical `memory/memo` storage (legacy ContextDB mirror는 호환용)
- `memo pin` -> canonical `memory/memo` pinned file (legacy mirror는 호환용)
- `memo persona/user` -> 전역 identity 파일 (`~/.aios/SOUL.md`, `~/.aios/USER.md`). workspace memo 보다 먼저 `ctx-agent` Memory prelude 에 주입됩니다

기본 project memo 는 `memory/memo/file/events.jsonl` (append-only JSONL) 에 기록됩니다. memo event 마다 JSON 파일 하나를 원할 때만 `aios memo storage use split` 을 사용하세요. `storage rebuild` 는 derived query files 만 다시 만들며 canonical records 는 다시 쓰지 않습니다.

## 7) Agent Team 최단 사용법

작업이 비교적 독립적인 부분으로 나뉠 수 있을 때만 사용하세요:

```bash
aios team 3:codex "사용자 설정 페이지 구현, 테스트 추가, 문서 업데이트"
aios team status --provider codex --watch
```

작은 bug 수정이거나 아직 어떻게 나눌지 모른다면 일반 실행부터 시작하세요:

```bash
codex
```

더 많은 판단 기준은 [Agent Team](team-ops.md)을 보세요.

## 8) 한 Agent 를 밤새 실행하기

하나의 provider 가 하나의 명확한 목표를 계속 진행하고 run journal 을 남겨야 한다면 Solo Harness 를 사용하세요:

```bash
aios harness run --objective "내일 아침 인계 메모 정리" --session nightly-demo --worktree --max-iterations 20
aios harness status --session nightly-demo --json
```

래핑된 `codex` / `claude` / `gemini` / `opencode` 에서 시작하면, 시작 route prompt 가 명시적인 장시간/야간/재개 가능/checkpoint 중심 작업에서 agent 에게 이 레인을 자체 트리거하도록 안내합니다. 주입 명령은 `--workspace <project-root>` 를 포함하므로 ContextDB artifact 는 현재 프로젝트에 남습니다.

기본 주입 루프 예산은 `CTXDB_HARNESS_MAX_ITERATIONS=<n>` 으로 바꿀 수 있습니다.

## 9) 브라우저 자동화 첫 진단

RexCLI 는 기본적으로 CDP/browser-use 경로로 브라우저 자동화를 사용합니다. 브라우저 관련 문제는 먼저 다음을 실행하세요:

```bash
aios internal browser doctor --fix
aios internal browser cdp-status
```

복잡한 페이지에서는 agent 가 먼저 페이지 텍스트/DOM 을 읽게 하고, 스크린샷은 fallback 으로 사용하세요. 처음부터 버튼을 무작정 클릭하지 마세요.

## 10) Privacy-safe read

`.env`, token, cookies, cloud config 를 model 에 그대로 붙여 넣지 마세요. 다음을 사용하세요:

```bash
aios privacy read --file <path>
```

RexCLI 가 wrap 한 `codex` / `claude` / `gemini` / `opencode` 시작 시 Privacy Shield 패널이 현재 보호 상태를 보여줍니다.

## 11) 업데이트와 제거

TUI 를 우선 사용하세요:

```bash
aios
```

명령으로도 실행할 수 있습니다:

```bash
aios update --components all --client all
aios uninstall --components shell,skills,native
```

## 12) 개발 설치 경로

메인테이너 또는 미출시 기능을 테스트하려는 경우:

=== "macOS / Linux"

    ```bash
    git clone https://github.com/rexleimo/rex-cli.git ~/.rexcil/rex-cli
    cd ~/.rexcil/rex-cli
    scripts/aios.sh
    ```

=== "Windows PowerShell"

    ```powershell
    git clone https://github.com/rexleimo/rex-cli.git $HOME\.rexcil\rex-cli
    cd $HOME\.rexcil\rex-cli
    powershell -ExecutionPolicy Bypass -File .\scripts\aios.ps1
    ```

개발 설치는 stable release 와 다릅니다. 일반 사용자는 step 1 의 one-liner 를 사용하세요.

## FAQ

### RexCLI 가 native CLI 를 대체하나요?

아니요. 계속 `codex`, `claude`, `gemini`, `opencode` 를 실행합니다. RexCLI 는 그 주변에 기억, skills, 진단, orchestration 을 추가합니다.

### Agent 가 AIOS 를 스스로 실행할 수 있나요?

예. 래핑된 클라이언트로 시작한 경우 시작 prompt 는 agent 에게 언제 `single` 로 유지할지, 언제 `team` / `subagent` 를 사용할지, 언제 장시간 목표를 `aios harness run ... --workspace <project-root>` 로 넘길지 안내합니다.

### 왜 `.contextdb-enable` 을 만드나요?

모든 디렉터리에서 컨텍스트를 기록하지 않도록 하는 opt-in 스위치입니다. 프로젝트 기억을 켜고 싶은 저장소에만 만드세요.

### ContextDB / Superpowers / Team Ops 를 먼저 배워야 하나요?

아니요. 새 사용자는 처음에 세 가지만 알면 충분합니다: setup/diagnostics 용 `aios`, project memory 용 `.contextdb-enable`, 일반 작업용 `codex`.

### Agent 는 몇 개로 시작해야 하나요?

먼저 `3` 을 권장합니다:

```bash
aios team 3:codex "task"
```

충돌이 늘면 `2` 로 낮추고, 작업이 매우 독립적일 때만 `4` 를 고려하세요.

### `CODEX_HOME points to ".codex"` 가 나오면?

`CODEX_HOME` 이 상대 경로라는 뜻입니다. 절대 경로로 바꾸세요:

```bash
export CODEX_HOME="$HOME/.codex"
mkdir -p "$CODEX_HOME"
```

### 다음에 무엇을 읽나요?

- [시나리오별 명령 찾기](use-cases.md)
- [Agent Team](team-ops.md)
- [ContextDB](contextdb.md)
- [문제 해결](troubleshooting.md)
