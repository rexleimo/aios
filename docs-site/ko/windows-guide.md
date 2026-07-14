---
title: Windows 가이드: PowerShell 설정과 복구
description: Windows PowerShell에서 Harness CLI를 설치하고 프로젝트를 초기화하며 client sync, PATH, 구성 문제를 확인합니다.
---

# Windows 가이드

## 먼저 답하면

PowerShell 5.x 또는 7에서 TLS 1.2를 명시해 release installer를 실행하고 profile을 reload합니다. 그 다음 project root에서 aios init --all과 aios doctor --native --verbose를 실행하세요. 진단 output이 PATH, Node.js, client sync, native integration의 근거입니다.

## 전제 조건

~~~powershell
$PSVersionTable.PSVersion
node -v
npm -v
git --version
~~~

Node.js 24 LTS를 사용합니다. execution policy로 설치가 막히면 조직 policy를 따르고 credential이나 profile 전체를 지원 요청에 포함하지 마세요.

## 설치와 PowerShell profile reload

~~~powershell
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm https://github.com/rexleimo/harness-cli/releases/latest/download/aios-install.ps1 | iex
. $PROFILE
~~~

profile이 아직 없다면:

~~~powershell
New-Item -ItemType File -Path $PROFILE -Force
. $PROFILE
~~~

reload 후에도 PATH가 갱신되지 않으면 새 PowerShell window를 여세요.

## 프로젝트 초기화와 확인

project root에서 실행합니다.

~~~powershell
aios init --all
aios doctor --native --verbose
~~~

marker는 .aios/context-db/index.json을 가리킵니다. 진단 결과를 확인한 뒤 client를 실행합니다.

~~~powershell
codex
# 또는 claude
# 또는 gemini
# 또는 opencode
# 또는 hermes
# 또는 grok
~~~

unattended setup:

~~~powershell
node scripts/aios.mjs init --all --yes-compression-tools --yes-headroom-mcp
~~~

--dry-run은 package나 client configuration을 쓰지 않고 변경을 preview합니다.

## Recovery commands

### aios를 찾을 수 없음

~~~powershell
Get-Command aios -ErrorAction SilentlyContinue
$env:Path -split ';'
. $PROFILE
~~~

계속 찾을 수 없으면 새 PowerShell process에서 installer를 다시 실행하세요.

### Node.js 버전이 다름

~~~powershell
node -v
where.exe node
npm -v
~~~

Node.js 24 LTS를 설치하거나 선택하고 profile을 reload한 뒤 aios doctor를 다시 실행합니다.

### Native client sync가 불완전함

~~~powershell
aios doctor --native --verbose
aios doctor --native --fix
node scripts/aios.mjs init --all --dry-run
~~~

fix 전에 dry-run plan을 확인하세요. dry run 성공은 live provider가 작동한다는 증거가 아닙니다.

### Project memory가 보이지 않음

~~~powershell
Test-Path .aios\context-db\index.json
Get-ChildItem .aios -Force
aios doctor --native --verbose
~~~

의도한 project root에서 aios init을 실행했는지 확인합니다. .contextdb-enable은 오래된 compatibility script용이며 현재는 .aios/context-db/index.json marker를 사용합니다.

## FAQ

### Windows installer가 coding client를 대체하나요?

아닙니다. Harness CLI layer와 지원 integration을 설치합니다. codex, claude, gemini, opencode, hermes, grok은 계속 사용합니다.

### TLS 1.2를 지정하는 이유는?

일부 PowerShell 환경이 오래된 protocol을 기본 협상합니다. installer request에 사용할 HTTPS protocol을 명시하는 것이며 이후 client나 provider network behavior를 바꾸지 않습니다.

### 문제 보고에 무엇을 포함하나요?

command, exit code, Node와 PowerShell version, 관련 aios doctor output을 포함합니다. token, cookie, private path, client credential은 redaction하세요.

## 다음 페이지

- [빠른 시작](getting-started.md)
- [문제 해결](troubleshooting.md)
- [Workflow Policy](workflow-policy.md)
