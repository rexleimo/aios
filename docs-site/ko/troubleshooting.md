---
title: AIOS 문제 해결
description: install, ContextDB, client sync, workflow, Team, browser, token tool, privacy 문제를 evidence로 진단합니다.
---

# 문제 해결

## 먼저 답하면

먼저 진단 output을 보관합니다.

~~~bash
aios doctor --native --verbose
~~~

증상을 분류하고 dry-run에서 live provider failure를 추론하지 마세요. 첫 failure command를 확인하기 전에 project data를 삭제하지 않습니다.

## 설치와 Node.js

**증상:** aios를 찾을 수 없거나 Node 전환 후 ContextDB가 실패함.

~~~bash
node -v
npm -v
command -v aios
aios doctor --native --verbose
~~~

Node.js 24 LTS와 aios path를 확인합니다. profile을 reload하거나 새 shell을 엽니다. Windows는 TLS 1.2 installer와 . $PROFILE을 사용합니다.

## ContextDB와 registry

**증상:** client가 project memory를 찾지 못함.

~~~bash
test -f .aios/context-db/index.json
find .aios/context-db -maxdepth 2 -type f | head -n 30
aios doctor --native --verbose
~~~

올바른 project root에서 aios init --all을 실행했는지 확인합니다. unified search 또는 명시한 memo/checkpoint로 recall을 확인하세요. .contextdb-enable은 legacy compatibility switch입니다.

**증상:** search가 비어 있음.

~~~bash
node scripts/aios.mjs search "release readiness" --agent codex-cli --json
aios memo storage status
aios memo storage rebuild
~~~

source list나 storage status를 확인한 후 derived index를 rebuild합니다.

## Client sync와 route

**증상:** native guidance나 shortcut이 없음.

~~~bash
aios doctor --native --verbose
node scripts/aios.mjs init --all --dry-run
aios doctor --native --fix
~~~

fix 전에 dry-run을 읽습니다. file sync는 provider route가 live라는 증거가 아닙니다.

## Workflow Policy와 plan

**증상:** read-only question에 plan이 생기거나 작은 change가 block됨.

~~~bash
node scripts/aios.mjs plan auto-gate --task "Explain the current auth flow" --dry-run --json
node scripts/aios.mjs plan auto-gate --task "Refactor auth across modules" --json
~~~

noop, direct, guarded, planned와 persistence none, reuse, create를 확인합니다. policy는 pre-edit safety와 final verification과 별개입니다. [Workflow Policy](workflow-policy.md)를 참고하세요.

## Team과 Solo Harness

**증상:** run이 stop, blocked되거나 progress가 없음.

~~~bash
aios team history --provider codex --limit 5
aios harness status --session <session-id> --json
aios hud --session <session-id> --json
~~~

첫 failure를 읽습니다.

~~~bash
aios team --resume <session-id> --retry-blocked --provider codex --workers 2
aios harness stop --session <session-id> --reason "diagnose first failure"
aios harness resume --session <session-id>
~~~

dry-run은 provider credential이나 live route를 test하지 않습니다.

## Browser MCP

~~~bash
aios internal browser doctor
aios internal browser cdp-status
~~~

browser-use MCP over CDP를 사용하고 visible browser, semantic snapshot, targeted text, act, verify 순서로 진행합니다. auth wall은 human-controlled로 유지합니다. Playwright MCP는 compatibility path입니다.

## Token tools

~~~bash
node scripts/aios.mjs init --all --dry-run
aios doctor --native --verbose
node scripts/aios.mjs init --all --yes-compression-tools --yes-headroom-mcp
~~~

package consent와 user-scope MCP consent는 별개입니다. Headroom external / conflict registration을 확인하고 headroom_stats가 positive saved-token total을 보이지 않으면 savings를 주장하지 마세요.

## Privacy

~~~bash
aios privacy status
aios privacy read --file .env
~~~

raw .env, cookie, token, private key, browser profile을 공유하지 마세요. log에서 provider token과 private path를 제거합니다.

## FAQ

### .aios를 삭제해야 하나요?

아닙니다. 첫 failure를 확인하고 sessions, exports, memo JSONL을 backup한 뒤 derived data를 처리합니다.

### dry-run 성공이면 작동하나요?

아닙니다. local parsing과 planned state의 증거입니다. provider와 credential은 live task로 확인합니다.

## 다음 페이지

- [빠른 시작](getting-started.md)
- [ContextDB](contextdb.md)
- [Workflow Policy](workflow-policy.md)
- [Token Intelligence](token-compression.md)
- [사례 라이브러리](case-library.md)
