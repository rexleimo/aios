---
title: "v5.8.2：プランが先回りしなくなり、AIOS が WorkBuddy をネイティブ対応"
description: "AIOS v5.8.2 は、サブエージェントが task id なしで成功を報告した際にプランが勝手に進む問題を修正し、WorkBuddy を完全対応クライアントとして加えます——ネイティブ指示・MCP・24/24 スキル、および同梱の codebuddy CLI による harness 駆動。"
date: 2026-08-29
tags: ["AIOS", "リリース", "プラン", "workbuddy", "harness", "安定性"]
---

# v5.8.2：プランが先回りしなくなり、AIOS が WorkBuddy をネイティブ対応

v5.8.2 では 2 つのことが入りました。1 つは、サブエージェント経由でプランを走らせる人を皆が噛まれていた静かなバグです。もう 1 つは、AIOS が WorkBuddy を後付けではなく本物のクライアントとして扱うようになったことです。

## プランが自ら進んでいた

サブエージェントランタイム経由で構造化プランを走らせると、Agent が実際に手を付ける前に*次の*タスクが `in_progress` に変わっているのに気づいたかもしれません。「完了」ではなく——ただ静かに進行中とマークされ、プランが実際より先に進んだように見えていたのです。

根本原因：`syncPlanWithIterationOutcome` は sync のたびに `markPlanTaskInProgress` を呼んでいました。サブエージェントランタイムは成功を報告する際、どのタスクを終えたかを名指ししません（`phase-plan-sync.mjs` は `{outcome:'success', ok:true}` を `taskId` なしで送信します）。結びつける id がないため、旧コードは次の pending タスクを拾って昇格させていました。修正：sync は今や証拠を記録するだけで、明示的な `taskId` があるときのみ動きます。`in_progress` を決めるのは harness loop の持ち主——sync は単に見ているだけです。

また、死コードの `hasCommitEvidence` ヘルパーを削除し、`hasTargetFileChanges` のパス一致バグ（絶対パスが一切一致しなかった）を修正しました。テスト：plan-runtime 5/5、全回帰 1064/0。

## WorkBuddy は今や第一級クライアント

以前 WorkBuddy はネイティブ指示生成しか得ておらず、チェーンの残りはありませんでした。今は端から端まで配線されました：

- ネイティブワークフロー / スキル生成が `.workbuddy/` に出力される
- MCP 設定が `~/.workbuddy/mcp.json` に書き出される（ブラウザ / shell / 認証 MCP がすべて移行）
- 完全なスキル同期——カタログ 24/24 スキルがすべてインストールされる
- 同梱の `codebuddy` CLI による solo-harness 駆動：`aios harness run --provider workbuddy` がプロバイダを解決して実行する

一つ注意： `codebuddy` バイナリはデフォルトでは PATH にありません。シェル設定に追加してください：

```bash
export PATH="/Applications/WorkBuddy.app/Contents/Resources/app.asar.unpacked/cli/bin:$PATH"
```

## アップグレード

```bash
aios update
```

設定の移行は不要です。クライアントを再起動すれば、新しい plan-runtime + WorkBuddy 統合が有効になります。
