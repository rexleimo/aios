---
title: 사례 라이브러리: 재현 가능한 AIOS workflow
description: setup, cross-client handoff, browser auth, privacy read, release verification을 evidence와 함께 실행합니다.
---

# 사례 라이브러리

## 먼저 답하면

feature tour가 아니라 구체적인 workflow가 필요할 때 사용합니다. 각 사례는 prerequisite, command, expected evidence, human decision을 제시합니다. 목적에 가까운 사례에서 시작해 canonical page를 읽으세요.

## 사례 1: 새 project 초기화

~~~bash
cd /path/to/project
aios init --all
aios doctor --native --verbose
test -f .aios/context-db/index.json
~~~

doctor의 client checks와 registry marker가 evidence입니다. 올바른 project root인지 사람이 확인합니다. [빠른 시작](getting-started.md)과 [ContextDB](contextdb.md)를 보세요.

## 사례 2: Cross-client handoff

~~~bash
aios memo add "Keep the auth API unchanged"
claude
codex
node scripts/aios.mjs search "auth API" --agent codex-cli --json
~~~

unified search에서 memo나 checkpoint를 찾고 각 client doctor가 통과하는 것이 evidence입니다. 자세한 내용은 [크로스 CLI 핸드오프](case-cross-cli-handoff.md)입니다.

## 사례 3: Browser CDP smoke

~~~bash
aios internal browser doctor
aios internal browser cdp-status
~~~

profile과 CDP status를 확인합니다. interactive flow에서는 visible CDP browser, semantic snapshot, bounded action, verification 순으로 진행하고 auth wall은 사람이 조작합니다. [브라우저 인증벽 사례](case-auth-wall-browser.md)를 보세요.

## 사례 4: Privacy-safe configuration read

~~~bash
aios privacy status
aios privacy read --file .env
~~~

redacted output이 evidence입니다. 공유 가능한 field는 사람이 판단합니다. raw cookie, token, private key, browser profile은 공유하지 않습니다. [Privacy Guard 사례](case-privacy-guard.md)를 보세요.

## 사례 5: Team governance smoke

~~~bash
node scripts/aios.mjs agents smoke --dry-run --json
node scripts/aios.mjs agents smoke --json
node scripts/aios.mjs skill certify --changed --base HEAD --json
node scripts/aios.mjs skill verify-training --changed --base HEAD --json
~~~

.aios/agents/와 .aios/interception/metrics/에 evidence가 생성됩니다. live 전에 provider, client, changed skill을 확인합니다. [Agent Team](team-ops.md)을 참고하세요.

## 사례 6: 재개 가능한 장기 task

~~~bash
aios harness run \
  --objective "Prepare the release handoff" \
  --session release-handoff \
  --worktree \
  --max-iterations 20
aios harness status --session release-handoff --json
aios harness stop --session release-handoff --reason "review checkpoint"
aios harness resume --session release-handoff
~~~

status, checkpoint, iteration artifact가 current stage evidence입니다. merge 전에 worktree diff와 test를 사람이 확인합니다. [Solo Harness](solo-harness.md)를 보세요.

## 사례 7: dry-run과 live

~~~bash
aios team --provider codex --workers 2 --task "Review the release checklist" --dry-run --json
aios orchestrate bugfix --task "Fix the release check" --dispatch local --execute dry-run
~~~

local dispatch와 journal state를 확인합니다. provider, credential, worktree, verification scope를 확인한 뒤 live로 진행하세요.

## 사례 8: release verification

~~~bash
aios doctor --native --verbose
aios quality-gate pre-pr --profile strict
npm run test:scripts
git diff --check
~~~

각 command exit와 blocker를 보관합니다. 공개 전 claim, link, privacy boundary, generated output을 review합니다.

## 새 사례 제출

intent, primary action, exact command, expected evidence, human-in-the-loop boundary, canonical link, related case를 포함하세요. credential, cookie, private path, unredacted provider output은 포함하지 않습니다.

## 다음 페이지

- [사용 사례](use-cases.md)
- [문제 해결](troubleshooting.md)
- [Workflow Policy](workflow-policy.md)
