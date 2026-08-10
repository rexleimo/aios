---
title: "AIOS Skills インストール体験アップデート: Global/Project スコープとより明確なピッカー"
description: "このアップデートは skills のインストール/アンインストール体験を改善し、canonical source を skill-sources/ に統合し、デフォルトインストールモードをポータブルコピーに切り替え、Node ランタイムベースラインを 22 LTS に標準化しました。"
date: 2026-03-17
tags: [AIOS, Skills, TUI, オンボーディング, AI Development]
---

# AIOS Skills インストール体験アップデート: Global/Project スコープとより明確なピッカー

このイテレーションは2つの実用的な問題に集中しました:

1. すべてのスキルがすべてのプロジェクトにデフォルトで表示するべきではありません。特に強力なビジネス的またはレポ固有の意味論を持つスキルについてはそうです。
2. 「スキルソースファイル」と「インストール済みスキルターゲット」を同じディレクトリツリーに混在させると、跨マシン・跨プロジェクトの同期が維持困難になります。

これらを解決するために、AIOS は skills のライフサイクル（インストール/アンインストール/同期）を整理し、以下の境界を明確化しました:

- システムコア機能
- オプション拡張
- canonical source tree
- 生成された互換出力

## Canonical Source Tree が `skill-sources/` に移動

canonical skill オーサリングソースは `.codex/skills` や `.claude/skills` ではなくなりました。

新しい契約:

- `skill-sources/` が canonical source tree
- `.codex/skills`、`.claude/skills`、`.agents/skills`、`.gemini/skills`、`.opencode/skills` が生成された互換ツリー
- repo-local 互換ツリーは `node scripts/sync-skills.mjs` で書き込み/更新

つまり: マシン間/プロジェクト間で skills をコピーする場合、特定クライアントディレクトリではなく `skill-sources/` を信頼の源として扱ってください。

さらに、`node scripts/check-skills-sync.mjs` がリリースプレフライトの一部になり、生成出力が canonical source tree から密かにずれることを防ぎます。

## Global vs Project スコープインストール

Skills インストールはようになりました明示的なスコープ選択をサポート:

- `global`: ユーザー単位ディレクトリにインストール（例: `~/.codex/skills`）
- `project`: 現在のレポジトリディレクトリにインストール（現在の `pwd`）

これにより、汎用方法論スキルをグローバルに保ちながら、強くビジネス/レポ結合したスキルを単一プロジェクトにスコープできます。

## カタログ駆動インストール（「すべてをスキャンしてインストール」ではなく）

インストールはディレクトリ下で見つかったものすべてではなく、精選されたカタログで駆動されるようになりました。

実用的な結果:

- 偶発的なツール汚染が減少
- TUI での「何が、なぜインストールされているか」の可視性が明確に
- 新規プロジェクトオンボーディング時のより安全なデフォルト

## 関連リンク

- ドキュメント: `/superpowers/`
- レポ: <https://github.com/rexleimo/aios>

## 関連ドキュメント

- [クイックスタート](https://cli.rexai.top/ja/getting-started/)
- [Quick Start](https://cli.rexai.top/ja/getting-started/) — 30 秒で AIOS をインストール
- [Workflow Policy](https://cli.rexai.top/ja/workflow-policy/) — direct / guarded / planned ルート
