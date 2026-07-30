---
title: ContextDB: pull-based 프로젝트 기억
description: 로컬 ContextDB registry, memo storage, unified project search, lazy load와 client 간 기억 경계를 설명합니다.
---

# ContextDB

## 먼저 답하면

ContextDB는 Harness CLI의 로컬 project memory layer입니다. session, event, checkpoint, memo, context pack reference를 project workspace에 저장하여 지원 client가 다른 session의 필요한 사실을 찾게 합니다. 현재 모델은 pull-based입니다. registry가 source를 가리키고 agent가 task에 필요한 evidence만 recall합니다.

## 지금 실행

project root에서:

~~~bash
aios init --all
aios doctor --native --verbose
node scripts/aios.mjs search "release readiness" --agent codex-cli --json
~~~

현재 init은 .aios/context-db/index.json을 가리키는 project marker를 추가합니다.

## 로컬 registry

일반적인 workspace:

~~~text
.aios/
  context-db/
    index.json                 # source registry
    sessions/<session-id>/     # session event와 checkpoint
    index/                     # derived search data
    exports/                   # context pack과 handoff
  memo/
    file/events.jsonl          # canonical append-only memo
    split/                     # 선택적 one-file-per-memo backend
~~~

실제 file은 client와 실행한 command에 따라 달라집니다. registry는 repository 전체의 복사본이 아니라 source pointer입니다.

## Pull-based recall 흐름

~~~text
client start
  -> AGENTS.md, CLAUDE.md, GEMINI.md 또는 client guidance 읽기
  -> .aios/context-db/index.json 찾기
  -> source metadata와 task relevance 확인
  -> handoff, memo, checkpoint, context pack 검색 또는 읽기
  -> 필요한 evidence만 가지고 task 계속
~~~

context control 방식이며 고정 prompt size나 startup time을 보장하지 않습니다. source가 없거나 오래되었거나 다른 project에 있으면 명시적인 pointer가 필요합니다.

## 기록되는 것

| Source | 예 | 용도 |
| --- | --- | --- |
| Session events | prompt, tool result, error, 변경 path | 발생한 일 복원 |
| Checkpoints | goal, status, next step, evidence | 장기 task 재개 |
| Memos | project decision, constraint, reminder | 지속적인 사실 저장 |
| Context packs | 범위가 제한된 history export | 선택한 context handoff |
| Unified search | memory, plans, docs, code | 넓은 read 전 evidence 탐색 |

ContextDB는 검증되지 않은 agent response를 evidence로 바꾸지 않습니다. test, diagnostic, review, privacy check는 별도 quality gate입니다.

## Memory With Memo {#memory-with-memo}

### Workspace Memory AIOS Memo {#workspace-memoryaios-memo}

### Workspace Memory AIOS Memo (legacy anchor) {#workspace-memory-aios-memo}

memo는 durable project note입니다. 기본 canonical backend는 .aios/memo/file/events.jsonl의 append-only JSONL이며 split은 선택 사항입니다.

~~~bash
aios memo add "Keep authentication tests strict"
aios memo pin add "Do not push directly to main"
aios memo search "authentication"
aios memo recall "release readiness" --limit 5
aios memo storage status
~~~

storage를 의도적으로 확인하거나 변경합니다.

~~~bash
aios memo storage use split
aios memo storage use file
aios memo storage rebuild
aios memo storage doctor
aios memo storage repair-locks
~~~

rebuild는 derived query file만 갱신하고 canonical record를 다시 쓰지 않습니다.
`repair-locks`는 기록된 owner PID가 종료된 것으로 확인된 lock만 quarantine하며 active 또는 malformed lock은 건드리지 않습니다.

## 통합 프로젝트 검색(v1.50.0) {#통합-프로젝트-검색v1500}

넓은 grep이나 repository 전체 read 전에 사용합니다.

~~~bash
node scripts/aios.mjs search "native client guidance" --agent codex-cli --json
node scripts/aios.mjs search "release blocker" --source memory,plans
node scripts/aios.mjs search "browser MCP" --source docs,code --limit 8
~~~

