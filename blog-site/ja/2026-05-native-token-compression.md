---
title: "ネイティブ Token 圧縮：Harness CLI が RTK や Caveman をインストールしない理由"
date: 2026-05-12
tags: ["AIOS", "token compression", "ContextDB", "skills", "Harness CLI"]
description: "Harness CLI は ContextDB 入力圧縮、ブラウザのコンパクト読み取り、CLI 出力の絞り込み、出力圧縮スキルを自前で実装し、競合ツールに依存しません。"
---

# ネイティブ Token 圧縮：Harness CLI が RTK や Caveman をインストールしない理由

Token コストは料金だけの問題ではありません。信頼性の問題でもあります。

長時間の AI コーディングでは、巨大ログ、重複したスタックトレース、ページの定型文、冗長な進捗報告がモデルの文脈を汚します。簡単な近道は競合の token ツールを入れることですが、Harness CLI はそれを選びません。

RTK 風の入力フィルタリングと Caveman 風の短い出力という考え方だけを参考にし、AIOS 内で自前実装します。

## 何が変わったか

Harness CLI は token 削減を 2 つのネイティブ層に分けました。

1. **入力圧縮**：コマンド、ブラウザ、ContextDB の内容をモデルに入る前に削減する。
2. **出力圧縮**：コマンド、パス、エラー、リスク警告を残したまま、Agent の回答を短くする。

RTK はインストールしません。Caveman もインストールしません。ユーザーのコマンドをグローバルに書き換える shell hook も使いません。

## ネイティブ入力圧縮

ContextDB には自己完結した token strategy engine があります。

```bash
cd mcp-server
npm run contextdb -- context:pack \
  --session <session_id> \
  --limit 60 \
  --token-budget 1200 \
  --token-strategy balanced \
  --out memory/context-db/exports/<session_id>-context.md
```

デフォルトは保守的です。

- 重複行と stack-run ノイズを圧縮する。
- 重要なエラー、ファイルパス、コマンド、最新状態を守る。
- 保護されたイベントを切る前に、低優先度イベントを落とす。
- `strategy`、`rawTokenUsed`、`compressed`、`dropped`、`truncated` を出力する。

ブラウザ作業では、新しい `aios-browser-compress` スキルがコンパクトな読み取りを優先します。

1. `page.semantic_snapshot`
2. targeted `page.extract_text`
3. full `page.extract_text`
4. `page.get_html`
5. 視覚証拠が必要な時だけ screenshot

CLI 作業では、全量ダンプではなく `rg`、`git diff --stat`、`sed -n`、`head`、`tail`、対象テストを優先します。

## ネイティブ出力圧縮

新しい `aios-compress` スキルは 3 段階を定義します。

| レベル | 用途 | 振る舞い |
|--------|------|----------|
| `tight` | 通常の開発 | 短い技術回答、無駄なし |
| `ultra` | harness ログ、checkpoint | 1 行の証拠 + 次の行動 |
| `precise` | ブラウザ操作、安全、不可逆操作 | 完全で明示的な説明 |

重要なルールは、圧縮でリスクを隠さないことです。エラー、コマンド、パス、selector、日付、検証ギャップは正確に残します。

## なぜ競合ツールを入れないのか

別の token ツールを入れるのは速く見えますが、隠れた結合を作ります。

- コマンド挙動が Harness CLI の外で変わる可能性がある。
- Codex、Claude、Gemini、opencode で挙動を揃えにくい。
- ドキュメント検証が難しくなる。
- ユーザーに依存関係、更新経路、故障モードが増える。

ネイティブ実装なら監査できます。コード、スキル、ドキュメントがリポジトリ内にあります。

## 使い方

ContextDB packet:

```bash
cd mcp-server
npm run contextdb -- context:pack --session <session_id> --token-budget 1200 --token-strategy balanced
```

Agent 出力:

```text
/compress tight
/compress ultra
/compress precise
stop compress
```

ブラウザ自動化では、全ページテキストの前に semantic snapshot と targeted extraction を使います。

## まとめ

Harness CLI の token 削減はネイティブになりました。入力圧縮は ContextDB とブラウザ workflow、出力圧縮は AIOS skill が担当し、競合ツールのインストール手順はありません。

長時間 Agent 作業を安く、静かに、検証しやすくします。
