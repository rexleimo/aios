---
title: Solo Harness：再開可能な長時間作業
description: journal、stop/resume、verification evidence、任意の git worktree 分離で一つの objective を実行します。
---

# Solo Harness

## まず答え

interactive session を越える一つの明確な objective に Solo Harness を使います。parallel worker が必要な task には向きません。run journal と checkpoint を記録し、status、stop、resume、git worktree 分離を提供します。独立 module は Agent Team、ordered quality gate は Orchestrate です。

## 今すぐ実行

~~~bash
aios harness run \
  --objective "Refactor the auth module and write integration tests" \
  --session nightly-auth \
  --worktree \
  --max-iterations 20
~~~

~~~bash
aios harness status --session nightly-auth --json
aios hud --session nightly-auth --json
~~~

## 選択基準

| Situation | Route |
| --- | --- |
| 一つの goal、provider、長い実行 | Solo Harness |
| 独立 module と ownership | [Agent Team](team-ops.md) |
| ordered phase と gate | aios orchestrate |
| 不明確な要件または小さい fix | Workflow Policy と interactive client |

objective には scope、除外、verification を書き、完了を他の人が判定できるようにします。

## Worktree 分離

--worktree は base ref から別の git worktree を作ります。merge 前に worktree と diff を確認してください。分離は unsafe command を安全にするものではありません。

## Live 前の dry-run

~~~bash
aios harness run \
  --objective "Draft tomorrow's handoff" \
  --session test-run \
  --worktree \
  --max-iterations 3 \
  --dry-run --json
~~~

dry-run は argument parsing と local journal を確認します。provider、client、credential、live route の証明ではありません。

## Stop、inspect、resume

~~~bash
aios harness stop --session nightly-auth --reason "morning review"
aios harness status --session nightly-auth --json
aios harness resume --session nightly-auth --max-iterations 10
~~~

resume 前に status、checkpoint、failure command を読みます。意図的に新しい session を作らない限り objective を保ちます。

## Hooks と provider

~~~bash
aios harness run --objective "task" --session demo --hooks
aios harness resume --session demo --no-hooks
aios harness run --objective "task" --provider codex --profile strict
~~~

provider と route は live check が必要です。dry-run から推測しないでください。

## Artifacts

~~~text
.aios/context-db/sessions/<session-id>/artifacts/solo-harness/
  objective.md
  run-summary.json
  control.json
  hook-events.jsonl
  iteration-0001.json
  iteration-0001.log
~~~

log と checkpoint は project data です。共有前に credential と private provider output を redaction します。

## Recovery checklist

1. status と最新 iteration log を読む。
2. 最初の failure を特定する。
3. 最小の diagnosis command を実行する。
4. reason を付けて stop または resume。
5. merge 前に diff と test を verify。

## FAQ

### 一晩で完了しますか？

保証しません。resumable loop と evidence を提供しますが、provider、credential、test、task complexity は実行を止める場合があります。

### 常に --worktree が必要ですか？

code edit を含む、または隔離したい場合に使います。read-only task でも workspace boundary を確認してください。

### client から自動 trigger できますか？

対応する native route prompt は harness route を提案できます。実行後は status、provider、evidence を確認してください。

## 次に読む

- [Agent Team](team-ops.md)
- [HUD ガイド](hud-guide.md)
- [Workflow Policy](workflow-policy.md)
- [トラブルシューティング](troubleshooting.md)
