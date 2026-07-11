---
title: Token 인텔리전스와 압축
description: RTK, Caveman, Headroom MCP, ContextDB, Ponytail에서 영감을 얻은 의사결정 게이트로 유용한 컨텍스트를 작게 유지합니다.
---

# Token 인텔리전스와 압축

token 절약은 Agent가 올바른 판단에 필요한 증거를 계속 가질 때만 의미가 있습니다. AIOS v3.6.0은 먼저 불필요한 작업을 피하고, 그 다음 각 단계가 들고 가야 하는 텍스트를 줄이는 계층형 workflow를 사용합니다.

## 다섯 계층

| 계층 | 역할 | 보장하지 않는 것 |
| --- | --- | --- |
| Ponytail에서 영감을 얻은 게이트 | 구현 전에 가장 작고 올바른 변경을 선택합니다. | 설치되는 Ponytail plugin이 아닙니다. |
| RTK | Agent에 도달하기 전 shell / tool 출력의 노이즈를 줄입니다. | 범위를 좁힌 command를 대체하거나 원시 log의 모든 줄을 보존하지는 않습니다. |
| Headroom MCP | 이후 step에도 필요한 자료를 지원되는 MCP client가 명시적으로 압축하게 합니다. | 현재 model request를 투명하게 interception하지 않습니다. |
| Caveman | 기술적 사실을 빼지 않고 response style을 간결하게 만듭니다. | tool이나 file 자체를 압축하지 않습니다. |
| ContextDB | 모든 history를 inject하지 않고 필요할 때 project context를 recall합니다. | runtime history가 모든 prompt에 자동으로 나타나게 하지는 않습니다. |

planning, test, code-review 증거, privacy check, verification은 이 스택 밖의 품질 게이트로 계속 필요합니다.

## 설치와 확인

설치 경계로 `aios init`을 사용합니다.

```bash
# 미리 보기만 합니다. package나 client configuration을 바꾸지 않습니다.
node scripts/aios.mjs init --all --dry-run

# 대화형: 감지된 RTK, Caveman, 지원되는 Headroom을 install합니다.
node scripts/aios.mjs init --all

# CI 등 무인 설치.
node scripts/aios.mjs init --all --yes-compression-tools

# Gemini 및 Grok의 user-scope Headroom MCP registration도 허용합니다.
node scripts/aios.mjs init --all --yes-compression-tools --yes-headroom-mcp
```

Headroom에는 Python 3.10 이상과 `uv` 또는 `pipx`가 필요합니다. AIOS는 검증된 `headroom-ai[all]>=0.31.0,<0.32.0`를 격리된 tool environment에 install하며 system Python environment를 조용히 바꾸지 않습니다.

`--yes-compression-tools`는 package installation을 허용합니다. `--yes-headroom-mcp`는 client user configuration 변경을 허용하므로 의도적으로 분리되어 있습니다. dry run은 package를 download하거나 configuration을 쓰지 않고 예정 상태를 보고합니다.

## RTK와 Caveman

RTK는 로컬 command-output layer입니다. 초기화 후 지원되는 command 출력을 Agent가 읽기 전에 filter할 수 있습니다. 중요한 error와 path가 계속 보이도록 범위를 좁힌 command를 사용하세요.

```bash
rg -n "pattern" path
git diff --stat
sed -n '120,180p' file.ts
tail -n 120 test.log
```

Caveman은 Agent 표현을 짧게 만드는 로컬 prompt skill입니다. command, path, error, date, decision, risk, 누락된 verification을 보존해야 합니다. status update와 checkpoint에 유용하지만 상세한 설명이 더 유용할 때는 보통 style로 돌아가세요.

## Headroom: MCP는 명시적이고 wrapper 지원은 별개입니다

Headroom upstream CLI에는 일부 client용 공식 `wrap` target이 있습니다. wrapped client는 Headroom 자체 proxy와 lifecycle을 사용할 수 있습니다. **AIOS v3.6.0은 `aios init`이 모든 client launch를 자동으로 wrap한다고 주장하지 않습니다.** Headroom install과 MCP server registration은 서로 다른 작업입니다.

