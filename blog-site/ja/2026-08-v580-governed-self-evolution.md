---
title: "v5.8.0：AIOS が安全に自己進化する — Session Memory、証拠ゲート、ロールバック可能な昇格"
description: "AIOS v5.8.0 は memo のトリガーチェーンを修正し、決定論的な受入チェック、カナリア昇格、監査、ロールバックを備えた自己進化パイプラインを追加します。"
date: 2026-08-22
tags: ["AIOS", "release", "self-evolution", "memory", "governance", "memo", "dream"]
---

# v5.8.0：AIOS が安全に自己進化する

AIOS v5.8.0 は、完了した作業から経験を学びながらも、本番の動作を勝手に書き換えないためのリリースです。

## 切れていた memo トリガーを接続

これまで通常の session 終了では checkpoint の保存だけが行われ、`autoMemoSessionClose()` は呼ばれていませんでした。そのため session-close candidate は手動コマンドを使わない限り生成されず、dream の統合も長期間実行されませんでした。

v5.8.0 では次の明示的なループになります。

```text
session end -> candidate -> trigger/status -> dream proposal
-> deterministic verdict -> approval/canary -> telemetry -> rollback/stable
```

candidate は active shared memory に直接公開されず、必ずレビュー可能な状態で保存されます。

## 主な変更

- 正常終了、abort、timeout、例外終了を同じ冪等 finalizer で処理。
- `manual`、候補数 `threshold`、`schedule` の明示的な evolution trigger を追加。
- `aios evolution status` が候補数、cooldown、次回実行可能時刻、未実行の理由を表示。
- schema、provenance、scope、安全性、baseHash、replay、holdout、回帰、memory conflict を JSON verdict として評価。
- `candidate -> reviewing -> validated -> proposed -> approved -> canary -> active -> stable` の状態機械を追加。
- 監査イベント、previous stable version、カナリア、ロールバックを記録。
- patch/minor/major、stable/beta/dev channel、セキュリティ更新、通知の重複排除を含む更新通知を追加。

## アップグレード

```bash
aios update --check
aios evolution status
```

既存の memo データ移行は不要です。「update allowed」はポリシー上更新フローに入れることを意味するだけで、Agent が無断でインストールすることはありません。

AIOS の自己進化は、密かに自分を書き換えることではありません。証拠を集め、範囲を限定した候補を提案し、再現可能な検証を行い、いつでも戻せるバージョンとして保存することです。
