---
title: 문제 해결
description: 일반적인 설치/런타임 문제 및 직접 수정 방법.
---

# 문제 해결

## 빠른 답변 (AI 검색)

대부분의 실패는 설정 문제입니다 (MCP 런타임 누락, 래퍼 미로드, 또는 잘못된 랩 모드). 먼저 doctor 스크립트를 실행하고 래퍼 스코프를 확인하세요.

## ContextDB가 Node 전환 후 실패

Harness CLI는 **Node 24 LTS**를 기준으로 하며, ContextDB는 Node 내장 `node:sqlite`를 사용합니다. 외부 SQLite native addon을 rebuild할 필요가 없습니다.

빠른 수정:

```bash
node -v
source ~/.nvm/nvm.sh
nvm install 24
nvm use 24
cd mcp-server && npm run test:contextdb
```

재시도:

```bash
npm run test:scripts
```

## Browser MCP 도구 이용 불가

**대부분의 경우**: Playwright MCP가 설치되지 않았거나, `~/.config/codex/` (또는 `~/.config/claude/` etc.)의 MCP 설정에 `puppeteer-stealth` 앨리어스가 없습니다.

Doctor 스크립트로 확인하세요:

=== "macOS / Linux"

    ```bash
    scripts/doctor-browser-mcp.sh
    ```

=== "Windows (PowerShell)"

    ```powershell
    powershell -ExecutionPolicy Bypass -File .\\scripts\\doctor-browser-mcp.ps1
    ```

또는 `~/.config/codex/mcp.json` (또는 `~/.config/claude/settings.json` for Claude Code, `~/.gemini/mcp.json` for Gemini CLI)를 열고 다음이 포함되어 있는지 확인하세요:

```json
{
  "mcpServers": {
    "puppeteer-stealth": {
      "command": "node",
      "args": ["/path/to/harness-cli/mcp-server/dist/puppeteer-stealth-server.js"]
    }
  }
}
```

## `EXTRA_ARGS[@]: unbound variable`

원인: 이전 `ctx-agent.sh`에서 `bash set -u` 빈 배열 전개 경계 케이스 오류.

수정:

1. 최신 `main`을 pull하세요.
2. 셸을 다시 열고 `claude`/`codex`/`gemini`를 재시도하세요.

최신 버전은 셸과 Node 래퍼 모두에 unified 런타임 코어 (`ctx-agent-core.mjs`)를 사용하여 이 드리프트를 해소했습니다.

## `search`가 사이드카 손실 후 빈 결과 반환

`.aios/context-db/index/context.db`가 없거나 오래된 경우:

1. `cd mcp-server && npm run contextdb -- index:rebuild` 실행
2. `search` / `timeline` / `event:get` 재실행

## `contextdb context:pack failed`

`contextdb context:pack`이 실패하면 `ctx-agent`는 **경고 후 계속 진행** 합니다 (컨텍스트 미주입 상태로 CLI 실행).

팩킹 실패를 치명적으로 만들려면:

```bash
export CTXDB_PACK_STRICT=1
```

셸 래퍼(`codex`/`claude`/`gemini`)는 인터랙티브 세션이 깨지는 것을 피하기 위해 `CTXDB_PACK_STRICT=1`을 설정해도 기본은 fail-open입니다. 인터랙티브 래핑도 엄격 모드로 강제하려면:

```bash
export CTXDB_PACK_STRICT_INTERACTIVE=1
```

자주 발생하면 퀄리티 게이트(ContextDB 회귀 체크 포함)를 실행하세요:

```bash
aios quality-gate pre-pr --profile strict
```

## `/new` (Codex) 또는 `/clear` (Claude/Gemini) 후 컨텍스트 사라짐

이러한 명령은 **CLI 내부 대화 상태**를 리셋합니다. ContextDB는 디스크에 남아 있지만 래퍼가 컨텍스트 패킷을 주입하는 것은 **CLI 프로세스 시작 시**뿐입니다.

복구 방법:

