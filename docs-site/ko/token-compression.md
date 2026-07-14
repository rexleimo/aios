---
title: Token Intelligence와 압축 경계
description: RTK, Caveman, Headroom MCP, ContextDB와 Ponytail에서 영감을 얻은 결정 게이트를 정확하게 사용합니다.
---

# Token Intelligence와 압축

## 먼저 답하면

context efficiency는 하나의 compression switch가 아니라 workflow입니다. Harness CLI는 smallest-correct-change gate, RTK shell output filter, Caveman response style, 명시적인 Headroom MCP tool, pull-based ContextDB recall을 분리합니다. 어떤 계층도 test, privacy check, final verification을 대신하지 않습니다.

## 지금 실행

~~~bash
node scripts/aios.mjs init --all --dry-run
node scripts/aios.mjs init --all --yes-compression-tools --yes-headroom-mcp
aios doctor --native --verbose
~~~

Headroom에는 Python 3.10 이상과 uv 또는 pipx가 필요합니다. AIOS는 격리된 tool environment에 headroom-ai[all]>=0.31.0,<0.32.0를 install합니다.

## 다섯 계층

| Layer | Responsibility | Boundary |
| --- | --- | --- |
| Ponytail-inspired gate | explanation, configuration, small edit를 먼저 검토 | 설치되는 Ponytail plugin이 아님 |
| RTK | Agent가 읽기 전 local shell / tool output noise를 filter | scoped command나 raw log 전체를 대신하지 않음 |
| Caveman | technical fact를 유지하며 response style을 짧게 함 | file이나 tool 자체를 압축하지 않음 |
| Headroom MCP | 이후 step에 필요한 자료를 명시적으로 compress / retrieve | current model request를 transparent interception하지 않음 |
| ContextDB | 전체 history를 inject하지 않고 필요한 project context를 recall | runtime history를 모든 prompt에 자동 표시하지 않음 |

planning, review, privacy, test, verification은 별도 quality gate입니다.

## RTK와 Caveman

RTK는 local command-output layer입니다. path와 failure를 남기도록 범위를 제한한 command를 사용하세요.

~~~bash
rg -n "pattern" path
git diff --stat
sed -n '120,180p' file.ts
tail -n 120 test.log
~~~

Caveman은 concise status와 checkpoint를 위한 local prompt skill입니다. command, path, error, date, decision, risk, missing verification을 보존해야 합니다.

## Headroom MCP는 명시적입니다

Headroom upstream에는 일부 client용 official wrap target이 있습니다. AIOS v3.6.0은 aios init이 모든 client launch를 자동 wrap한다고 주장하지 않습니다. install과 MCP registration은 별개입니다.

| Client | Route | Condition |
| --- | --- | --- |
| Gemini CLI | user-scope official MCP registration | separate MCP consent |
| Grok Build | user-scope official MCP registration | separate MCP consent |
| Hermes Agent | user-scope official MCP registration | real TTY, 아니면 pending-interactive |

server는 headroom_compress, headroom_retrieve, headroom_stats를 노출하고 model이 명시적으로 호출합니다. model이 original을 먼저 본 경우 현재 turn에서 절약되지 않거나 tool call이 하나 늘 수 있습니다. 주된 이점은 이후 step에서 compact result를 유지하고 필요할 때 reference로 original을 retrieve하는 것입니다.

AIOS는 소유한 registration을 ~/.aios/integrations/headroom-mcp.json에 기록하며 external 또는 conflict entry를 덮어쓰지 않습니다.

## ContextDB context pack

~~~bash
cd mcp-server
npm run contextdb -- context:pack \
  --session <session-id> \
  --limit 80 \
  --token-budget 1200 \
  --token-strategy balanced
~~~

balanced는 최근 작업과 failure signal을 보존하고 aggressive는 detail budget을 줄이며 legacy는 compatibility를 위해 history tail을 사용합니다. [ContextDB](contextdb.md)를 함께 보세요.

## 판단 순서

code, dependency, file, 넓은 context를 추가하기 전에:

1. explanation 또는 configuration change로 해결할 수 있는가?
2. 기존 function, document, tool을 사용할 수 있는가?
3. focused query로 repository, page, log 전체 read를 피할 수 있는가?
4. 그래도 부족하면 가장 작은 tested implementation을 추가합니다.

browser 작업은 semantic_snapshot 또는 targeted extract_text부터 시작합니다.

## 보장하지 않는 것

- local measurement 없는 universal token saving percentage.
- 모든 model request의 transparent interception.
- provider traffic이 사라진다는 보장.
- 모든 client launch의 자동 wrap.
- error, path, decision, verification evidence 삭제.
- ContextDB search, test, privacy review, final verification 대체.

## FAQ

### 모든 계층을 install해야 하나요?

아닙니다. 먼저 aios init --all --dry-run으로 예정 상태를 보고 필요한 package와 integration만 선택하세요.

### Headroom이 RTK와 같은가요?

아닙니다. RTK는 local command output을 filter하고, Headroom은 명시적 MCP tool path이며, Caveman은 response style만 다룹니다.

### 실제 이점을 어떻게 측정하나요?

headroom_stats에서 compression event와 양수 saved-token total을 모두 확인합니다. upstream benchmark는 local AIOS evidence가 아닙니다.

### ContextDB를 단독으로 사용할 수 있나요?

가능합니다. memory, memo, search, checkpoint는 RTK, Caveman, Headroom과 별개입니다.

## 다음 페이지

- [빠른 시작](getting-started.md)
- [ContextDB](contextdb.md)
- [Workflow Policy](workflow-policy.md)
- [Headroom + Ponytail workflow 글](https://cli.rexai.top/blog/ko/2026-07-headroom-token-intelligence/)
