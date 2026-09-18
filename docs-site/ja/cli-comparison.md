---
title: CLI 比較
description: "素の Codex / Claude / Gemini CLI ワークフローと AIOS オーケストレーション層の実際の違いを比較します。素の CLI では記憶、ルーティング、検証を自分で管理する必要がありますが、AIOS ではやりたいことを一文で伝えれば、記憶、分担、証拠、検証までを担い、確認できる成果として返します。"
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

## サポート済みクライアント

現時点で 9 クライアント。下表はレジストリが実際に公開している能力マトリクスです。出典は `scripts/lib/clients/core/definitions.mjs`。自分のインストールは推測せず `aios doctor --native --verbose` で確認してください。

| クライアント | コマンド | skills | native | harness | agents | team | 指示ファイル | プロジェクトスキルルート |
|---|---|---|---|---|---|---|---|---|
| Codex CLI | `codex` | ✓ | ✓ | ✓ | ✓ | ✓ | `AGENTS.md` | `.codex/skills` |
| Claude Code | `claude` | ✓ | ✓ | ✓ | ✓ | ✓ | `CLAUDE.md` | `.claude/skills` |
| Gemini CLI | `gemini` | ✓ | ✓ | ✓ | — | ✓ | `GEMINI.md` | `.gemini/skills` |
| OpenCode | `opencode` | ✓ | ✓ | ✓ | ✓ | ✓ | `AGENTS.md` | `.opencode/skills` |
| Hermes | `hermes` | ✓ | ✓ | ✓ | — | — | `AGENTS.md` | `.hermes/skills` |
| Grok Build | `grok` | ✓ | ✓ | ✓ | ✓ | ✓ | `AGENTS.md` | `.grok/skills` |
| WorkBuddy | `codebuddy` | ✓ | ✓ | ✓ | — | — | `AGENTS.md` | `.workbuddy/skills` |
| Pi | `pi` | ✓ | ✓ | ✓ | — | ✓ | `AGENTS.md` | `.agents/skills`（共用ルート） |
| ZCode | `zcode` | ✓ | ✓ | ✓ | plugin | ✓ | `AGENTS.md` | `.agents/skills`（共用ルート） |

列の意味：**skills** = クライアントのスキルルートへ投影されるスキルパック · **native** = ネイティブ指示ファイルを書き込む · **harness** = solo-harness での駆動 · **agents** = プロジェクト範囲のサブエージェント定義 · **team** = `aios team` による並列ディスパッチ。

3 つの行には注記が要ります：

- **ZCode の `agents` は欠けではありません。** ZCode 0.16.5 にはプロジェクト範囲のサブエージェント定義面がないため、AIOS は rex ロールカードを `~/.aios/zcode-plugin` 配下の `aios-agents` インラインプラグインとして実体化し、ユーザーレベルの `plugins.dirs` に登録します。`doctor:zcode-agents` が manifest 妥当性・agent ドリフト・登録状態を報告します。ZCode には `--model` フラグがないのでモデルルーティングは空のまま、headless 実行は初回だけ `zcode login` が必要です。
- **Pi と ZCode は `.agents/skills` ルートを共有します。** 私有のコピーを二重に作る代わりに、アップグレード時に古いコピーの対応するクリーンアップを行います。
- **Pi の `agents` は上流の境界、`team` は検証済み。** Pi は「意図的に内蔵 MCP・サブエージェント・権限ポップアップ・plan mode を持たない」設計で、サブエージェント起動は拡張として足すものなので、AIOS が rex ロールカードを落とし込むプロジェクト範囲の面が存在しません（AIOS ツールは config 移行ではなく `aios-bridge` MCP server と Pi 拡張経由で Pi に届きます）。`team` にはそうした面が不要です：チームワーカーは他プロバイダと同じ spawn 経路を流れる headless `pi -p` サブプロセスにすぎず、実際の `aios team --provider pi --live` バッチで検証済みです（planning フェーズが最初から最後まで完了し、implement ワーカーは対象ファイルを生成）。オフラインでは `scripts/tests/team-pi-worker.test.mjs` が回帰をガードします。下表は「不可能」ではなく「検証済み」として読み、実際の状態は `aios doctor --native --verbose` が見せてくれます。

単一クライアントだけ投影するなら `aios init --agent <client>`（例：`aios init --agent zcode`）、全件なら `--agent all` です。

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
