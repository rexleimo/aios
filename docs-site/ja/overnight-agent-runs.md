---
title: "コーディングエージェントを一晩中、クラッシュもドリフトもさせずに実行する方法"
description: "夜間エージェント実行は、クラッシュ、コンテキストドリフト、回復不能な状態で失敗します。Solo Harness のチェックポイント、検証ゲート、git worktree 分離が、コーディングエージェントを一晩中働かせ続ける仕組みを解説。"
date: 2026-08-10
schema_type: techarticle
---

# コーディングエージェントを一晩中、クラッシュもドリフトもさせずに実行する方法

> **まず答え：** 夜間エージェント実行が死ぬのは 3 つの形です：プロセスがクラッシュする、コンテキストがタスクからドリフトする、worktree の状態が回復不能になる。修正は**再開可能なハーネス**です：状態をディスクにチェックポイントし、各マイルストーンを証拠でゲートし、ファイルを git worktree に分離し、中断後は最後に受け入れられたチェックポイントから再開する。AIOS の Solo Harness（`aios harness run --objective "..." --worktree`）はまさにこのために作られています。

## 夜間実行が失敗する理由

| 失敗モード | 何が起きるか |
| --- | --- |
| **クラッシュ** | 午前 3 時にプロセスが死に、最後の保存以降のすべてが失われる。 |
| **ドリフト** | エージェントは objective から始めたのに隣接タスクへ彷徨い、ループが収束しない。 |
| **回復不能な状態** | ファイルが書きかけ、worktree が汚れ、何が受け入れられたかの記録がない。 |

3 つともモデルの問題ではなく、状態管理の問題です。

## 生き残れる夜間実行の 4 つの要素

1. **チェックポイント化された状態** — 実行は plan、証拠、決定をディスクに書き込むため、再開はゼロではなく最後に受け入れられたマイルストーンから始まる。
2. **証拠ゲート** — 各マイルストーンは次の開始前に決定論的チェック（`verification-before-completion`、doctor、コントラクトテスト）を通過しなければならない。これによりドリフトを朝に発見するのではなく、境界で止める。
3. **分離** — 実行は [git worktree](https://cli.rexai.top/ja/solo-harness/) の中で実行されるため、並列実行や再実行がお互いのファイルを踏みつけない。
4. **収束ループ** — objective に明示的な停止条件があり、実行は予算が尽きたときではなく、証拠が objective 完了を示したときに終わる。

## 夜間実行の開始方法

```bash
# 1. Initialize AIOS in the project
aios init --all

# 2. Launch a resumable, isolated objective
aios harness run --objective "Finish the release handoff checklist" --worktree

# 3. Check on it in the morning
aios harness status
```

マシンが再起動してもプロセスが死んでも、ハーネスは最後に受け入れられたチェックポイントから再開します。失敗の分類と dry-run 準備チェックは [Solo Harness ドキュメント](https://cli.rexai.top/ja/solo-harness/) を参照してください。

## FAQ

**エージェント実行に自然な停止点がない場合は？**
作ってください。収束する objective（「src/routes/ 配下のすべてのルートにエラーハンドリングの欠落がないか監査する」）は、証拠リストが完成したときに止まります。停止条件がなければ、ランダムウォークにお金を払っているようなものです。

**夜間実行はターミナルをブロックしますか？**
いいえ。`aios harness run` は実行を再開可能な objective として管理するため、セッションを閉じて後で再開できます。

**worktree 分離は必須ですか？**
実行が実際にファイルを並列で書き込むときだけです。単一の夜間実行でも安全なデフォルトであることに変わりはありません——実行が受け入れられるまで作業ツリーをきれいに保ちます。

## 次のステップ

完全な失敗分類は [Solo Harness](https://cli.rexai.top/ja/solo-harness/) を読むか、ルートが実行をどうゲートするかは [Workflow Policy](https://cli.rexai.top/ja/workflow-policy/) を参照してください。
