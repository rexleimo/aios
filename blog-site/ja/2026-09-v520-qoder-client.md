---
title: "v5.20.0：Qoder が AIOS に合流——10 番目のクライアント、定義ブロック 1 つ"
description: "AIOS v5.20.0 は Qoder を 10 番目の第一級クライアント化する：`.qoder/skills` 投影、Qoder が実際に読む settings.json への MCP 設定、AGENTS.md ネイティブ・コンテキスト、`-p` ヘッドレス team 実行。"
date: 2026-09-19
tags: ["AIOS", "Qoder", "クライアント", "agents", "MCP", "release", "v5.20.0"]
---

# v5.20.0：Qoder が AIOS に合流——10 番目のクライアント、定義ブロック 1 つ

Qoder（Alibaba の AI IDE、コーディング・エージェント CLI を伴う）が 10 番目の第一級 AIOS クライアントになった。codex、claude、gemini、opencode、hermes、grok、workbuddy、pi、zcode と並び立ち、レジストリ再構築以降のどのクライアントとも同じく `scripts/lib/clients/core/definitions.mjs` の定義ブロック 1 つ——skills 投影、ネイティブ同期、MCP 配置先、shell シム、doctor ゲートはすべてそこから導出される。

## 検証は実機で、思い込みなし

機能は機能リストではなく、Qoder が実際に読むもので確認した。skills は SKILL.md の markdown ディレクトリ形式で `.qoder/skills/` に同期される（ユーザーレベルは `~/.qoder/skills/`）——これが Qoder の権威ある読み込み面。共有 `.agents/skills` プロジェクトルートには従来どおり AIOS のミラーが置かれるが、Qoder によるスキャンは検証できていないので、どの機能もそれに依存しない。命令ファイルは AGENTS.md——AIOS の管理ブロックをそこに書くと Qoder が読み込む；QODER.md は受理されるエイリアスだが、AIOS は意図的に書かない。両ディストリビューションに対応する：国際版は CLI が `qoder` でホームが `~/.qoder`、中国国内版は `qoderclicn` でホームが `~/.qoder-cn`。

## Qoder が実際に読むファイルへ MCP

移行ツールは AIOS 管理サーバーを Qoder の実設定ファイルへ投影する——ユーザーレベル `~/.qoder/settings.json` とプロジェクトレベル `.qoder/settings.json`、どちらもトップレベルの `mcpServers` JSON 名前空間。remote HTTP MCP は Qoder 自身の CLI CRUD（`qoder mcp add --scope user|local|project --transport stdio|sse|http|ws`）で登録し、検証済みの証拠を取れて初めて登録済みとして報告する。gitignore される `settings.local.json` スコープは実在するが、AIOS は触らない。

## team と harness のためにヘッドレスで

`aios init --agent qoder` でセットアップが済み、自動検出はヒントなしに CLI を見つける。team と harness の spawn ルーティングは `-p` print モードで Qoder をヘッドレスに起動し、無人実行は `--yolo`、結果の解析は `--output-format`（フラグは公式 CLI ドキュメント由来）。doctor とホスト能力レポートは Qoder を zcode と同じ L2（MCP プロキシ）に置く——インターセプトと投影には十分、そして制約もそのまま記録する：Qoder にはホスト hook が存在するが AIOS init はまだ注入せず、ターン圧縮も主張しない。

## モデルルーティングは own

モデルルーティングは `own`。Qoder のモデルはアカウントに紐づき、`/model` で対話的に選ぶ。検証済みのヘッドレス `--model` は存在しないので、AIOS はエンドポイントを中継しない——zcode、grok、workbuddy と同じ正直な状態であり、レジストリには経路を捏造せず空のまま記録される。

## アップグレード

`aios init --agent qoder`（または `aios init --all`、`aios update`）を実行すれば、skills 投影・MCP 設定の移行・AGENTS.md の管理ブロック書き込みまで済む。あとは Qoder を再起動——すでに動いているセッションでは `/mcp reload` で MCP の変更が反映される。変更履歴は英語・中国語・日本語・韓国語の 4 言語で配布。
