---
title: "AIOS アップデート: Windows ネイティブサポート + ライブコスト追跡"
description: "AIOS は完全な Windows ワークフロー、ライブ API コストテレメトリ、OpenCode Agent 統合など主要なアップデートをもたらし、より透過的な AI 開発を可能にします。"
date: 2026-03-16
tags: [AIOS, Windows, Cost Tracking, OpenCode, AI Development]
---

# AIOS アップデート: Windows ネイティブサポート + ライブコスト追跡

このアップデートは AI 支援開発をより信頼性が高く透過的にする複数の改善を届けます。

## Windows ネイティブワークフローサポート

AIOS は 이제 Windows ワークフローをエンドツーエンドでサポートしています。Windows 固有のパス処理やコマンドライン引数分割の問題に対処し、Windows 開発者も同じワークフローをスムーズに使えるようにしました。

主な改善点:

- ネイティブ Windows パス処理（例: `C:\Users\...`）
- cmd ベースラッパーでのより安全な起動動作
- Windows での Codex 引数分割問題のリスク軽減
- 非 git ワークスペースでのグレースフルデグラデーションサポート

関連ドキュメント: [Windows ガイド](/ja/windows-guide/)

## ライブコスト追跡（コストテレメトリ）

ライブコストテレメトリはリアルタイムで API 使用コストを把握するのに役立ちます。長時間タスク中、AIOS は以下を追跡・表示できます:

- トークン使用量
- コストサマリー
- 予算管理
- 予算閾値超過時の警告

`aios orchestrate` 実行時にコストテレメトリを確認できます。

## OpenCode Agent サポート

AIOS は OpenCode Agent サポートを統合し、以下を可能にします:

- OpenCode の agent エコシステムを活用
- より柔軟なオーケストレーションとディスパッチ戦略を実行

## 関連リンク

- ドキュメント: `/getting-started/`
- レポ: <https://github.com/rexleimo/aios>
