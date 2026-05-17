---
title: "Solo Harness: タスクを任せて寝て、朝に結果を確認する"
description: "AIOS 1.7 で夜間 agent 実行を実現 — run journal、stop/resume 制御、git worktree による隔離を備えています。"
date: 2026-04-26
tags: ["AIOS", "Solo Harness", "長時間実行 Agent", "ContextDB"]
---

# Solo Harness: タスクを任せて寝て、朝に結果を確認する

Coding agent は短いタスクなら得意です。「このバグを直して」「この関数を書いて」「このファイルをリファクタリングして」— 数分で終わります。

でも、もっと大きな目標はどうでしょう。「auth モジュール全体をリファクタリングしてテストも書いて」。これは数時間かかります。ずっと見ているわけにはいきません。

**Solo Harness は、大きなタスクを任せて、終わったら戻ってくる仕組みです。**

## 以前のやり方 vs 今のやり方

**以前:** 長いタスクを実行して寝て、起きたら……何かがある。終わってるかもしれない。止まってるかもしれない。git 履歴がめちゃくちゃになってるかもしれない。何が起きたのか全くわかりません。

**今:** `--worktree` 付きで harness run を開始して寝て、朝には:

- **run journal** を確認して、何が起きたか正確に把握
- **構造化ステータス** を確認して、完了したかどうかを確認
- 止まっていれば、止まった場所から **resume**
- 方向を間違えていれば、**worktree を削除** — メインブランチには影響なし

## 仕組み

```bash
# 夜: 実行を開始
aios harness run \
  --objective "auth モジュールをリファクタリングして統合テストを書く" \
  --session nightly-auth \
  --worktree

# 朝: 何が起きたか確認
aios harness status --session nightly-auth --json

# 完了していたら: 変更を確認
aios hud --session nightly-auth

# 止まっていたら: 問題を修正して再開
aios harness resume --session nightly-auth --max-iterations 10
```

## `--worktree` が重要な理由

`--worktree` フラグは重要です。リポジトリの別コピーを作成し、agent が自由に変更を加えられるようにします。

- **良い結果？** worktree をメインブランチにマージ
- **悪い結果？** worktree を削除するだけ — コードへの影響はゼロ

`git reset --hard` は不要。リスキーなクリーンアップも不要。安全な隔離だけ。

## 何が記録されるか

各 harness run は journal を書き出します:

```
memory/context-db/sessions/<session-id>/artifacts/solo-harness/
  ├── objective.md           # 依頼した内容
  ├── run-summary.json       # 現在の状態と進捗
  ├── control.json           # 停止要求とメモ
  ├── iteration-0001.json    # 各イテレーションで何が起きたか
  └── iteration-0001.log     # 詳細ログ
```

これにより **読みやすい引き継ぎ記録** が手に入ります — 「agent がしばらく動いていた」ではなく、何をしたか、何が上手くいったか、何が上手くいかなかったかが正確にわかります。

## Solo Harness を使うべきケース

**使うべきケース:**
- 1つの明確な目的があり、時間がかかる
- タスクを複数の agent に分割する必要がない
- 見守るのではなく、結果が出たタイミングで確認したい

**使わないべきケース:**
- タスクが独立した部分に分割できる（代わりに [Agent Team](https://cli.rexai.top/ja/team-ops/) を使ってください）
- まだ要件を整理中（通常のセッションで始めてください）
- 品質ゲート付きの段階的実行が必要（orchestrate を使ってください）

## 試してみる

```bash
# まず dry run でセットアップを確認
aios harness run \
  --objective "payment モジュールの統合テストを書く" \
  --session test-dry \
  --worktree \
  --dry-run --json

# 準備ができたら、本番実行
aios harness run \
  --objective "payment モジュールの統合テストを書く" \
  --session payment-tests \
  --worktree \
  --max-iterations 20
```

---

*Solo Harness は AIOS 1.7 でリリースされました。[ドキュメント](https://cli.rexai.top/ja/solo-harness/)を読むか、今夜試してみてください。*