| Source | 포함 내용 | 용도 |
| --- | --- | --- |
| memory | project-shared와 허용된 private memo | decision과 handoff |
| plans | docs/plans와 implementation plan | intent와 checkpoint |
| docs | README, native guidance, public docs | runbook |
| code | scripts, mcp-server, test, config | implementation fact |
| all | 모든 source | 첫 targeted lookup |

project-shared memo는 지원 client 사이에서 보입니다. agent-private note는 codex-cli, claude-code, gemini-cli, opencode-cli, hermes-agent, grok-build 등 matching runtime id가 필요합니다.

## Lazy Load (Fast Startup) {#lazy-load}

interactive session은 기본적으로 lazy context loading을 사용합니다. compatibility workflow가 full context를 필요로 할 때:

~~~bash
export CTXDB_LAZY_LOAD=0
~~~

aios init이 registry marker를 만들면 client가 registry와 facade guidance에서 context를 발견할 수 있습니다. legacy 또는 unwrapped client는 compatibility fallback을 사용할 수 있습니다. lazy loading은 context selection 동작이며 source 존재나 자동 query를 보장하지 않습니다.

## Context pack과 manual control

handoff나 제한된 history slice에는 bounded context pack을 사용합니다.

~~~bash
cd mcp-server
npm run contextdb -- context:pack \
  --session <session-id> \
  --limit 80 \
  --token-budget 1200 \
  --token-strategy balanced
~~~

storage 진단이나 재현 가능한 handoff가 필요할 때:

~~~bash
npm run contextdb -- init
npm run contextdb -- session:new --agent codex-cli --project my-app --goal "fix auth bug"
npm run contextdb -- checkpoint --session <id> --summary "auth fix done" --status running
npm run contextdb -- index:rebuild
~~~

일반 사용자는 aios init과 native doctor에서 시작하면 됩니다.

## Client 간 기억과 privacy

integration이 지원되고 sync되어 있으면 여러 client가 하나의 project registry를 공유할 수 있습니다. registry가 다른 client의 private home configuration을 노출하는 것은 아닙니다. 실제 상태는 aios doctor --native --verbose로 확인하세요.

project file은 로컬이지만 agent가 선택한 내용을 설정된 model provider로 보낼 수 있습니다. package install과 MCP registration에도 각자의 network boundary가 있습니다. 민감한 내용은 redaction workflow를 거쳐 공유하세요.

## Legacy compatibility

오래된 wrapper와 script는 .contextdb-enable을 opt-in marker로 인식할 수 있습니다. 현재 primary path는 aios init과 .aios/context-db/index.json입니다. compatibility workflow가 명시적으로 요구할 때만 legacy switch를 사용하세요.

## FAQ

### ContextDB는 cloud database인가요?

아닙니다. registry, session, export, canonical memo는 local workspace file입니다. client provider와 optional integration에는 별도의 network boundary가 있습니다.

### 여러 client가 같은 기억을 공유하나요?

지원되고 sync된 경우 같은 project ContextDB를 사용할 수 있습니다. 하지만 route, skill, MCP capability가 같다는 뜻은 아닙니다.

### /new 또는 /clear 뒤에는 어떻게 되나요?

terminal conversation만 reset되고 project file은 남습니다. 새 session을 시작하고 registry, unified search, named context pack에서 evidence를 recall하세요.

### 기억을 끄려면?

client를 중지하고 client guidance에 따라 integration marker를 조정합니다. 오래된 workflow가 .contextdb-enable을 사용했을 때만 해당 file을 삭제하세요. marker 삭제는 기존 .aios data를 지우지 않습니다.

### 무엇을 삭제해도 되나요?

derived index는 재구축할 수 있습니다. sessions, exports, memo JSONL은 source data이므로 삭제 전에 backup하세요.

## 다음 페이지

- [빠른 시작](getting-started.md)
- [Workflow Policy](workflow-policy.md)
- [Token Intelligence](token-compression.md)
- [아키텍처](architecture.md)
- [문제 해결](troubleshooting.md)
