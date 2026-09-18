---
title: "Codemap：AIエージェントにコードベースの地図を"
description: "ワンコマンドで Tree-sitter 知識グラフをすべての AI コーディングエージェントに注入します。opencode、codex、claude、gemini。エージェントは盲目的な grep をやめ、呼び出し元、依存関係、テストカバレッジ、影響範囲に基づいて判断でき、全クライアントが同じコード地図を共有します。"
date: 2026-05-21
tags: ["codemap", "code-review-graph", "CRG", "knowledge-graph", "AIOS"]
---

# Codemap: AI コーディングエージェントにコードベースの地図を渡す

AI コーディングエージェントはコードを書くのが得意です。しかしコードがどう *つながっているか* の理解は苦手のままです。ファイル名を grep し、いくつかのファイルを読み、変更の影響を推測する——支払ったトークンの半分は、この盲目的な探索に使われていました。

**Codemap はここを変えます。** リポジトリ全体の Tree-sitter 知識グラフ（すべての関数、すべての import、すべての呼び出し関係）を作り、MCP ツールとして各 agent に渡します。コマンドは 1 つ、クライアントは全対応です。

## 課題：エージェントは「見ていない」

「認証タイムアウトのバグを直して」というタスクを受けたとき、Codemap が無い状態では次のことが起きます。

```
Agent reads README
  → grep for "auth" → 47 matches across 18 files
  → reads 5 files (maybe the wrong ones)
  → guesses which function to modify
  → writes code
  → reads more files to verify (still guessing)
  → submits — hopes nothing breaks
```

「ファイルを読む」たびにトークンが消え、「影響を推測」するたびにリスクが増えます。エージェントが存在を知らなかったものを壊すのは、これが理由です。

## 解決策：コードの知識グラフ

Codemap を入れた同じタスクでは、流れが変わります。

```
Agent calls get_minimal_context(task="fix the auth timeout bug")
  → Project structure, risk assessment, relevant modules — instantly
Agent calls query_graph(pattern="callers_of", target="authenticate")
  → 12 callers — can't just change the signature, need a wrapper
Agent calls get_impact_radius()
  → 3 files affected, 2 tests covering them — manageable
Agent modifies code
Agent calls detect_changes()
  → Confirms actual impact matches expected — nothing missed
Agent submits with confidence
```

**盲目な探索も推測もなし。すべての判断が構造に裏付けられます。**

## 1 コマンドで全クライアントへ

```bash
aios internal codemap install
```

この 1 コマンドが次を実行します：

1. 前提条件を確認（`uv` / `uvx`）
2. 初期グラフを構築（5〜15 秒）
3. CRG MCP 設定を opencode / codex / claude / gemini へ注入
4. opencode 自動更新プラグインをインストール
5. AGENTS.md に意思決定チェックポイントの指針を追記

以上です。このあとのすべてのエージェントセッションが、グラフ優先でコードを探索し始めます。

```bash
# ヘルスチェック
aios internal codemap doctor

# ゼロから再構築
aios internal codemap build

# 差分だけ素早く更新（2 秒未満）
aios internal codemap update

# グラフに何が入っているか確認
aios internal codemap status
```

## エージェントが見られるもの

Codemap は 28 個の MCP ツールを公開します。特に効くのは以下です。

| ツール | 置き換える作業 |
|------|-----------------|
| `semantic_search_nodes` | grep——名前 *および意味* でコードを見つける |
| `query_graph` | 呼び出し連鎖を理解するためにファイルを読む行為 |
| `get_impact_radius` | 何が壊れそうかの推測 |
| `detect_changes` | 差分の手動レビュー |
| `get_affected_flows` | どの機能に影響するかの推測 |
| `get_minimal_context` | README を読み、ls し、探索する一連の動き |

## 実際の効果

実リポジトリでの計測では、grep ベースの探索と比べてトークンが 4.9 倍〜27.3 倍削減、平均は 8.2 倍です。ただし本当の価値はコスト削減だけではく、エージェントの振る舞いの変化にあります。

Codemap が無い状態では、エージェントはトークンの 60〜80% をコードベースの *理解* に使います。Codemap を入れるとここが大きく下がり、トークンは *仕事そのもの* に回ります——あなたが課金しているのは、そちらの側です。

## 深い統合

Codemap は単体のプラグインではなく、AIOS の各ワークフローに織り込まれています。

- **`aios doctor`** は他の項目と同じ場で Codemap の健全性を確認
- **Solo Harness** は夜通しのタスクで worktree 内のグラフを自動構築
- **Agent Team** のディスパッチに変更影響解析が含まれ、各 worker が blast radius を把握した状態で始動
- **Skills**（search-first、debug-hub、code-review）は grep より CRG ツールを優先

## まず試す

```bash
# インストール（1 コマンド）
aios internal codemap install

# 状態確認
aios internal codemap doctor

# 懐中電灯ではなく地図で探索させる
```

[ドキュメントを見る →](/ja/codemap/){ .md-button }

## 関連ドキュメント

- [Codemap](https://cli.rexai.top/ja/codemap/)
- [クイックスタート](https://cli.rexai.top/ja/getting-started/) — 30 秒で AIOS をインストール
- [ワークフローポリシー](https://cli.rexai.top/ja/workflow-policy/) — direct / guarded / planned ルート
