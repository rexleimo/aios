---
title: "v6.0.1：エンジニアリング基準を rex-harness へ——基準の居場所を消費者と同じに"
description: "v6.0.1 はエンジニアリング基準スキルをホストから rex-harness サブモジュールへ移し、rex-engineering-standards に改名（rex-harness 0.7.0）：能力チェーンの共通品質基準が能力チェーンと一緒に出荷され、スタンドアロンの rex-harness 利用者も它を見逃さない。"
date: 2026-09-21
tags: ["AIOS", "エンジニアリング基準", "rex-harness", "アーキテクチャ", "リリース", "v6.0.1"]
---

# v6.0.1：エンジニアリング基準を rex-harness へ——基準の居場所を消費者と同じに

> **Quick Answer：** v6.0.0 はエンジニアリング基準をホストスキル `aios-engineering-standards` として出荷した。これは依存方向を逆にしていた：基準を消費する四つの Provider（`rex-implement`、`rex-refactor-hardening`、`rex-code-review`、`rex-design`）はすべて `rex-harness` サブモジュールにあり、rex-harness 自身は npm 公開の独立コントロールプレーンだ。v6.0.1 が一回の移動で訂正する：スキルは `rex-engineering-standards` として `rex-harness` 0.7.0 から出荷され、投影履歴に digest を登録済み。内容と Definition of Done は不変。router と `pre-edit-safety-gate` は新しい名前を参照する。

## なぜ移すのか

最初の配置が誤っていた二つの事実：

1. **消費者がサブモジュールにいる。** すべてのコード生産 Provider は実行前にこの基準を読む。読み手がすべて一つの倉庫にあり、基準自身が別の倉庫にあるのは逆依存——エンジンがホストのカタログを参照している。
2. **rex-harness は独立している。** `@rexleimo/rex-harness` は npm に公開され、`files` に `skill-sources/` を含み、自己紹介も「独立した証拠駆動ワークフローコントロールプレーン」。AIOS ホストなしで rex だけ使う利用者は、存在しないスキルを参照する四つの Provider を目の前にすることになる——品質基準は AIOS の外で静かに消える。

基準はこれからも能力チェーン（証拠契約、Provider ステップ、門）と共に進化する。同じ倉庫 = 一つのリポジトリ、一つの変更履歴、変更ごとに一つのバージョン物語。

## 変わったこと

- スキルは `rex-harness/skill-sources/rex-engineering-standards/` から出荷（rex-harness 0.7.0）。`src/clients/projection-history.json` に digest を登録し、クライアント投影はスムーズに更新。
- ホストのスキルカタログは 27 に戻り、rex 投影は 14 に増加。
- `aios-workflow-router` と `pre-edit-safety-gate` が `rex-engineering-standards` を読み込み参照——router が `rex-*` Provider を名前で参照するのと同じパターン。
- 基準本体——境界、深いモジュール、コード基準、テスト基準、ツールチェーン基準、ADD、Definition of Done——は一字不変。

## 変わらないこと

v6.0.0 で出荷した利用者向けの挙動はすべて維持：router はどのコード生産 Provider の前にも基準を読み込み、完了は Provider の証拠契約**と** Definition of Done の**両方**を要求し、「品質スキップ」ルートは依然として存在しない。公開の[エンジニアリング基準ページ](/ja/engineering-standards/)と参考資料はスキル名以外そのまま。

## アップグレード

`aios update`（または `aios init --all`）を実行してスキルを再投影。新しい `rex-engineering-standards` が古いホスト投影を自動的に置き換える。設定も迂回も不要。

## 関連

- [v6.0.0：エンジニアリング基準の内蔵——AIOS はコードを生成するだけでなく、ソフトウェアを構築する](/blog/ja/2026-09-v600-engineering-standards/)
- [エンジニアリング基準ドキュメント](/ja/engineering-standards/)
