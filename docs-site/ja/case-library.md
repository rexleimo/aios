---
title: ケースライブラリ：再現可能な AIOS workflow
description: setup、cross-client handoff、browser auth、privacy read、release verification を evidence 付きで実行します。
---

# ケースライブラリ

## まず答え

feature tour ではなく具体的な workflow が必要なときに使います。各ケースは prerequisite、command、expected evidence、human decision を示します。目的に近いケースから始め、canonical page を読んでください。

## ケース 1：新しい project の初期化

**Goal:** project marker と native integration を確認。

~~~bash
cd /path/to/project
aios init --all
aios doctor --native --verbose
test -f .aios/context-db/index.json
~~~

Evidence は doctor の client checks と registry marker。Human decision は project root が正しいかの確認です。[Quick Start](getting-started.md) と [ContextDB](contextdb.md) を参照。

## ケース 2：Cross-client handoff

~~~bash
aios memo add "Keep the auth API unchanged"
claude
codex
node scripts/aios.mjs search "auth API" --agent codex-cli --json
~~~

memo または checkpoint が unified search で見つかり、各 client の doctor が通ることが evidence です。詳細は[クロス CLI handoff](case-cross-cli-handoff.md)。

## ケース 3：Browser CDP smoke

~~~bash
aios internal browser doctor
aios internal browser cdp-status
~~~

profile と CDP status を確認します。interactive flow では visible CDP browser、semantic snapshot、bounded action、verification の順に進め、auth wall は人が操作します。[ブラウザ認証壁ケース](case-auth-wall-browser.md)。

## ケース 4：Privacy-safe configuration read

~~~bash
aios privacy status
aios privacy read --file .env
~~~

redacted output が evidence です。共有できる fields は human が判断します。raw cookie、token、private key、browser profile は共有しません。[Privacy Guard ケース](case-privacy-guard.md)。

## ケース 5：Team governance smoke

~~~bash
node scripts/aios.mjs agents smoke --dry-run --json
node scripts/aios.mjs agents smoke --json
node scripts/aios.mjs skill certify --changed --base HEAD --json
node scripts/aios.mjs skill verify-training --changed --base HEAD --json
~~~

.aios/agents/ と .aios/interception/metrics/ に evidence が作られます。live 前に provider、client、changed skill を確認します。[Agent Team](team-ops.md)。

## ケース 6：再開可能な長い task

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

status、checkpoint、iteration artifact が current stage の evidence です。merge 前に worktree diff と test を人が確認します。[Solo Harness](solo-harness.md)。

## ケース 7：dry-run と live

~~~bash
aios team --provider codex --workers 2 --task "Review the release checklist" --dry-run --json
aios orchestrate bugfix --task "Fix the release check" --dispatch local --execute dry-run
~~~

local dispatch と journal state を確認します。provider、credential、worktree、verification scope を確認してから live に進みます。

## ケース 8：release verification

~~~bash
aios doctor --native --verbose
aios quality-gate pre-pr --profile strict
npm run test:scripts
git diff --check
~~~

各 command の exit と blocker を保存します。公開前に claim、link、privacy boundary、generated output を review します。

## 新しいケースを投稿

intent、primary action、exact command、expected evidence、human-in-the-loop boundary、canonical link、related case を含めます。credential、cookie、private path、unredacted provider output は含めません。

## 次に読む

- [ユースケース](use-cases.md)
- [トラブルシューティング](troubleshooting.md)
- [Workflow Policy](workflow-policy.md)