- 권장: CLI를 종료한 뒤 셸에서 `codex` / `claude` / `gemini`를 다시 실행
- 같은 프로세스에서 계속해야 한다면: 새 대화 첫 메시지에서 최신 스냅샷을 읽도록 요청:
  - `@.aios/context-db/exports/latest-codex-cli-context.md`
  - `@.aios/context-db/exports/latest-claude-code-context.md`
  - `@.aios/context-db/exports/latest-gemini-cli-context.md`

클라이언트가 `@file` 참조를 지원하지 않으면 파일 내용을 첫 프롬프트로 붙여넣으세요.

## `aios orchestrate --execute live`가 블록/실패함

라이브 오케스트레이션은 옵트인입니다.

1. 라이브 실행 게이트 활성화:

```bash
export AIOS_EXECUTE_LIVE=1
```

2. codex-cli 전용 서브에이전트 클라이언트 설정 (필수):

```bash
export AIOS_SUBAGENT_CLIENT=codex-cli
```

3. `codex`가 PATH에 있고 인증되었는지 확인 (예: `codex --version`).

Windows 빠른 확인 (PowerShell):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\doctor-contextdb-shell.ps1
codex --version
codex
```

예상 동작: TTY 오류(`stdout is not a terminal` 등) 없음, 인터랙티브 `codex` 세션이 터미널에 정상적으로 연결.

팁 (codex-cli): Codex CLI v0.114+는 `codex exec` 구조화 출력 지원 (`--output-schema`, `--output-last-message`, stdin). AIOS는 사용 가능할 때 안정적인 JSON handoff를 위해 이를 활용합니다. Codex child worker는 기본적으로 `--dangerously-bypass-approvals-and-sandbox`를 붙여 unattended live run이 approval/sandbox prompt에서 멈추지 않게 합니다. 수동 디버깅 시에만 `AIOS_SUBAGENT_CODEX_UNATTENDED=0`으로 끄세요.

팁: 모델 콜 없이 DAG를 검증하려면 `--execute dry-run` 사용 (또는 라이브 런타임 어댑터 시뮬레이션용 `AIOS_SUBAGENT_SIMULATE=1`).

일반적인 실패 시그니처:

- `type: upstream_error` / `server_error`: 상류 불안정. 나중에 재시도 (AIOS는 자동으로 몇 번 재시도함).
- `Timed out after 600000 ms`: `AIOS_SUBAGENT_TIMEOUT_MS` 증가 (예: `900000`) 또는 `AIOS_SUBAGENT_CONTEXT_LIMIT` / `AIOS_SUBAGENT_CONTEXT_TOKEN_BUDGET`로 컨텍스트 패킷 축소.
- `invalid_json_schema` (`param: text.format.schema`): 백엔드가 구조화 출력 스키마를 거부함. 최신 `main`을 pull하고 재시도. AIOS는 스키마 거부를 감지하면 `--output-schema` 없이 재시도.

최소 구조화 출력 스모크 체크 (macOS/Linux):

```bash
printf '%s' 'Return a JSON object matching the schema.' | codex exec --output-schema scripts/lib/specs/agent-handoff.schema.json -
```

## 명령어가 랩되지 않음

랩되지 않는 경우:

- git 레포 내부에 있는지 확인: `git rev-parse --show-toplevel`이 작동하는지
- `ROOTPATH/scripts/contextdb-shell.zsh`가 존재하고 source되었는지 확인
- `CTXDB_WRAP_MODE`가 현재 레포를 허용하는지 확인 (`opt-in`은 `.contextdb-enable` 필요)

먼저 래퍼 doctor 실행:

```bash
scripts/doctor-contextdb-shell.sh
```

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\doctor-contextdb-shell.ps1
```

## `CODEX_HOME points to ".codex"` 오류

원인: `CODEX_HOME`이 상대 경로로 설정됨.

수정:

```bash
export CODEX_HOME="$HOME/.codex"
mkdir -p "$CODEX_HOME"
```

최신 래퍼 스크립트는 명령 실행 시 상대 `CODEX_HOME`을 자동으로 정규화합니다.

## 래퍼가 로드되었지만 비활성화하고 싶음

영구적으로 비활성화하려면:

```zsh
export CTXDB_WRAP_MODE=off
```

## Skills가 잘못된 레포 디렉터리에 저장됨

