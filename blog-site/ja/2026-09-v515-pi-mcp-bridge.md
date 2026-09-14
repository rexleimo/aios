---
title: "v5.15.0：Pi が本物の MCP 能力を獲得"
description: "AIOS v5.15.0 は Pi 拡張に読み取り専用の aios_codemap_search を追加し、install 時に AIOS 管理の MCP サーバーを Pi へブリッジし、skills doctor の旧レイアウト警告に安全なクリーンアップを対応させた。"
date: 2026-09-14
tags: ["AIOS", "Pi", "MCP", "codemap", "release", "v5.15.0"]
---

# v5.15.0：Pi が本物の MCP 能力を獲得

v5.14.0 で Pi は AIOS の第一級クライアントになったが、ひとつ穴が残っていた。Pi コアには MCP 面がなく、他クライアントが MCP 経由で得ていた構造コード・メモリ系ツールが Pi からは見えなかったのだ。v5.15.0 はこれを塞ぎ、残った小さな論点も同時に片付ける。

## Pi 拡張内蔵の codemap 検索

Pi 拡張に読み取り専用の `aios_codemap_search` を追加。全クライアント共通の `search --source code` 経路を再利用しており、Pi エージェントは編集前にファイル・シンボル・呼び出し元を引ける。install/update で自動的にユーザー側へ届き、追加手順は不要。

## MCP ブリッジ：Pi グローバル mcp.json へサーバーを播種

`aios init --agent pi` は、pinned の MCP-client アダプター拡張をインストールし、AIOS 管理サーバー（`code-review-graph` を優先、プロジェクトルート既知ならセッション追従の `aios-memory` を追加）を Pi グローバルの `mcp.json` に書き込む。安全規則はプロンプトではなくマージ処理そのものが強制する：

- ユーザーが編集したサーバーは絶対に上書きしない — 保持したうえで名前を報告;
- 不正な JSON の `mcp.json` に対しては fail-closed（書き換えない）;
- ネットワーク失敗は警告へ降格 — オフライン機でも拡張とプロジェクト側 `.mcp.json` 経路は残る。

## doctor 警告と対になるクリーンアップ

skills doctor は旧レイアウトの残骸（AIOS 管理 skill が共有 `~/.agents/skills` に書かれ、Pi で同名スキャン衝突を起こす）を警告していた。v5.15.0 に対になる `removeLegacySharedRootInstalls` を追加。AIOS の `managedBy` メタデータを持つディレクトリのみ削除し、ユーザー自有 skill には触れない。dry-run なら「何を消すか」を列出するだけでdisk には書かない。

## アップグレード

`aios init --agent pi`（または `aios update`）の再実行でアダプターと播種済みサーバーが有効になる。v5.15.0 の release assets からインストーラーを取得可能。変更ログは日英中韓の 4 言語で提供。
