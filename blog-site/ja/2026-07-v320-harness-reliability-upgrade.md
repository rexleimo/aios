---
title: "v3.20 Harness の信頼性向上: 失敗分類、バックオフ上限、dry-run readiness"
description: "Harness CLI v3.20 が通常の失敗とインフラ障害を分け、有界バックオフと dry-run readiness で長時間タスクを安定させる方法を解説します。"
date: 2026-07-12
tags: ["Harness CLI", "信頼性", "solo harness", "失敗処理", "release"]
---

# v3.20 Harness の信頼性向上: 失敗分類、バックオフ上限、dry-run readiness

> **Quick Answer:** v3.20 は「試行が失敗した」と「インフラが一時的に使えない」を別に数えます。`consecutiveFailures` はすべての非成功 outcome、`consecutiveInfraFailures` はインフラ再試行と runtime/tool error だけを記録し、バックオフには 300 秒の上限があります。dry-run も設定の妥当性と provider の実利用可能性を分けて報告します。

長時間タスクで難しいのは最初の失敗ではなく、失敗後にシステムが状態を説明できるかです。「retrying」だけでは、タスクの入力が悪いのか、モデル、ツール、ネットワークが一時的に使えないのか分かりません。v3.20 は観測可能な失敗の意味を中心に改善しました。

## 2 つのカウンターが解決すること

### `consecutiveFailures`

blocked、failed、infra-retry、human-gate を含む、連続したすべての非成功 outcome を記録します。これは「目標が何回続けて完了しなかったか」を示します。

### `consecutiveInfraFailures`

infra-retry と runtime-error/tool-error など、インフラ系の故障だけを記録します。「再試行すべき実行環境の問題が続いているか」を示す値です。

この 2 つは代替ではありません。人工ゲートで blocked になった仕事とブラウザプロセスが落ちた仕事は、どちらも総失敗数を増やしても必要な復旧アクションは違います。

## バックオフに上限が必要な理由

再試行には provider、ブラウザ、ツールが回復する時間が必要です。しかし上限のないバックオフは、一時的な問題を判断不能な長時間待機に変えます。v3.20 は待ち時間を 300 秒で制限します。

1. outcome と失敗分類を記録する。
2. 回復可能なインフラ障害にはバックオフする。
3. 一回の待ち時間を 300 秒以下にする。
4. 停止条件または人的対応が必要な理由を明示する。

すべてのエラーを自動再試行するという意味ではありません。業務上の失敗、blocked、human-gate には別の次の行動が必要です。

## dry-run readiness は「コマンドが動く」とは違う

入力と設定の検証を通過しても、provider、ログイン済みブラウザ、人的承認が不足している場合があります。そのため状態は少なくとも次のように分けます。

- 入力と設定の形式が正しい;
- ローカルランタイムの検証を通過した;
- 外部依存に接続できる;
- 人的承認が必要、または blocked である。

これにより CI、solo harness、チームの引き継ぎが次の行動を判断しやすくなり、dry-run の成功を live 実行成功と誤記しません。

## どのように使うか

再開可能な長時間タスクでは、まず失敗分類と直近の outcome を見ます。待つのか、入力を修正するのか、再ログインするのか、人的対応を依頼するのかを、単なる再試行回数だけで決めないでください。

[トラブルシューティング](https://cli.rexai.top/ja/troubleshooting/)と[Solo Harness](https://cli.rexai.top/ja/solo-harness/)を組み合わせると、失敗を孤立したログではなく引き継ぎ情報にできます。[アーキテクチャ](https://cli.rexai.top/ja/architecture/)では状態とコンテキストの境界を説明しています。

## FAQ

### すべての失敗が `consecutiveInfraFailures` に入りますか？

いいえ。インフラ再試行と runtime/tool error が対象です。blocked、通常の失敗、human-gate は総失敗数や対応する状態に反映されます。

### 300 秒後に必ず停止しますか？

いいえ。300 秒は一回のバックオフの上限です。継続は outcome、停止条件、人的ゲートで決まります。

### dry-run が通れば live 確認は不要ですか？

不要にはなりません。dry-run は入力と設定がローカル検査で受理されたことを示すだけで、外部 provider、ブラウザ、アカウントの可用性を証明しません。

### これは業務ロジックを変更しますか？

主に harness の状態表示、再試行のリズム、readiness 報告を改善します。次の行動は実際の outcome と人的要件で判断します。
