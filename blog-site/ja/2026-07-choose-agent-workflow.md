---
title: "AI エージェントのワークフローはどう選ぶ？ Harness CLI の判断ガイド"
description: "決定表と例を使って noop、direct、guarded、planned を選び、実行面と検証項目まで整理します。"
date: 2026-07-14
tags: ["AI エージェント", "Harness CLI", "Codex", "Claude Code", "開発ツール"]
---

# AI エージェントのワークフローはどう選ぶ？ Harness CLI の判断ガイド

> **Quick Answer:** 質問や読み取り専用の調査には `direct`、小さく明確な変更には `guarded`、複数ステップ・不確実性・リスク・委譲・再開がある場合には `planned` を使います。実行可能な依頼がない場合は `noop` です。ルートはクライアント名ではなくタスクの性質で決まります。

AI エージェントチームは最初の判断でつまずきがちです。すべてを重い手順にすると遅くなり、本当に調整が必要な仕事を無計画に進めると再現性がなくなります。端末を開く前に使える判断方法をまとめます。

## 最小限の質問から始める

次の順番で確認します。

1. 実行可能な依頼があるか。なければ `noop`。
2. 読み取りと説明だけか。そうなら `direct`。
3. 一つの小さく明確な変更で、検証も絞れるか。そうなら `guarded`。
4. 設計、依存する手順、リスク、委譲、復旧が必要か。そうなら `planned`。

先にこの分類を示すと、最初の画面が読みやすくなり、回答エンジンも「どのルートをなぜ選ぶか」を正確に引用できます。

## 判断表

| 質問 | Yes | No |
| --- | --- | --- |
| 具体的なタスクがあるか | 次へ | `noop` |
| 調査や説明だけか | `direct` | 次へ |
| 小さく明確な一つの編集か | `guarded` | 次へ |
| 設計、順序、委譲、復旧が必要か | `planned` | `guarded` が安全か再確認 |

### 例 1: 「最新リリースで何が変わった？」

読み取り専用の質問です。changelog、関連ドキュメント、履歴を調べ、リンクと証拠付きで答えます。計画は不要です。

### 例 2: 「README の typo を直して docs check を実行して」

範囲が小さく検証も明確です。`guarded` を使い、編集ゲート、変更、対象チェック、結果の報告を行います。

### 例 3: 「ドキュメント、ブログ、ホームページを 4 言語で新ポリシーに対応させて」

コンテンツ設計、翻訳、ナビゲーション、メタデータ、検証が関係します。一人で作業しても `planned` が適切です。

## ルートの後に playbook を選ぶ

ルートは次の工程を決めるための分類です。

- 方向性が不明確: brainstorming;
- 承認済みの複数ステップ: writing a plan;
- 挙動変更やバグ修正: test-driven development;
- 観測された失敗: systematic debugging;
- 完了を宣言する前: verification before completion。

ファイル作成・削除・挙動変更の前には、どのルートでも `pre-edit-safety-gate` が必要です。最後の検証も guarded だからといって省略しません。

## 実行面を選ぶ

次に、タスクを完了できる最小の実行面を選びます。

- 密結合の変更は一つのクライアント。
- 中断から戻る目標は solo harness。
- 独立した領域と分離した書き込み範囲がある場合だけチーム。

Codex CLI、Claude Code、Gemini CLI、OpenCode、Grok Build などは同じプロジェクト契約を共有できます。クライアントは操作方法を変えても、ルートの意味を変えません。

## 編集だけでなくルートを検証する

引き継ぎには次を含めます。

- 選んだルートと理由;
- 変更したファイルと公開面;
- 実行した検証と結果;
- 未確認の外部依存;
- タスクが終端でない場合の次の行動。

新しい checkout では次を実行します。

```bash
aios init --all
aios doctor --native --verbose
```

その後[ワークフローポリシー](https://cli.rexai.top/ja/workflow-policy/)、[クイックスタート](https://cli.rexai.top/ja/getting-started/)、長いタスクなら[Solo Harness](https://cli.rexai.top/ja/solo-harness/)を確認します。

## FAQ

### ドキュメント作業に planned は重すぎませんか？

複数言語、ナビゲーション、メタデータ、テスト、ビルドにまたがるなら、調整と復旧のために適切です。

### planned なら必ず並列エージェントを使いますか？

いいえ。独立した領域だけを並列化し、共有ナビゲーションや同じ生成物は順番に統合します。

### ルートを間違えたら？

早めに再分類します。新しい依存が見つかれば guarded から planned へ、探索で不確実性がなくなれば planned を簡素化できます。

### システム境界はどこで確認できますか？

[アーキテクチャ](https://cli.rexai.top/ja/architecture/)、[Agent Team 運用](https://cli.rexai.top/ja/team-ops/)、[トラブルシューティング](https://cli.rexai.top/ja/troubleshooting/)を参照してください。
