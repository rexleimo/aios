---
title: "v1.50.0: 기억, 문서, 계획, 코드를 가로지르는 통합 AIOS 검색"
description: "AIOS v1.50.0은 지원되는 모든 coding client에 project memory, pinned memo, docs, plans, code를 아우르는 안전한 검색 경로를 제공합니다."
date: 2026-06-04
tags: ["release", "search", "contextdb", "memory", "multi-client", "AIOS"]
---

# v1.50.0: 기억, 문서, 계획, 코드를 가로지르는 통합 AIOS 검색

Agent의 지능은 모델 성능만으로 결정되지 않습니다. 같은 project fact를 여러 위치에서 다시 찾다 보면 계획, pinned memo, 문서, 코드가 서로 분리됩니다.

AIOS v1.50.0은 이 탐색 경로를 하나로 합칩니다. 지원되는 모든 client가 project memory, pinned memo, docs, plans, code를 같은 명령으로 검색할 수 있습니다.

## 기본 명령

저장소 root에서 실행합니다:

```bash
node scripts/aios.mjs search "native client guidance" --agent codex-cli --json
```

`--agent`는 중요합니다. AIOS는 이 값으로 검색하는 runtime client를 판단하고, 공유 memory와 client private memory를 안전하게 함께 처리합니다.

지원 runtime client id:

- `codex-cli`
- `claude-code`
- `gemini-cli`
- `antigravity-cli`
- `opencode-cli`
- `crush-cli`

## 필요한 source만 검색하기

작업 시작에는 넓게 검색하고, 방향이 잡히면 source를 좁힙니다.

```bash
node scripts/aios.mjs search "release blocker" --source memory,plans
node scripts/aios.mjs search "browser MCP" --source docs,code --limit 8
node scripts/aios.mjs search "private scratch" --scope agent_private --agent claude-code
```

source filter는 `memory`, `plans`, `docs`, `code`, `all`입니다.

## Memory visibility

v1.50.0은 cross-client collaboration과 identity isolation을 분리합니다:

- `project_shared`는 모든 client에서 보입니다.
- `agent_private`는 일치하는 `--agent <runtime-client-id>`에서만 보입니다.
- 일치하지 않는 client에는 private record가 반환되지 않습니다.

즉 Codex에서 Claude 또는 OpenCode로 전환해도 중요한 project memory는 잃지 않고, client별 scratch memo는 계속 격리됩니다.

## 모든 client에 같은 guidance 배포

검색 workflow는 각 client가 실제로 읽는 native instruction surface에 기록됩니다:

| Client | Instruction surface |
| --- | --- |
| Codex | `AGENTS.md` |
| Claude | `CLAUDE.md` |
| Gemini | `GEMINI.md` |
| Antigravity | `GEMINI.md` |
| OpenCode | `AGENTS.md` |
| Crush | `AGENTS.md` |

Antigravity와 Crush는 live execution에서 아직 `pending-smoke` 상태지만, static search guidance는 같은 client registry로 생성되고 검증됩니다.

## 권장 workflow

큰 file scan 전에 먼저 AIOS search에 묻습니다:

```bash
node scripts/aios.mjs search "what did we decide about search visibility" --agent codex-cli
```

그다음 범위를 좁힙니다:

```bash
node scripts/aios.mjs search "agent_private" --source memory,docs --agent codex-cli --json
```

memory와 docs로 방향을 잡은 뒤 code search로 들어가면 agent의 reasoning budget을 절약하고, 과거 project decision을 유지한 채 작업할 수 있습니다.

## Resource integrity checklist

Release 전에 public surface를 함께 검증합니다:

```bash
npm run check:site-sync
node --test scripts/tests/native-agent-guidance.test.mjs scripts/tests/client-registry.test.mjs scripts/tests/native-source-tree.test.mjs scripts/tests/search.test.mjs
git diff --check
```

MkDocs가 있으면 두 site를 모두 build합니다:

```bash
mkdocs build --strict
mkdocs build -f mkdocs.blog.yml --strict
```

자세한 내용은 [ContextDB search docs](https://cli.rexai.top/ko/contextdb/#통합-프로젝트-검색v1500)를 참고하세요.