이 integration에서 upstream wrap target이 없는 client는 AIOS가 client 자체 MCP command를 사용해 공식 `headroom mcp serve` process를 등록합니다.

| Client | v3.6.0 경로 | 중요한 조건 |
| --- | --- | --- |
| Gemini CLI | user-scope 공식 MCP registration | 별도 MCP consent가 필요합니다. |
| Grok Build | user-scope 공식 MCP registration | 별도 MCP consent가 필요합니다. |
| Hermes Agent | user-scope 공식 MCP registration | 실제 TTY에서 완료해야 합니다. 그렇지 않으면 `pending-interactive`입니다. |

MCP server는 `headroom_compress`, `headroom_retrieve`, `headroom_stats`를 노출합니다. model이 이 tool들을 명시적으로 호출합니다. 보통 압축을 요청하기 전에 원본 자료를 이미 보았으므로 현재 turn은 token을 전혀 절약하지 못하거나 tool call 하나를 더 쓸 수 있습니다. 이점은 이후 step에 있습니다. compact result를 보관하고 필요할 때만 original을 reference로 retrieve할 수 있습니다.

AIOS는 소유한 registration을 `~/.aios/integrations/headroom-mcp.json`에 기록합니다. 기존 `headroom` entry가 external이거나 예상 fingerprint와 다르면 installer가 `external` 또는 `conflict`를 보고하고 덮어쓰지 않습니다.

### ContextDB Packet

session history 압축에는 다음을 사용합니다.

```bash
npm run contextdb -- context:pack \
  --session <session-id> \
  --limit 80 \
  --token-budget 1200 \
  --token-strategy balanced
```

| Strategy | 사용할 때 | 동작 |
| --- | --- | --- |
| `balanced` | Default | 낮은 신호의 text를 압축하고 error와 최근 작업을 보존합니다. |
| `aggressive` | 매우 작은 budget | 최대한 압축하며 detail은 최소로 남깁니다. |
| `legacy` | 이전 동작 | history의 끝부분만 유지합니다. |

**보존되는 것**(삭제하지 않는 것):

- Error message와 failure signal
- File path와 command output
- 최근 state와 decision

## 실용적인 의사결정 순서

code, dependency, file, 넓은 context를 추가하기 전에 [Ponytail](https://github.com/DietrichGebert/ponytail)에서 영감을 얻은 순서를 사용합니다.

1. 설명, configuration change, 또는 더 작은 edit으로 요청을 해결할 수 있는가?
2. 이미 이를 다루는 function, document, tool이 있는가?
3. repository, page, log 전체를 읽는 대신 focused query를 사용할 수 있는가?
4. 그 다음에만 요구사항을 충족하는 가장 작은 tested implementation을 추가합니다.

browser 작업에서는 semantic snapshot, targeted text, full text, full HTML 순서로 compact evidence를 읽고, 시각 증거가 필요할 때만 screenshot을 사용합니다.

## Privacy와 측정

- RTK와 Caveman은 로컬에서 실행됩니다. Headroom install은 package repository와 선택적인 model resource에 접근할 수 있습니다.
- Headroom wrapper 또는 일반 client는 사용자가 설정한 model provider에 계속 model request를 보냅니다. 로컬 압축은 provider traffic이 사라진다는 약속이 아닙니다.
- upstream saving percentage는 upstream benchmark이지 로컬 AIOS 증거가 아닙니다. `headroom_stats`가 compression과 양수 saved-token total을 모두 보일 때만 측정된 MCP savings를 주장하세요.

## 추가 자료

- [v3.6.0 릴리스 노트](changelog.md)
- [Headroom + Ponytail workflow 글](https://cli.rexai.top/blog/ko/2026-07-headroom-token-intelligence/)
- [ContextDB](contextdb.md)
- [Ponytail upstream project](https://github.com/DietrichGebert/ponytail)
