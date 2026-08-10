---
title: ワークフローポリシー
description: AIOS の adaptive workflow policy で direct、guarded、planned の使い分けを理解します。
---

# ワークフローポリシー

## クイックアンサー

AIOS はリスクベースの workflow policy を使います。adaptive モードでは、読み取り専用の質問は direct、小さなコード変更は guarded、複数ステップまたは明示的に route を指定した作業は永続 plan になります。strict モードでは substantive work が planned になりますが、空のメッセージや読み取り専用の質問まで plan にはしません。Policy が決めるのは turn の扱い方であり、実装完了の証明ではありません。

## 今すぐ実行

プロジェクトルートで policy を preview または適用します。

```bash
node scripts/aios.mjs plan auto-gate --task "Refactor the auth boundary and add tests" --json
node scripts/aios.mjs plan auto-gate --task "Refactor the auth boundary and add tests" --dry-run --json
```

1 行目は decision が `planned` の場合に plan を作成することがあります。2 行目は同じ request を評価するだけで、planned artifact を永続化しません。プロジェクトルートが現在のディレクトリと違う場合は `--workspace <path>` を使います。

## 4 つの disposition

| Disposition | 用途 | Persistence | Verification scope |
| --- | --- | --- | --- |
| `noop` | 空入力、または明示的な no-op | `none` | `none` |
| `direct` | 質問、説明、status 確認、acknowledgement、resume decision | `none` または `reuse` | `none` |
| `guarded` | adaptive モードの小さな substantive change | `none` | `focused` |
| `planned` | 複数ステップ、明示 plan、Team/Harness、design、または strict の substantive work | `create` | `full` |

`direct` はすべての safety を省略する意味ではありません。Direct request が後でファイル変更になった場合も通常の edit と verification gate が必要です。`guarded` は永続 plan を要求しなかったという意味だけで、ファイル変更前の `pre-edit-safety-gate` と、その後の focused verification は必要です。

## Adaptive と Strict

Adaptive がデフォルトです。「この label を変更して focused test を実行」のような小さな implementation request は通常 `guarded` に留まり、複数ステップ、migration、team route、harness route を含む request は `planned` になります。Strict は substantive work を `planned` にして、実装前に owner、tasks、evidence を記録できるようにします。どちらの mode でも、読み取り専用の質問、空入力、active plan がない resume request は direct のままです。

Policy は classifier であり、「小さい」の万能な定義ではありません。最終 decision には `reason`、`routeHint`、`requiredSkills`、`requiresPreEditSafety`、`verificationScope` が含まれます。境界を確認するときは JSON を見てください。

## Plan の永続化

Adapter は次のいずれかの persistence instruction を返します。

- `none`: plan artifact を作成・更新しません。`noop`、通常の direct question、adaptive の guarded change が該当します。
- `reuse`: 既存の nonterminal active plan を使います。有効な same-session acknowledgement または明示的な resume で使われます。
- `create`: 選択された route と required skills で新しい work-item plan を開始します。Dry run は decision を返すだけで書き込みません。

`done`、`blocked`、`cancelled`、`completed`、`failed`、`abandoned` などの terminal status は continuation できません。Plan decision は実装結果ではありません。Close 前に task 更新、evidence、edit gate、verification が必要です。

## Continuation のルール

Continuation には意図的に異なる 2 つの経路があります。

1. **Same-session acknowledgement。** `ok` や `approved` のような短い acknowledgement は、client と session identity が plan と一致し、plan が nonterminal の場合だけ再利用できます。別 client または別 session の acknowledgement は continuation missing の direct request になります。
2. **Explicit resume。** `resume` や `continue` は client をまたいで nonterminal plan を再利用できます。使用できる active plan がなければ、結果は `direct` と `continuation=missing` であり、誤って plan を作りません。

Acknowledgement や resume に新しい actionable objective が含まれる場合は新しい work として再分類され、古い plan に暗黙に接続されません。

## Route Hints と Skills

Decision は route と最小限の process skill を示せます。

| Route hint | 典型的な trigger | Planned skills |
| --- | --- | --- |
| `implement` | feature または file change | `writing-plans`、`test-driven-development` |
| `debug` | bug、failure、crash | `systematic-debugging` |
| `verify` | test、typecheck、CI、regression validation | `verification-before-completion` |
| `ops` | install、configure、upgrade、deploy、release | `writing-plans` |
| `team` | parallel または delegated work | `writing-plans`、`dispatching-parallel-agents` |
| `harness` | long-running または overnight work | `writing-plans`、`aios-long-running-harness` |
| `design` | architecture、design、brainstorming | `brainstorming`、`writing-plans` |

Policy は選択された skill の代わりにはなりません。また `pre-edit-safety-gate` の代わりにもなりません。Safety gate はファイル変更前に impact、dependency、style、test coverage を確認します。

## 例

### 読み取り専用の質問

```bash
node scripts/aios.mjs plan auto-gate --task "Why is this request classified as direct?" --json
```

`disposition=direct`、`persistence=none`、新しい plan artifact なしが期待されます。

### Adaptive の小さな implementation

```bash
node scripts/aios.mjs plan auto-gate --task "Update the button label and run its focused test" --json
```

通常は `guarded` で、focused verification を使い、persistent plan は作りません。複数ファイルや複数ステージに広がる場合は、拡張した request をもう一度 classify します。

### 複数ステップの implementation

```bash
node scripts/aios.mjs plan auto-gate --task "First update the schema, then migrate callers, and finally add regression tests" --json
```

`planned`、`persistence=create`、full verification scope、implementation skills が期待されます。

### Team task

```bash
node scripts/aios.mjs plan auto-gate --task "Use an Agent Team to audit the API and docs in parallel" --json
```

Route hint は `team` です。Policy decision 自体は provider を起動しません。Plan と safety gate の後で Agent Team の preflight と execution control を使います。

### Explicit resume

```bash
node scripts/aios.mjs plan auto-gate --task "resume" --json
```

Usable active plan があれば `continuation=explicit-resume` と `persistence=reuse` が期待されます。なければ direct の missing-continuation になり、新しい plan は作りません。

## FAQ

### すべての message が plan になりますか？

いいえ。空入力は `noop`、質問と説明は `direct`、adaptive の小さな変更は通常 `guarded` です。Plan は durable task と evidence が必要な作業に使います。

### Strict は読み取り専用の質問を plan にしますか？

いいえ。Read-only classification は strict の substantive-work rule より先に行われます。Strict が変えるのは substantive work であり、通常の説明ではありません。

### 別の client は “ok” で plan を続けられますか？

弱い acknowledgement だけではできません。Same-session acknowledgement には元の client と session が必要です。別 client に意図的に渡すときは explicit `resume` を使います。

### Dry run は live provider の動作を証明しますか？

いいえ。Dry run が証明するのはローカルの decision または preview path だけです。Live Agent Team、Harness、Orchestrate にはそれぞれ capability、human-gate、verification evidence が必要です。

### Planned decision は変更完了と同じですか？

違います。これは routing と persistence の decision です。実装には選択された process skill、pre-edit check、tests、final verification が必要です。

## 次のステップ

- [クイックスタート](getting-started.md): project を初期化し、`aios doctor` を実行します。
- [Architecture](architecture.md): policy、memory、agent、browser runtime の境界を確認します。
- [ContextDB](contextdb.md): pull-based project memory と明示的な recall を理解します。
- [Agent Team](team-ops.md) と [Solo Harness](solo-harness.md): parallel または long-running execution を選びます。
- [Workflow Policy のリリース記事](/blog/ja/2026-07-v400-adaptive-workflow-policy/): v4.0 の背景と例を読みます。
