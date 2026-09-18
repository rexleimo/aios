---
title: コードレビューグラフ (Codemap)
description: "Tree-sitter ベースの構造ナレッジグラフ: 呼び出し元、依存先、テストカバレッジ、影響範囲を、エージェントが判断するたびに参照できるようにします。コードを何度も grep し直す必要がなくなり、コマンド一発で複数クライアントが同じコードマップを共有でき、変更の影響範囲が一目で分かります。"
---

# Code Review Graph（Codemap）

> **Quick Answer:** Codemap はリポジトリの構造グラフをローカルに作り、編集前に caller、dependent、import、affected flow、テストカバレッジを調べられるようにします。影響半径を絞る道具であり、テストの代わりではありません。

## まず答える 3 つの質問

変更前に、何に影響するか、どのフローが依存するか、対象にどのテストがあるかを確認します。グラフが使えない場合は、対象を絞った検索をフォールバックとして明記します。

**要点：** Codemap はコードベース全体から Tree-sitter のナレッジグラフをビルドし、MCP ツールとしてすべての coding agent に注入します。agent は闇雲に grep するのをやめ、何を誰が呼んでいるか、どのテストが何を守るか、変更すれば何が壊れるかを踏まえて判断します。

外部サービスなし。クラウドなし。`.code-review-graph/` に置かれるローカルの SQLite グラフだけです。

## なぜ Codemap か？

Codemap がなければ、agent のコードベース探索はこうなります:

```
Agent reads README → grep for "auth" → reads 3 files blind → guesses impact → modifies code → reads more files to verify → may miss callers → rework
```

Codemap があれば:

```
Agent queries graph → knows callers/dependents/tests → calculates blast radius → makes informed change → queries graph to verify → confident submission
```

**実測したトークン削減：** 実在リポジトリで 4.9 倍〜27.3 倍、平均 8.2 倍。それ以上に重要なのは、agent の判断の*質*が変わることです。

## ワンコマンドでセットアップ

```bash
aios internal codemap install
```

以上です。この 1 つのコマンドが次を行います:

1. `uv` の有無を確認（CRG は `uvx` で動くのでグローバルインストール不要）
2. 初回グラフをビルド（たいていのプロジェクトで約 5〜15 秒）
3. 検出したすべてのクライアントに CRG MCP サーバーを注入（codex / claude / gemini / opencode / hermes / grok / workbuddy、Pi は Pi 側の MCP アダプター経由）
4. opencode が検出できれば自動更新プラグインを導入
5. `AGENTS.md` に「グラフを先に照会する」判断指針を追記

```bash
# Check installation health
aios internal codemap doctor

# Fix any issues
aios internal codemap doctor --fix

# Rebuild graph from scratch
aios internal codemap build

# Incremental update (changed files only, <2s)
aios internal codemap update

# View graph statistics
aios internal codemap status

# Remove cleanly (preserves .code-review-graph/)
aios internal codemap uninstall
```

## agent の使い方

導入後、agent の各セッションは AGENTS.md の判断チェックポイントを読み込みます:

### 判断チェックポイント（必須）

| タイミング | 呼び出し | 理由 |
|------|------|-----|
| なんをする前 | `get_minimal_context(task="...")` | プロジェクトの文脈と次の一歩の提案 |
| コード変更前 | `get_impact_radius(detail_level="minimal")` | 影響範囲（blast radius）を確認。risk=high なら計画を練り直す |
| コード変更前 | `query_graph(pattern="tests_for", target="...")` | テストの有無を確認。なければ先に書く |
| コード変更後 | `detect_changes(detail_level="minimal")` | 実際の影響が想定どおりか検証 |
| 提出前 | `get_affected_flows()` + `get_suggested_questions()` | 最後の安全ネット |

### 検索ルール

- コードを探す: grep より先に `semantic_search_nodes`
- 関係を把握する: ファイルを読むより先に `query_graph`（callers_of/callees_of/tests_for）
- コードレビュー: 全ファイルを読むより先に `detect_changes` → `get_review_context`

`detail_level="minimal"` を既定とし、情報が足りないときだけ "standard" に引き上げます。

## 主要ツール

Codemap は 28 個の MCP ツールと 5 個のプロンプトを公開します。効果の大きい順に:

| ツール | 役割 | 使うタイミング |
|------|-------------|-------------|
| `get_minimal_context` | プロジェクト構成・リスク水準・関連コミュニティ・次の手順を返す | 各セッションの開始時 |
| `get_impact_radius` | 変更の影響を受ける箇所をすべて表示 | コードを書く前 |
| `detect_changes` | 実際の変更内容をリスク付きで分析 | コード変更後 |
| `query_graph` | 任意のシンボルについて呼び出し元・呼び出し先・import・テストを追跡 | 関係を把握するとき |
| `semantic_search_nodes` | 関数 / クラスを名前や意味から検索 | コード定位（grep の代替） |
| `get_review_context` | レビューに必要な抜粋だけを提示 | 提出前 |
| `get_affected_flows` | 影響される実行パスを示す | 影響分析 |

### `query_graph` のパターン

| パターン | 返り値 |
|---------|---------|
| `callers_of` | 対象を呼んでいる関数 |
| `callees_of` | 対象が呼んでいる関数 |
| `imports_of` | ファイル / モジュールの import |
| `importers_of` | そのファイル / モジュールを取り込んでいる側 |
| `tests_for` | 対象を守るテスト |
| `inheritors_of` | 対象を継承するクラス |

## 深い統合

Codemap は単独のツールではなく、AIOS のワークフローに織り込まれています:

- **Doctor 一式:** 毎回の `aios doctor` でグラフの健全性・MCP 設定・状態ファイルを `doctor:codemap` が検証
- **Harness:** Codemap が有効なら、Solo harness は worktree 内でグラフを自動ビルド
- **Agent Team:** dispatch に CRG の `detect-changes` 分析を含め、全 worker が変更の影響を把握した上で着手
- **Skills:** Search-first・debug-hub・requesting-code-review は grep/glob より CRG ツールを優先

## アーキテクチャ

```
aios internal codemap install
  ├─ Checks uv/uvx availability
  ├─ Runs uvx code-review-graph build      → .code-review-graph/ (SQLite)
  ├─ Injects MCP config into all clients    → .mcp.json / ~/.claude.json / etc.
  ├─ Installs opencode auto-update plugin   → ~/.config/opencode/plugins/crg-plugin.ts
  ├─ Writes state file                      → .aios/codemap.json
  ├─ Updates AGENTS.md decision guidance
  └─ Syncs aios-codemap-ops skill to client dirs
```

グラフデータはすべてローカルに留まります。CRG は stdio MCP で動作し、HTTP サーバーも外部ネットワーク呼び出しもありません（初回セットアップ時の `uvx` によるパッケージ解決を除く）。

## アンインストール

```bash
aios internal codemap uninstall
```

MCP 設定エントリ・状態ファイル・AGENTS.md の該当節を削除します。`.code-review-graph/` は残します——グラフデータは資産なので決して消しません。

dry-run でプレビュー:

```bash
aios internal codemap uninstall --dry-run
```

## よくある質問

### Codemap はリポジトリを外部サービスへ送りますか？

いいえ。グラフデータと stdio MCP はローカルで動作します。初回インストール時のパッケージ解決は別の導入処理です。

### グラフの結果だけで安全だと証明できますか？

できません。影響範囲を絞るだけで、テスト、ビルド、人的レビューが完了証拠になります。

## 正規ドキュメント

[アーキテクチャ](architecture.md)、[ワークフローポリシー](workflow-policy.md)、[トラブルシューティング](troubleshooting.md)を参照してください。
