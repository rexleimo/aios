---
title: "AI コーディングエージェントがセッション間でコンテキストを忘れる理由（とその修正方法）"
description: "コーディングエージェントは各 CLI 実行が空のウィンドウで始まるため、セッション間でコンテキストを失います。ローカルプロジェクトメモリ（ContextDB）が、データをサーバーに送らずに Claude Code、Codex、Gemini CLI、OpenCode に永続メモリを与える仕組みを解説。"
date: 2026-08-10
schema_type: techarticle
---

# AI コーディングエージェントがセッション間でコンテキストを忘れる理由（とその修正方法）

> **まず答え：** コーディングエージェントがセッション間でコンテキストを忘れるのは、新しいセッションが毎回空のプロンプトウィンドウから始まるからです——前回の決定、ファイルマップ、制約が会話に含まれていません。修正は永続的な**ローカルプロジェクトメモリ**です：決定、チェックポイント、検索可能なコンテキストをプロジェクト内のディスクに保存し、必要なときにエージェントが必要なものをプルします。AIOS はこれを ContextDB として提供します。`codex`、`claude`、`gemini`、`opencode`、`hermes`、`grok` で動くプルベースのメモリストアで、プロジェクトデータをサーバーに送りません。

## 問題：すべてのセッションは健忘症の新入り

昨日作業したプロジェクトで `codex` や `claude` を開いてみてください。エージェントは覚えていません：

- 合意したアーキテクチャ決定、
- あなたが守っている命名規則、
- 追っていた失敗テスト、
- 「生成された dist ディレクトリには絶対に触れない」という制約。

エージェントはこれらすべてを、ファイルを読み直すか、あなたに再質問するか——最悪の場合、先週の決定と矛盾する決定を下すか——で再発見します。これはモデル品質の問題ではありません。**コンテキスト可用性の問題**です：情報はリポジトリに存在するのに、適切なタイミングで会話に浮上させるものが何もないのです。

## 「README を貼り付ける」が修正にならない理由

ナイーブな回避策——プロジェクトコンテキスト全体をすべてのプロンプトに貼り付ける——は単純な理由で失敗します：コンテキストは予算です。1 万行のプロジェクト要約はモデルの注意予算を溺れさせ、定型文にトークンを浪費します。必要なのは**選択的想起**です：プロジェクトが何を決定したかを知っているストアから、適切な瞬間に、適切な数百トークンを取り出すこと。

## 修正：プルベースのローカルプロジェクトメモリ（ContextDB）

AIOS の [ContextDB](https://cli.rexai.top/ja/contextdb/) は、3 つの部品を持つプロジェクトローカルメモリストアです：

| 部品 | 何をするか |
| --- | --- |
| **Memo** | 永続的な決定や制約を保存：`aios memo add "Keep auth tests strict"`、後でどのセッションからでも `aios memo search "auth"`。 |
| **Checkpoints** | セッション状態を記録し、再開した実行がゼロではなく前回の停止位置から続くようにする。 |
| **Searchable packs** | 関連コンテキスト（docs、plans、決定）を有界で検索可能な単位にまとめ、エージェントがオンデマンドでプルできるようにする。 |

ContextDB は**プルベース**です：何もすべてのプロンプトに注入されません。タスクが必要なときにエージェントが関連資料を検索・想起します。それによりプロンプト予算は小さく、メモリはセッションをまたいで永続します。

## 2 分以内のセットアップ方法

```bash
# 1. Install and initialize in your project root
curl -fsSL https://github.com/rexleimo/aios/releases/latest/download/aios-install.sh | bash
source ~/.zshrc
aios init --all

# 2. Verify ContextDB and client sync
aios doctor --native --verbose

# 3. Start saving decisions
aios memo add "Authentication tests must stay strict"
aios memo search "authentication"
```

その後、同じプロジェクトで `codex`、`claude`、`gemini`、`opencode`、`hermes`、`grok` を開いてください——エージェントは必要なときにメモリを見つけます。

## コードをサーバーに送りますか？

いいえ。ContextDB はすべてをプロジェクト内の `.aios/context-db/` に保存します。エンジン、メモリ、トークン圧縮（RTK / Caveman / Headroom）、ブラウザはすべてローカルで実行されます。データがマシンの外に出ることはありません。詳細は [プライバシーガードのケーススタディ](https://cli.rexai.top/ja/case-privacy-guard/) を参照してください。

## FAQ

**同じプロジェクトでもセッション間でエージェントが忘れるのはなぜですか？**
各 CLI セッションが新しいプロンプトウィンドウから始まるからです。何かが浮上させない限り、セッションには昨日の決定に結びつくものが何もありません——それがプロジェクトメモリの役目です。

**ContextDB はベクターデータベースと同じですか？**
いいえ。ContextDB は構造化された検索可能なプロジェクトメモリ（memo、checkpoint、pack）を明示的なガバナンス付きで保存します——何を覚え、何を消すかをあなたが選びます。

**Claude Code で動きますか？**
はい。ContextDB はクライアント非依存です：同じプロジェクトマーカーを通じて codex、claude、gemini、opencode、hermes、grok で動きます。

## 次のステップ

完全な [ContextDB ドキュメント](https://cli.rexai.top/ja/contextdb/) を読むか、[クイックスタート](https://cli.rexai.top/ja/getting-started/) を試して、今日からメモリをプロジェクトで動かしてください。
