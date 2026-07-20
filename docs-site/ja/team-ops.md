---
title: Agent Team：証拠付きの並列作業
description: 独立した work package を分け、Agent Team を起動し、HUD を監視し、blocked job を安全に復旧します。
---

# Agent Team

## まず答え

2 つ以上の独立した work package に分割でき、owner と acceptance evidence が明確なときに Agent Team を使います。小さい変更や結合した変更は一つの client、長い一つの objective は Solo Harness、段階的な quality gate は Orchestrate を使います。dry-run は local dispatch を確認するだけで、live provider の利用可能性を証明しません。

## 今すぐ実行

まず preview：

~~~bash
aios team --provider codex --workers 3 --task "Review auth, tests, and docs" --dry-run --json
~~~

task と live provider の準備ができたら：

~~~bash
AIOS_EXECUTE_LIVE=1 AIOS_SUBAGENT_CLIENT=codex-cli \
  aios team 3:codex "Review auth, tests, and docs"
~~~

## Route の選択

| Need | Route |
| --- | --- |
| 回答、inspection、小さい local change | direct または guarded |
| 一つの長い objective | [Solo Harness](solo-harness.md) |
| 2 つ以上の独立 work package | Agent Team |
| ordered phase と gate | aios orchestrate |
| 要件が不明確 | まず interactive client |

## 開始前

goal、boundary、acceptance evidence を一文で書きます。

~~~text
Goal: update the login form
Boundary: do not change the auth API
Evidence: focused tests pass and docs link to the new behavior
~~~

worker が同じ file を編集しないことを確認します。重なる場合は ownership を順番に実行するか一つの agent にします。

## 監視と review

~~~bash
aios team status --provider codex --watch
aios hud --provider codex
aios team history --provider codex --limit 20
aios team history --provider codex --quality-failed-only
aios quality-gate pre-pr --profile strict
~~~

merge 前に changed file と quality category を確認します。status は operational evidence ですが、correctness の証明ではありません。

## Governance evidence

agent、route、workflow skill を変更した場合：

~~~bash
node scripts/aios.mjs agents smoke --dry-run --json
node scripts/aios.mjs agents smoke --json
node scripts/aios.mjs skill certify --changed --base HEAD --json
node scripts/aios.mjs skill verify-training --changed --base HEAD --json
~~~

evidence は .aios/agents/ と .aios/interception/metrics/ に保存されます。sensitive provider output は公開 issue に含めないでください。

## Recovery

latest session を確認してから retry：

~~~bash
aios team history --provider codex --limit 5
aios team --resume <session-id> --retry-blocked --provider codex --workers 2
~~~

conflict がある場合は worker 数を減らします。--force は bypass する safety guard を理解した場合だけ使います。

## Runtime

~~~text
planner -> independent implementers -> reviewer
                 |
                 +-> blocked job は replanning round を発生させる場合がある
~~~

feature、bugfix、refactor、security blueprint から最小のものを選びます。preflight が plan artifact を要求する場合はそれを保持します。

## FAQ

### Team は必ず速いですか？

いいえ。coordination と provider work が増えます。独立した work package の場合にだけ有効です。

### dry-run は provider をテストしますか？

いいえ。local parsing と dispatch state の確認です。live provider と client route には小さな live smoke task が必要です。

### blocked run を再開できますか？

はい。history で blocked job を特定し、resume と retry-blocked を使います。

## 次に読む

- [HUD ガイド](hud-guide.md)
- [Workflow Policy](workflow-policy.md)
- [ソロ Harness](solo-harness.md)
- [ユースケース](use-cases.md)
