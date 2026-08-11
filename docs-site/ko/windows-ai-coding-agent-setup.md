---
title: "Windows AI 코딩 에이전트 설정: 10분 안에 설치하고 검증하기"
description: "PowerShell로 Windows에 AI 코딩 에이전트를 설정합니다: AIOS 설치, PATH 문제 해결, 프로젝트 초기화, client 동기화 검증, 일반적인 실패 복구——마찰이 적은 완전한 가이드."
date: 2026-08-10
schema_type: techarticle
---

# Windows AI 코딩 에이전트 설정: 10분 안에 설치하고 검증하기

> **빠른 답:** Windows에서는 PowerShell 명령 하나로 AIOS를 설치하고, 프로필을 다시 로드하고, 프로젝트에서 `aios init --all`을 실행한 다음 `aios doctor --native --verbose`로 검증합니다. 이후 `aios`가 인식되지 않으면 PATH 항목이 다시 로드되지 않은 것입니다——셸을 재시작하거나 설치 디렉터리를 PATH에 수동으로 추가하세요. 총 시간: 작동하고 검증된 설정까지 10분 미만.

## 필요한 것

- PowerShell 5.x 또는 7이 있는 Windows 10/11
- Git
- Node.js 24 LTS
- 코딩 client 최소 하나: Codex, Claude Code, Gemini CLI, OpenCode, Hermes, Grok 중 하나

## 한 번의 명령으로 설치

PowerShell을 열고 실행합니다:

```powershell
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
irm https://github.com/rexleimo/aios/releases/latest/download/aios-install.ps1 | iex
```

그런 다음 `aios` 명령이 해석되도록 프로필을 다시 로드합니다:

```powershell
. $PROFILE
aios --version
```

## 초기화하고 검증

```powershell
cd C:\path\to\your\project
aios init --all
aios doctor --native --verbose
```

`aios init --all`은 프로젝트 마커를 만들고 지원되는 client를 감지합니다. `aios doctor`는 ContextDB, client 동기화, 안전 검사를 보고합니다——목록의 첫 번째 실행 가능한 항목을 고치세요.

## 일반적인 실패 복구

| 증상 | 해결 방법 |
| --- | --- |
| `aios`가 인식되지 않음 | 프로필을 다시 로드하거나(`. $PROFILE`) PowerShell을 다시 엽니다; 그래도 실패하면 AIOS 설치 디렉터리를 PATH에 수동으로 추가합니다. |
| `aios init`이 중간에 실패 | 프로젝트 루트에서 `aios init --all`을 다시 실행합니다; 초기화 프로그램은 idempotent입니다. |
| doctor가 client 드리프트 보고 | `aios doctor --native --verbose`를 실행하고 dry run을 확인한 다음 제안된 수정을 적용합니다. |
| 설치 시 TLS 오류 | 설치 명령 전에 `[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12`를 설정합니다. |

## FAQ

**AIOS가 Windows PowerShell 5.1에서 작동하나요?**
네——설치 프로그램과 wrapper는 PowerShell 5.x와 7을 지원합니다.

**WSL이 필요한가요?**
아닙니다. AIOS는 Windows에 네이티브로 설치됩니다; WSL은 선택 사항입니다.

**Windows Terminal을 사용할 수 있나요?**
네——AIOS는 Windows Terminal, PowerShell ISE, 표준 PowerShell 콘솔에서 작동합니다.

## 다음 단계

복구 절차는 전체 [Windows 가이드](https://cli.rexai.top/ko/windows-guide/)를 읽거나, [Quick Start](https://cli.rexai.top/ko/getting-started/)로 시작하세요.
