---
title: "ContextDB Token Compression: 小さなコンテキストパケットと安全な recall"
description: "ContextDB context:pack は token 予算内でノイズの多いイベント履歴を先に圧縮し、その後に低優先度イベントを落とせるようになりました。"
date: 2026-05-12
tags: ["ContextDB", "token compression", "context pack", "AI memory", "RexCLI"]
---

# ContextDB Token Compression: 小さなコンテキストパケットと安全な recall

長時間の agent セッションは有用な記憶を作りますが、raw history はすぐに高コストになります。prompt、tool log、stack trace、checkpoint をすべてそのまま詰めると、次の agent 実行が不要な token まで支払うことになります。

## クイックアンサー

ContextDB `context:pack` は **token compression** をサポートしました。token 予算と strategy を指定すると、低優先度イベントを落とす前にノイズの多いイベントテキストを圧縮します。最新イベント、エラー、ファイル参照、コマンド、next action は先に保護されるため、小さなパケットでも実用的な recall を残せます。

[公式 ContextDB docs を読む](https://cli.rexai.top/ja/contextdb/#token-compression){ .md-button .md-button--primary }

## すぐ使う

```bash
npm run contextdb -- context:pack \
  --session <id> \
  --limit 80 \
  --token-budget 1200 \
  --token-strategy balanced \
  --out memory/context-db/exports/<id>-compressed.md
```

通常は `balanced` を使います。非常に小さなパケットが必要なら `aggressive`、旧来の tail-window 動作を確認したいなら `legacy` を使ってください。

## 何が変わったか

以前の予算付きパケットは主に tail window でした。新しい経路では、重複ログ、長い出力、stack trace を安全に圧縮し、それでも入らない場合だけ低優先度イベントを削除します。

| Strategy | Best for | Behavior |
|---|---|---|
| `balanced` | 日常利用 | ノイズを圧縮し、最新・高シグナルイベントを保護。 |
| `aggressive` | 小さな予算 | より厳しい行数・長さ制限を適用。 |
| `legacy` | 互換性確認 | 旧来の tail-only 選択を使用し、圧縮しない。 |

`Event Window` 行には `tokenBudget`、`tokenUsed`、`rawTokenUsed`、`compressed`、`dropped`、`truncated` が表示され、token 節約が圧縮によるものか削除によるものか確認できます。

## FAQ

### Search の代わりですか？

いいえ。Search は特定の過去イベントを探すためのものです。Token compression は、選択されたセッションウィンドウを次の prompt packet に収めるためのものです。

### 重要なエラーは消えませんか？

既定 strategy は高シグナル語、file path、error、最新イベントを保護します。圧縮版が十分な signal を残せない場合、そのイベントは原文のまま保持されます。
