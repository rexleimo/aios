---
title: "v5.16.0：ZCode が AIOS に合流——本物のサブエージェント付き"
description: "AIOS v5.16.0 は ZCode を第一級クライアント化：共有ルート skills、AGENTS.md ネイティブ・コンテキスト、team ルーティング、strict-schema MCP ブリッジ、rex ロールカードのサブエージェント化。"
date: 2026-09-16
tags: ["AIOS", "ZCode", "クライアント", "agents", "MCP", "release", "v5.16.0"]
---

# v5.16.0：ZCode が AIOS に合流——本物のサブエージェント付き

ZCode（Z.AI のデスクトップ・コーディングアプリ）が 9 番目の第一級 AIOS クライアントになった。レジストリ再構築以降のどのクライアントとも同じく、`scripts/lib/clients/core/definitions.mjs` の定義ブロック 1 つ——skills 投影、ネイティブ同期、インターセプター、shell シム、doctor ゲートはすべてそこから導出される。

## 検証は実機で、思い込みなし

機能は機能リストではなく実アプリで確認した。ZCode は共有 `.agents/skills` ルートをネイティブにスキャンするため、AIOS はそこに投影（重複コピーなし）；命令ファイルは AGENTS.md；team ルーティングはバンドル CLI を `--mode yolo` でヘッドレスに起動する。ZCode 0.16.5 に本当に欠けているものは 2 つ：`--model` フラグ（上流が追加するまでモデルルーティングは空）と、プロジェクト・スコープのサブエージェント定義だ。

## サブエージェントはプラグインの扉から

欠けたサブエージェント面は重要だった——ZCode が実際に持つ扉を見つけるまで：plugin の `agents/*.md` ディレクトリは実行可能なサブエージェントとして扱われる（公式 document-skills plugin がその証明）。v5.16.0 は rex ロールカードを `~/.aios/zcode-plugin` 配下の `aios-agents` inline plugin として実体化し、ユーザーレベルの `plugins.dirs` 設定で登録する——GUI のクリックは不要。`doctor:zcode-agents` ゲートは manifest 妥当性、エージェントの乖離、登録状態を報告する。

## strict-schema の罠

ZCode は未知の設定キーを含む MCP サーバーを静かに破棄する。JSON 移行ツールは入れ子になった `mcp.servers` 名前空間を理解し、3 つの AIOS 管理サーバーを ZCode の strict schema に正規化する（`startupTimeoutSec` 秒 → `timeoutMs` ミリ秒、フィールドの許可リスト）。ユーザー所有のサーバーはそのまま通過する。

## 検出を実際に動かすシム

ZCode の CLI はアプリバンドル内にあり、PATH に存在しない。レジストリ駆動のネイティブ・シムとバンドル `zcode.cjs` 用ランチャーが検出とディスパッチを解決——`zcode --version` はシム経由でエンドツーエンド検証済み。

## このリリースのその他

Pi の能力チェーンを修復：`aios-bridge` が Pi へシードされる MCP サーバーに合流；harness に長命の `--transport rpc` ドライバーを追加；`doctor:pi-bridge` ゲート新設；`aios memo checkpoint` は CLI からマイルストーンを固定；Pi のプロジェクト skills は共有 `.agents/skills` ルートへ移行し、旧レイアウトの後片付けも対応。

## アップグレード

`aios init --agent zcode`（または `aios update`）を実行すると、skills 投影・agents plugin 登録・シム導入まで済む。注意：ZCode のヘッドレス実行には一度だけ `zcode login` が必要。変更履歴は英語・中国語・日本語・韓国語の 4 言語で配布。
