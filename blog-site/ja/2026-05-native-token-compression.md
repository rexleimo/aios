---
title: "Token Intelligence の層: ContextDB、RTK、Caveman、Headroom MCP"
description: "AIOS の現在の token intelligence を解説します。pull-based ContextDB、ローカル圧縮、明示的な Headroom MCP を扱います。"
date: 2026-05-12
tags: ["AIOS", "token intelligence", "ContextDB", "RTK", "Caveman", "Headroom MCP"]
---

# Token Intelligence の層: ContextDB、RTK、Caveman、Headroom MCP

> **Quick Answer:** AIOS は token 効率を層に分けます。ContextDB は必要なプロジェクトコンテキストを保存・取得し、RTK と Caveman はローカルでコマンドと出力を小さくし、Headroom MCP は後続 step のための明示的な compress/retrieve tool を提供します。Headroom はすべての model request を透明に interception するものではありません。

長い Agent セッションではログ、ブラウザの定型文、重複した履歴が判断に必要な文脈を埋めます。重要なのは万能なスイッチではなく、保存、圧縮、取得の境界を分けることです。

## 各層の責任

| 層 | 責任 | 境界 |
| --- | --- | --- |
| ContextDB | 事実、event、refs、handoff を保存し必要なものを取得 | pull-based。全履歴を毎回注入しない |
| RTK | 対応する CLI 出力をローカルで圧縮 | 検証の代わりではない |
| Caveman | prompt/skill で出力を簡潔にする | エラー、パス、コマンド、リスクは残す |
| Headroom MCP | 後続 step で必要な材料を明示的に compress/retrieve | on-demand tool call。透明な interception ではない |

導入は次から始めます。

```bash
aios init --all
aios doctor --native --verbose
```

任意の圧縮ツールと Headroom MCP のインストール許可は別々に扱います。

## ContextDB はメモリの境界

安定した事実、選んだ task、handoff を ContextDB に保存し、次の判断に必要なものだけを pull します。context pack は token budget で制限できます。

```bash
cd mcp-server
npm run contextdb -- context:pack --session <session_id> --token-budget 1200 --token-strategy balanced
```

registry marker は登録情報の存在を示すだけで、全履歴が各 prompt に自動注入されることを意味しません。

## 圧縮しても証拠を失わない

圧縮結果には正確なコマンド、ファイルパス、最新状態、エラー、警告、検証ギャップ、元の参照を残します。短くすること自体が目的ではなく、同じ判断品質で少ない文脈を使うことが目的です。

## FAQ

### すべての層を導入する必要がありますか？

いいえ。まず ContextDB を使い、ログが大きい場合にローカル圧縮を追加します。後続 step で明示的な取得が必要な場合だけ Headroom MCP を使います。

### Headroom は現在の model request を自動的に書き換えますか？

いいえ。呼び出し側が compress/retrieve の対象を選ぶ明示的な MCP tool です。

### 現在の仕様はどこですか？

[Token Intelligence](https://cli.rexai.top/ja/token-compression/)、[ContextDB](https://cli.rexai.top/ja/contextdb/)、[トラブルシューティング](https://cli.rexai.top/ja/troubleshooting/)を参照してください。

## 関連ドキュメント

- [トークンインテリジェンス](https://cli.rexai.top/ja/token-compression/)
- [Quick Start](https://cli.rexai.top/ja/getting-started/) — 30 秒で AIOS をインストール
- [Workflow Policy](https://cli.rexai.top/ja/workflow-policy/) — direct / guarded / planned ルート
