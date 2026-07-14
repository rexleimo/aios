---
title: 빠른 시작: Harness CLI 설치와 검증
description: 현재 명령으로 Harness CLI를 설치하고 프로젝트 guidance, ContextDB, client sync, 보안 검사를 확인합니다.
---

# 빠른 시작

## 먼저 답하면

Harness CLI는 지원되는 coding client를 위한 로컬 workflow layer입니다. 현재 설치 순서는 release를 설치하고 project root에서 aios init --all을 실행한 뒤 aios doctor --native --verbose로 결과를 확인하는 것입니다. 기존 client를 대체하지 않으며 모든 기록을 매번 prompt에 넣지도 않습니다.

## 준비물

- Node.js 24 LTS와 npm
- Git
- 지원 client 중 하나: codex, claude, gemini, opencode, hermes, grok(Grok Build)
- client guidance와 로컬 기억을 둘 project directory

~~~bash
node -v
npm -v
~~~

## Stable release 설치

=== "macOS / Linux"

    ~~~bash
    curl -fsSL https://github.com/rexleimo/harness-cli/releases/latest/download/aios-install.sh | bash
    source ~/.zshrc
    ~~~

    bash를 사용한다면 PATH를 관리하는 profile, 예를 들어 source ~/.bashrc를 reload합니다.

=== "Windows PowerShell"

    ~~~powershell
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm https://github.com/rexleimo/harness-cli/releases/latest/download/aios-install.ps1 | iex
    . $PROFILE
    ~~~

release installer를 권장합니다. 공개되지 않은 main source가 필요할 때만 repository를 clone하세요.

## 프로젝트 초기화

project root에서 실행합니다.

~~~bash
aios init --all
aios doctor --native --verbose
~~~

aios init은 반복 실행해도 됩니다. project integration marker와 저장소에 존재하는 지원 client guidance를 업데이트합니다. marker는 pull-based ContextDB의 로컬 registry인 .aios/context-db/index.json을 가리킵니다.

unattended setup에서는 외부 권한을 명시합니다.

~~~bash
node scripts/aios.mjs init --all --yes-compression-tools --yes-headroom-mcp
~~~

- --yes-compression-tools는 RTK, Caveman, Headroom package의 unattended 설치를 허용합니다.
- --yes-headroom-mcp는 지원 client의 user-scope Headroom MCP registration을 허용합니다.
- --dry-run은 다운로드나 client configuration 쓰기 없이 예정 상태만 보여줍니다.

## 첫 client 실행

같은 project directory에서 실행합니다.

~~~bash
codex
# 또는 claude
# 또는 gemini
# 또는 opencode
# 또는 hermes
# 또는 grok
~~~

client는 registry에서 필요한 guidance와 기억을 참조할 수 있습니다. ContextDB는 pull-based이므로 필요할 때 unified search, memo, checkpoint, context pack을 사용합니다.

## 설치 확인

client를 실행한 뒤 다시 진단합니다.

~~~bash
aios doctor --native --verbose
ls .aios/context-db/
~~~

진단 출력의 실제 checks와 paths를 근거로 삼으세요. warning은 provider나 live client route가 작동한다는 증거가 아닙니다. live route를 확인하려면 작은 task를 실행하고 status 또는 verification output을 보관합니다.

profile을 변경했다면 reload합니다.

=== "macOS / Linux"

    ~~~bash
    source ~/.zshrc
    ~~~

=== "Windows PowerShell"

    ~~~powershell
    . $PROFILE
    ~~~

## Legacy compatibility switch

일부 오래된 compatibility script는 .contextdb-enable을 opt-in marker로 인식합니다. 현재 설치의 primary path는 아닙니다.

=== "macOS / Linux"

    ~~~bash
    touch .contextdb-enable
    ~~~

=== "Windows PowerShell"

    ~~~powershell
    New-Item -ItemType File -Path .contextdb-enable -Force
    ~~~

오래된 wrapper나 compatibility workflow가 명시적으로 요구할 때만 사용하세요. 현재 project는 aios init과 .aios/context-db/index.json을 사용합니다. legacy file을 만든다고 기존 기억이 마이그레이션되거나 client sync가 증명되는 것은 아닙니다.

## Memo 저장과 검색

~~~bash
aios memo add "Keep authentication tests strict"
aios memo search "authentication"
aios memo storage status
~~~

Memo는 로컬 project data입니다. 기본적으로 .aios/memo/file/events.jsonl의 append-only JSONL을 사용합니다. storage, scope, rebuild, context pack은 [ContextDB](contextdb.md)에서 설명합니다.

## Recovery commands

~~~bash
aios doctor --native --verbose
aios doctor --native --fix
node scripts/aios.mjs init --all --dry-run
~~~

configuration 또는 package install 변경이 불확실하면 dry run부터 시작하세요. 질문할 때 diagnostic output을 함께 보관합니다.

## FAQ

### Harness CLI는 coding client를 대체하나요?

아닙니다. 원래 client를 계속 실행하고 Harness CLI가 기억, workflow route, optional tool, verification guidance를 추가합니다.

### aios init이 project memory를 upload하나요?

registry와 memo는 로컬 파일입니다. client provider, package, MCP의 network boundary는 각각 다릅니다. 로컬 설치가 이후 모든 model traffic이 로컬이라는 뜻은 아닙니다.

### 모든 client가 같은 기억을 공유하나요?

integration이 지원되고 sync된 경우 같은 project의 client가 같은 ContextDB registry를 사용할 수 있습니다. 실제 상태는 aios doctor --native --verbose로 확인하세요.

### 기억을 끄려면 어떻게 하나요?

client를 중지하고 client guidance에 따라 project integration marker를 조정합니다. 삭제 전 .aios/를 확인하세요. legacy workflow가 .contextdb-enable을 사용했다면 해당 file을 삭제할 수 있지만 marker 삭제만으로 기존 데이터가 지워지지는 않습니다.

## 다음 페이지

| 목적 | 페이지 |
| --- | --- |
| project memory와 unified search | [ContextDB](contextdb.md) |
| direct, guarded, planned 선택 | [Workflow Policy](workflow-policy.md) |
| 독립 작업 병렬화 | [Agent Team](team-ops.md) |
| 재개 가능한 장기 작업 | [Solo Harness](solo-harness.md) |
| 설치 실패 진단 | [문제 해결](troubleshooting.md) |
| intent별 명령어 | [사용 사례](use-cases.md) |
