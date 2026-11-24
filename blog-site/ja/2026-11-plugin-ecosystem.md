---
title: "v8.2.0：AIOS プラグインを GitHub から 1 コマンドでインストール可能に"
description: "AIOS プラグインは Console ページ、統合、プロバイダ、middleware、クライアント接続、アクション、利用量集計を追加できます。GitHub から直接インストールし、commit に固定。リポジトリのビルドスクリプトは実行しません。"
date: 2026-11-24
tags: ["AIOS", "v8.2.0", "プラグイン", "GitHub", "エコシステム", "リリース"]
---

# v8.2.0：AIOS プラグインを GitHub から 1 コマンドでインストール可能に

プラグインシステムは先にランタイムを届けましたが、正面玄関がありませんでした。
manifest を読んで app の各所へ contribution を投影できた一方、ユーザーには
ガイドも、GitHub の 1 行インストールも、プラグイン提交の道もありませんでした。
今回その隙間を埋めます。

## インストール

プロジェクトルートで実行します：

```bash
aios plugin install github:owner/repo#v1.2.3
```

完全な GitHub HTTPS URL も使えます。`add` はエイリアスです：

```bash
aios plugin add github:owner/repo#v1.2.3
aios plugin install https://github.com/owner/repo
```

AIOS は公開リポジトリを `.aios/plugins/<id>` に clone し、ルートの
`manifest.json` を検証します。tag、ブランチ、SHA は commit に解決され、
detached HEAD で固定された後、`config/plugins.json` に登録されます。

## プラグインが追加できるもの

一つの manifest で次を追加できます：

- sandbox 化された単一 HTML UI を含む Console ページ；
- 既存の固定版統合レジストリを通じた skill/MCP 統合；
- 独立子プロセスが読み込むモデル/プロバイダデータ；
- 境界と timeout を持つゲートウェイ middleware；
- クライアント接続、アクション、利用量集計。

従来のローカル開発形式も引き続き利用できます：

```bash
aios plugin install --id demo-plugin --dir ./plugins/demo
```

## 安全境界

Git インストール中、AIOS はリポジトリの `build`、`prepare`、`install` などの
パッケージスクリプトを**実行しません**。作者はそのまま読み込めるファイルを
同梱します。checkout は commit に固定されるため、後からの push が確認済み
コードを静かに置き換えることはありません。

それでもインストールは信頼判断です。Panel HTML は sandbox iframe、middleware
は timeout と rollback 付きの制限 VM、provider entry はホストと同じ OS 権限を
持つ独立子プロセスで動きます。`permissions` と `contributes` を確認し、release
tag または完全な commit SHA を優先してください。

現在の制限も明確です：公開 GitHub HTTPS リポジトリのみ、manifest はルート必須。
自動更新、マーケット検索、npm/SSH インストールはまだありません。

## 作成と貢献

新しい[プラグインガイド](https://cli.rexai.top/ja/plugins/)には manifest 契約、
ライフサイクルコマンド、実行境界、トラブルシューティング、Pull Request 貢献
手順をまとめました。

コミュニティプラグインの貢献手順：

1. ルート `manifest.json`、README、ライセンス付きのリポジトリを公開；
2. release tag を付け、ローカルと GitHub の両方で検証；
3. リポジトリ、検証済み tag/commit、用途、権限、証拠を表に追加する PR を作成。

コードは自分のリポジトリに残ります。PR は発見可能な一覧と、他の開発者が
コピーできるインストールコマンドを追加します。

## 検証

聚焦インストールテストは 9/9 成功。実際の Windows CLI スモークテストでは、
GitHub 形式の source から一時 Git リポジトリへインストールし、解決した commit、
detached checkout、レジストリ、panel 投影、staging 後始末を確認しました。
独立した基準/仕様レビューは、対象 diff で指摘 0 件でした。

[作者・貢献者ガイド](https://cli.rexai.top/ja/plugins/)を読んで、AIOS に足りて
いなかった拡張を届けましょう。