canonical skill source tree는 이제 다음 위치에 있습니다:

- `<repo>/skill-sources`

생성된 repo-local 검색 가능 출력은 다음 위치에 있습니다:

- `<repo>/.codex/skills`
- `<repo>/.claude/skills`

`SKILL.md`를 `.baoyu-skills/`와 같은 병렬 디렉터리에 저장하면 Codex / Claude는 이를 스킬로 검색하지 못합니다.

- `.baoyu-skills/`는 `EXTEND.md`와 같은 확장 설정에만 사용하세요
- 실제 canonical skill 소스 파일은 `skill-sources/<name>/SKILL.md`로 이동하세요
- `node scripts/sync-skills.mjs`로 각 클라이언트의 호환 디렉터리를 다시 생성하세요
- `scripts/doctor-contextdb-skills.sh --client all`로 미지원 스킬 루트 디렉터리를 감지하세요

## `--scope project`가 Harness CLI 소스 레포 내에서 실패함

canonical skill source tree 마이그레이션 후 발생합니다. 이는 의도적인 동작입니다:

- `skill-sources/`가 작성 트리입니다
- repo-local의 `.codex/skills` / `.claude/skills` / `.agents/skills`는 sync 관리 생성 디렉터리입니다
- 소스 레포 자신에 대한 `--scope project` 인스톨은 의도적으로 차단되어 있습니다

대신 다음을 실행하세요:

```bash
node scripts/sync-skills.mjs
node scripts/check-skills-sync.mjs
```

다른 프로젝트에 skills를 설치하고 싶다면 해당 워크스페이스로 전환한 뒤 `aios ... --scope project`를 실행하세요.

## 이 저장소 skills가 다른 프로젝트에서 보이지 않음

래퍼와 skills는 분리되어 있습니다. 전역 skills를 별도로 설치하세요. `--client all`은 `codex` / `claude` / `gemini` / `opencode`를 함께 대상으로 합니다.

=== "macOS / Linux"

    ```bash
    scripts/install-contextdb-skills.sh --client all
    scripts/doctor-contextdb-skills.sh --client all
    ```

=== "Windows (PowerShell)"

    ```powershell
    powershell -ExecutionPolicy Bypass -File .\\scripts\\install-contextdb-skills.ps1 -Client all
    powershell -ExecutionPolicy Bypass -File .\\scripts\\doctor-contextdb-skills.ps1 -Client all
    ```

## GitHub Pages `configure-pages` 찾을 수 없음

이通常是 Pages 소스가 완전히 활성화되지 않았음을 의미합니다.

GitHub 설정에서 수정:

1. `Settings -> Pages -> Source: GitHub Actions`
2. `docs-pages` 워크플로를 다시 실행

## FAQ

### 브라우저 도구를 사용할 수 없을 때 처음 무엇을 실행해야 하나요?

재설치 전에 `scripts/doctor-browser-mcp.sh`（또는 PowerShell 버전）를 실행하세요.

### `codex`를 입력해도 컨텍스트가 주입되지 않는 이유는 무엇인가요?

일반적으로 래퍼가 로드되지 않았거나, `CTXDB_WRAP_MODE`가 현재 워크스페이스를 커버하지 않거나, 명령어가 패스스루 관리 서브커맨드인 경우입니다.

## 스킬이 잘못된 레포 디렉터리에 저장됨

canonical repo skill sources의 위치가 변경되었습니다:

- `<repo>/skill-sources`

생성된 repo-local 검색 가능 출력의 위치:

- `<repo>/.codex/skills`
- `<repo>/.claude/skills`

병렬 디렉터리(예: `.baoyu-skills/`)에 `SKILL.md`를 저장하면 Codex / Claude는 이를 스킬로 검색하지 못합니다.

- `.baoyu-skills/`는 `EXTEND.md`와 같은 확장 설정에만 사용
- 실제 canonical skill 소스 파일은 `skill-sources/<name>/SKILL.md`로 이동
- `node scripts/sync-skills.mjs`로 생성된 클라이언트 루트를 다시 구축
- `scripts/doctor-contextdb-skills.sh --client all`로 미지원 스킬 루트 디렉터리를 감지
