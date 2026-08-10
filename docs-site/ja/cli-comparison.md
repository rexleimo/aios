---
title: CLI 比較
description: 生 Codex/Claude/Gemini CLI ワークフローと AIOS オーケストレーション層を比較。
---

# 生 CLI vs AIOS 層

> **Quick Answer:** 一回限りで低リスクの作業には `codex`、`claude`、`gemini`、`opencode` の素の CLI を使います。セッションをまたぐ記憶、ワークフロールーティング、複数クライアントの handoff、ブラウザ安全性、検証証拠が必要なら AIOS を追加します。これは coding agent を置き換えないローカル層です。

## 判断の早見表

| 必要なもの | 推奨パス |
| --- | --- |
| 永続状態のない短いタスク | 素の CLI |
| 共有プロジェクトメモリと検索可能なコンテキスト | AIOS + ContextDB |
| 複数クライアントまたは Agent Team | AIOS + Agent Team |
| 編集安全性と完了証拠 | AIOS + 編集/検証ゲート |

AIOS は Codex、Claude、Gemini CLI の代替ではありません。
それはその上の信頼性レイヤーです。

[GitHub で Star](https://github.com/rexleimo/aios?utm_source=cli_rexai_top&utm_medium=docs&utm_campaign=english_growth&utm_content=comparison_hero_star){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="comparison_hero" data-rex-target="github_star" }
[クイックスタート](getting-started.md){ .md-button data-rex-track="cta_click" data-rex-location="comparison_hero" data-rex-target="quick_start" }
[ケース集](case-library.md){ .md-button data-rex-track="cta_click" data-rex-location="comparison_hero" data-rex-target="case_library" }

## AIOS で何が変わるか

| ワークフロー要件 | 生 CLI のみ | AIOS 層あり |
|---|---|---|
| クロスセッション記憶 | 手動コピー/ペーストコンテキスト | プロジェクト ContextDB によるデフォルト再開 |
| クロス agent handoff | 其那的で脆弱 | 共有 session/checkpoint アーティファクト |
| ブラウザ自動化 | ツール別のセットアップドリフト | 統一 MCP インストール + doctor スクリプト |
| 機密設定読み取り安全性 | プロンプトへのシークレット漏出が容易 | Privacy Guard リダクション経路 |
| 操作回復 | 手動トラブルシューティング | Doctor スクリプト + 再現可能な runbook |

## 生 CLI のみを使う場合

- handoff がない一回限りの短いタスクが必要な場合。
- セッション永続性やワークフロー追跡可能性が不要な場合。
- 使い捨て環境で実験している場合。

## AIOS を追加する場合

- 同じプロジェクトで `codex`、`claude`、`gemini`、`opencode`、`hermes`、`grok` を切り替える場合。
- 再起動安全なコンテキストと監査可能な checkpoint を必要とする場合。
- ブラウザ自動化と認証壁処理、明示的な human handoff を必要とする場合。
- 設定読み取り中の偶発的なシークレット露出を減らす必要がある場合。

## 素早い証明（5 分）

```bash
git clone https://github.com/rexleimo/aios.git
cd aios
scripts/setup-all.sh --components all --mode opt-in
source ~/.zshrc
codex
```

次に永続化アーティファクトが存在することを確認：

```bash
ls .aios/context-db
```

期待値：`sessions/`、`index/`、`exports/`。

## ディープダイブケース

- [ケース：クロス CLI handoff](case-cross-cli-handoff.md)
- [ケース：ブラウザ認証壁フロー](case-auth-wall-browser.md)
- [ケース：Privacy Guard 設定読み取り](case-privacy-guard.md)

## 次のアクション

[GitHub で Star](https://github.com/rexleimo/aios?utm_source=cli_rexai_top&utm_medium=docs&utm_campaign=english_growth&utm_content=comparison_footer_star){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="comparison_footer" data-rex-target="github_star" }

## FAQ

### AIOS は coding agent を置き換えますか？

いいえ。対応クライアントの周囲にローカルのワークフロー、メモリ、検証層を追加します。

### 素の CLI がよい場合はありますか？

あります。小さく、状態を持たず、低リスクで、追加のコンテキストが結果を改善しない場合は素の CLI が簡潔です。

## 正規ドキュメント

現在の仕様は[ワークフローポリシー](workflow-policy.md)、[ContextDB](contextdb.md)、[クイックスタート](getting-started.md)を参照してください。
