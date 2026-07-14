---
title: "ContextDB 検索アップグレード: FTS5/BM25 + 増分インデックス同期"
description: "SQLite FTS5、BM25、refs 完全一致、可観測な増分同期で AI エージェントのメモリ検索を安定させる方法を説明します。"
date: 2026-06-18
tags: ["ContextDB", "FTS5", "BM25", "Agent memory", "検索"]
---

# ContextDB 検索アップグレード: FTS5/BM25 + 増分インデックス同期（P1.5）

> **Quick Answer:** ContextDB は SQLite FTS5 と BM25 で候補を順位付けし、正規化した `event_refs` で完全一致を行い、`index:sync --stats` で増分同期を観測します。CI では `--jsonl-out` を使って実行履歴を保存できます。

ContextDB は P1 で検索の主経路を SQLite FTS5 + BM25 に移行しました。  
P1.5 では運用面をさらに強化し、次を追加しています。

- 増分 sidecar 同期の可観測化（`index:sync --stats`）
- 同期メトリクスの JSONL 出力（`--jsonl-out`）
- `event_refs` 正規化テーブルによる refs 完全一致フィルタ
- refs クエリのベンチマーク/CI gate スクリプト

## なぜ拡張したのか

FTS5/BM25 移行後も、実運用では次の課題が残りました。

- 同期ごとの構造化メトリクスがなく、鮮度やコストを追跡しづらい
- 大規模データで refs フィルタの精度保証をさらに強化したい

P1.5 は既存ワークフローを壊さず、この 2 点を補完します。

## 現在の動作

`contextdb search` とインデックス保守は次の流れです。

1. SQLite FTS5 `MATCH`
2. `kind/text/refs` に対する BM25（`bm25(...)`）
3. FTS 非対応時は lexical へ自動フォールバック
4. 正規化 `event_refs` による refs 完全一致（部分一致の曖昧さを排除）
5. `index:sync` による増分更新（`index:rebuild` は引き続き利用可）

## コマンド

```bash
cd mcp-server
npm run contextdb -- search --query "auth race" --project demo --refs auth.ts
npm run contextdb -- index:sync --stats
npm run contextdb -- index:sync --stats --jsonl-out memory/context-db/exports/index-sync-stats.jsonl
npm run bench:contextdb:refs:ci
npm run bench:contextdb:refs:gate
```

ローカル調整には:

```bash
npm run bench:contextdb:refs -- --events 2000 --refs-pool 200 --queries 300 --warmup 30 --json-out test-results/contextdb-refs-bench.local.json
```

## 実務上の効果

- 同期品質/コスト（`scanned/upserted`、処理時間、throttle skip）を継続観測できる
- 大規模データでも refs フィルタの誤検出を抑制
- refs クエリの遅延/ヒット率を CI gate で回帰防止
- 長時間セッションやクロス CLI 引き継ぎで、毎回フル再構築せず安定運用

## FAQ

### BM25 は refs の完全一致フィルタを置き換えますか？

いいえ。BM25 はテキスト候補の順位付けを担当し、正規化された `event_refs` がその後に完全な参照条件を適用します。

### 毎回インデックス全体を再構築すべきですか？

いいえ。通常の保守には増分 `index:sync` を使い、復旧や移行など明示的に必要な場合だけ `index:rebuild` を使います。

### 現在の実装を確認する公式ドキュメントはどこですか？

[ContextDB ドキュメント](https://cli.rexai.top/ja/contextdb/)、[Token Intelligence](https://cli.rexai.top/ja/token-compression/)、[Troubleshooting](https://cli.rexai.top/ja/troubleshooting/)を参照してください。
