---
title: "v5.9.0 メモリシステムの全クライアント活性化：正規トリガーからプロンプト駆動へ"
description: "AIOS v5.9.0 がメモリ活性化を決定論的エントリとプロンプト契約へ移行した方法：セッション開始時の自動登録、aios-memory MCP の 3 ツール、5 クライアントへの契約投影、Codex 起動プロンプトの根本修正。"
date: 2026-09-02
tags: ["AIOS", "メモリ", "MCP", "Codex", "release"]
---

# v5.9.0 メモリシステムの全クライアント活性化：正規トリガーからプロンプト駆動へ

> **要点：** v5.9.0 はメモリ活性化を正規表現の推測から 3 つの決定論的エントリへ移行した——セッション開始時の ContextDB 自動登録、`aios-memory` MCP server（recall / write / checkpoint）、5 クライアントへの Memory Trigger Contract 投影。Codex 起動プロンプト（trust 永続化ファイル未書き込み）も根本修正し、Gemini の deprecated を解除。7 クライアント × 5 MCP すべてグリーン。

## なぜこのリリースか

メモリのトリガー層が正規表現で構築されている問題を発見——正規表現は LLM にツールへの本当の理解を与えられず、効果は不十分でした。正規層を削除した後、真の問題が顕在化：**トリガーポイントがプロンプト層の明示的位置に移っていなかった**ため、メモリシステムが「無効に見える」状態でした。

v5.9.0 はこのリファクタリングを完了させました：**決定論的データ面（hook/プラグイン自動注入）＋意味面（プロンプトでトリガーポイントを宣言）＋ MCP ツール面（hook なしクライアントの決定論的入口）**。

## 主な変更

- **セッションライフサイクルとメモリの接続**：`aios session start` が ContextDB セッションを登録（冪等、`--session-id/--agent/--client`）、前回の handoff と pinned memo を即座に引き継ぎ。
- **`aios-memory` MCP server**：`memory_recall`（統合検索）、`memory_write`（確認なしで memo 保存）、`memory_checkpoint`（pinned 面へチェックポイント）。Gemini / Hermes / WorkBuddy など hook なしクライアントの決定論的入口。
- **OpenCode プラグイン + hook フルカバレッジ**：Claude 双 hook、Codex/Grok UserPromptSubmit をランタイム検証済み。OpenCode はプラグイン経由で既存パイプラインによる毎ターン召回を注入（TUI）。
- **Memory Trigger Contract を 5 クライアントに投影**：新セッションで先に recall、続行時に recall、検証済み結論は即 write、完了前に checkpoint。トリガーポイントは契約で宣言し、関連性判断は LLM に委ねる。
- **Codex プロンプトの根本修正**：codex 0.148+ は hooks/プロジェクト信頼を `~/.codex/config.toml` に永続化しますが、AIOS は書いていなかった → 毎回起動時に再プロンプト。インストーラが管理領域（trust + 5 MCP）を書き込み、冪等かつユーザー内容を保持。更新でも再発しません。
- **Gemini の完全サポート復活**：上流は Antigravity へ移行しましたが、全クライアント一貫サポートの約束に基づき deprecated を解除し、メモリ/投影/スキル同期をフル接続。

## アップグレード注意

- `aios session start --json` の出力形式が裸配列から `{ registration, lines }` に変更。
- `opencode run`（ヘッドレス）はプロジェクトプラグインを読み込みません（上流の仕様）。TUI は影響なし。
- Codex ユーザーはアップグレード後に最後一度信頼プロンプトが表示される可能性——一度受け入れると永続化されます。

## 検証

セッション登録ユニットテスト 5/5、codex config テスト 5/5、MCP スモーク 4/4、クライアント回帰 47 pass / 0 fail。turn-recall は 3 クライアントで実弾検証、実機 E2E は冪等 reused をバイト単位で確認。
