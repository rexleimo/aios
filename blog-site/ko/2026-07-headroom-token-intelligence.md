---
title: "v3.6.0: Headroom과 Ponytail로 더 안전한 Token 인텔리전스 workflow 만들기"
description: "Harness CLI는 RTK, Caveman, Headroom MCP, ContextDB, Ponytail에서 영감을 얻은 의사결정 게이트를 결합하면서 client configuration 소유권을 명시적으로 유지합니다."
date: 2026-07-10
tags: ["AIOS", "Headroom", "Ponytail", "RTK", "Caveman", "MCP", "token compression"]
---

# v3.6.0: Headroom과 Ponytail로 더 안전한 Token 인텔리전스 workflow 만들기

token을 절약한다고 해서 Agent가 좋은 engineering decision을 내리는 데 필요한 증거를 삭제해서는 안 됩니다. v3.6.0은 불필요한 작업을 피하고, 노이즈가 많은 input을 압축하며, step 간 큰 자료를 효율적으로 유지하고, 간결하게 작성하고, 필요할 때만 history를 recall하는 다섯 계층 token 인텔리전스 workflow의 installation 및 compatibility control plane을 추가합니다.

## 다섯 계층은 서로 다른 일을 합니다

| 계층 | 역할 |
| --- | --- |
| Ponytail에서 영감을 얻은 게이트 | code, dependency, file, 넓은 context를 추가하기 전에 가장 작고 올바른 변경을 고릅니다. |
| RTK | shell과 tool output의 노이즈를 로컬에서 줄입니다. |
| Headroom | 이후 MCP step에 필요한 자료의 compact representation을 저장하고 retrieve합니다. |
| Caveman | 기술적 사실을 삭제하지 않고 Agent response를 간결하게 유지합니다. |
| ContextDB | 모든 history를 inject하지 않고 이전 project context를 pull-based로 만듭니다. |

이 gate는 [Ponytail](https://github.com/DietrichGebert/ponytail)에서 영감을 얻었으며 source와 license를 존중합니다. AIOS는 upstream plugin을 install하거나 emulate한다고 주장하지 않습니다. planning, test, code review, privacy check, verification은 별도의 품질 게이트입니다.

## Headroom을 모든 shell에 강제하지 않는 이유

Headroom upstream CLI는 일부 client에 공식 `wrap` target을 제공합니다. wrapper는 자체 proxy, provider configuration, cleanup lifecycle을 담당합니다. 모든 client가 wrapped인 것처럼 shell level에서 injection하면 취약하고 다른 client configuration과 충돌할 수 있습니다.

따라서 v3.6.0 integration의 경계는 더 좁고 검증 가능합니다.

- `aios init`은 검증된 Headroom range를 감지하고 격리된 tool environment에 install합니다.
- Gemini CLI, Grok Build, Hermes Agent는 각각의 공식 MCP command로 공식 `headroom mcp serve` process를 등록합니다.
- AIOS는 절대 path의 Headroom executable을 사용하고 결과 entry를 다시 읽으며 AIOS 소유 registration만 `~/.aios/integrations/headroom-mcp.json`에 기록합니다.
- 기존 external entry나 일치하지 않는 entry는 `external` 또는 `conflict`로 보고하며 절대 덮어쓰지 않습니다.

Hermes는 host CLI의 tool-enable interaction 때문에 실제 TTY가 필요합니다. 비대화형 init은 성공이라고 주장하지 않고 `pending-interactive`를 보고합니다.

## MCP는 명시적 압축이지 투명한 interception이 아닙니다

`headroom_compress`, `headroom_retrieve`, `headroom_stats`는 model이 명시적으로 호출하는 MCP tool입니다. model은 압축을 요청하기 전에 원문을 이미 보는 경우가 많으므로 현재 turn에서는 token이 절약되지 않거나 tool call이 하나 더 들 수 있습니다.

이점은 이후 step에서 나타납니다. compact result를 보관하고 필요할 때만 original을 retrieve하며 statistics로 실제 작업을 측정할 수 있습니다. MCP saving을 측정되었다고 설명하는 것은 stats가 성공한 compression과 양수 saved-token total을 모두 보일 때뿐입니다. upstream benchmark percentage는 로컬 AIOS 증거가 아닙니다.

## 하나의 installation flow와 독립적인 두 permission

```bash
node scripts/aios.mjs init --all --dry-run
node scripts/aios.mjs init --all
node scripts/aios.mjs init --all --yes-compression-tools
node scripts/aios.mjs init --all --yes-compression-tools --yes-headroom-mcp
```

두 번째 무인 flag는 의도적으로 분리되어 있습니다. local package installation 허용이 user의 MCP configuration 변경 허용을 뜻하지는 않습니다. Headroom에는 Python 3.10 이상과 `uv` 또는 `pipx`가 필요합니다. AIOS는 검증된 `headroom-ai[all]>=0.31.0,<0.32.0` range를 사용하며 system Python environment에 조용히 install하지 않습니다.

## 실용적인 의사결정 순서

repository, web page, log 전체를 읽기 전이나 새 implementation을 추가하기 전에 다음을 묻습니다.

1. 더 작은 edit, configuration change, 또는 설명으로 해결할 수 있는가?
2. 재사용할 기존 implementation 또는 document가 있는가?
3. 필요한 증거를 focused query로 얻을 수 있는가?
4. 그 다음에만 가장 작은 tested change를 만듭니다.

이 순서는 formatting pass보다 더 많이 절약합니다. 낮은 가치의 context와 implementation이 처음부터 생기지 않게 하기 때문입니다.

## Privacy 경계

RTK와 Caveman은 로컬에서 실행됩니다. Headroom install은 package repository와 선택적인 model resource에 접속할 수 있습니다. Headroom wrapper 또는 일반 client는 사용자가 선택한 provider에 계속 model request를 보냅니다. 로컬 압축은 provider traffic을 없애지 않습니다.

운영 세부 사항은 [Token 인텔리전스와 압축 가이드](https://cli.rexai.top/ko/token-compression/)를, release record는 [v3.6.0 변경 로그](https://cli.rexai.top/ko/changelog/)를 참고하세요.
