---
title: "Windows CLI 起動安定性: クロス CLI 信頼性チェーンを守る"
description: "Windows cmd ランチャーの修正が ContextDB の継続性、wrapper policy、Codex・Claude・Gemini の起動を守る仕組みを説明します。"
date: 2026-03-20
tags: ["Windows", "CLI reliability", "ContextDB", "Codex", "Claude"]
---

# AIOS Windows アップデート: 単なる「起動修正」ではなく、クロス CLI 信頼性チェーン全体の強化

このアップデートは一般的な Windows Tips ではなく、AIOS のコアアーキテクチャに直結しています。

## 先に結論

AIOS には相互に連動する 3 層があります。

1. ブリッジ層: `contextdb-shell-bridge.mjs` が wrap / passthrough を判定
2. セッション層: `ctx-agent` が ContextDB セッションコンテキストを注入/再利用
3. 実行層: ネイティブ CLI（`codex` / `claude` / `gemini`）は従来通り実行

Windows の cmd ランチャ周りの修正は 1 層目に入っていますが、実際にはこのチェーン全体を保護します。

## なぜ AIOS 特有の問題なのか

AIOS が無ければ、`.cmd` 起動の問題は「CLI の起動失敗」で終わりがちです。

しかし AIOS では、同じ問題が次を壊します。

- コンテキスト継続（`session -> context:pack -> inject`）
- ラッパーポリシーの挙動（`repo-only` / `opt-in` / `all`）
- 安定したエントリを前提とする orchestrate フロー

つまり単なるシェルの小技ではなく、クロス CLI ワークフロー契約そのものの保護です。

## 何が変わったか

共有のプロセスランチャ + `contextdb-shell-bridge` の経路で、Windows の cmd ベース起動が安全になりました。

- npm/cmd ランチャ解決がより堅牢
- ラッパーのエントリ解決に失敗した場合でも、安全なシェル挙動でフォールバック
- 可能ならネイティブ実行ファイルを優先

Codex / Claude / Gemini のラッパー起動パスをカバーしています。

## 60 秒で再現/確認

最新 `main` を取得してターミナルを再起動し、次を実行します。

```bash
codex
```

続いてブリッジ経路の診断を確認します。

```bash
export CTXDB_DEBUG=1
codex
```

期待する結果:

- cmd ラッパーのエッジケースでも起動が落ちない
- ブリッジが wrap / passthrough を正しく判定できる
- 日常コマンドを変えずにコンテキスト運用が維持できる

## エンドツーエンドの価値（AIOS 視点）

この修正が守るチェーン:

`shell wrapper -> contextdb-shell-bridge -> ctx-agent -> contextdb -> native CLI`

Windows で 1 つでも切れると「クロス CLI + 記憶」の約束が破綻します。今回のアップデートはそのリンクを強化します。

## FAQ

### コマンドは変える必要がある？

ありません。`codex` / `claude` / `gemini` を従来通り使えます。

### これは起動だけの問題？

いいえ。起動層の修正ですが、AIOS では wrap とセッション注入がその経路に依存するため、ワークフロー全体に影響します。

### トークン使用量は変わる？

モデルポリシーの変更は直接ありません。プロセス信頼性とラッパー挙動の改善です。

## 公式ドキュメント

現在のセットアップと復旧手順は [Windows Guide](https://cli.rexai.top/ja/windows-guide/)、[Getting Started](https://cli.rexai.top/ja/getting-started/)、[ContextDB](https://cli.rexai.top/ja/contextdb/)、[Troubleshooting](https://cli.rexai.top/ja/troubleshooting/)を参照してください。
