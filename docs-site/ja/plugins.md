---
title: AIOS プラグイン——GitHub からインストール、作成、貢献
description: "AIOS プラグインを GitHub から 1 コマンドでインストールし、ライフサイクルを管理し、manifest を作成し、信頼境界を理解して、Pull Request でコミュニティに貢献する方法。"
---

# AIOS プラグイン——GitHub からインストール、作成、貢献

> **結論：** プロジェクトルートで `aios plugin install github:owner/repo#v1.2.3` を実行します。AIOS は公開リポジトリを `.aios/plugins/<id>` に clone し、ルートの `manifest.json` を検証し、解決した commit に固定して `config/plugins.json` に登録します。`aios plugin add` はエイリアスです。

## プラグインが追加できるもの

AIOS プラグインはルートに `manifest.json` を持つディレクトリです。`contributes` で次を追加できます：

| contribution | 追加内容 |
| --- | --- |
| `panels` | Console ナビゲーション。単一 HTML の sandbox UI も可 |
| `integrations` | 既存の統合レジストリを通じた skill/MCP 統合 |
| `providers` | 独立子プロセスが stdio JSON-RPC で読み込むモデル/プロバイダデータ |
| `middleware` | 制限付き Node VM で動くゲートウェイ要求フック |
| `clients` | 既存 connect システムを再利用するクライアント接続宣言 |
| `actions` | 宣言的なアクション/ツール |
| `onUsage` | ゲートウェイ利用量の集計 |

## GitHub からインストール

### 前提条件

- 拡張する**プロジェクトルート**で実行します。
- Git が `PATH` にあります。
- リポジトリは公開で、ルートに `manifest.json` があります。
- そのまま読み込めるファイルを同梱します。AIOS は `build`、`prepare`、`install` などのパッケージスクリプトを**実行しません**。

### 1 コマンドでインストール

```bash
# 既定ブランチ。インストール時に解決して固定
aios plugin install github:acme/demo

# tag、ブランチ、完全な commit SHA
aios plugin install github:acme/demo#v1.2.3
aios plugin install --ref main github:acme/demo

# DSH 風のエイリアス
aios plugin add github:acme/demo#v1.2.3

# 通常の GitHub HTTPS URL も利用可能
aios plugin install https://github.com/acme/demo
```

JSON 結果には plugin id、正規化された source、解決した commit、manifest パス、適用した contribution が含まれます：

```json
{
  "ok": true,
  "id": "demo-plugin",
  "source": "github:acme/demo#v1.2.3",
  "commit": "1111111111111111111111111111111111111111",
  "manifest": ".aios/plugins/demo-plugin"
}
```

checkout は detached HEAD で固定されます。後からブランチや tag へ push しても、インストール済みファイルは静かに変わりません。

### ローカルプラグインをインストール

既存のローカル形式も引き続き使えます：

```bash
aios plugin install --id demo-plugin --dir ./plugins/demo
```

プラグイン開発や、AIOS リポジトリのサブディレクトリに manifest を持つ `examples/hello-plugin` に適しています。

## インストール済みプラグインを管理

| コマンド | 目的 |
| --- | --- |
| `aios plugin list --json` | 登録済みプラグインと manifest パスを表示 |
| `aios plugin disable <id>` | インストールを保持し、contribution を撤回 |
| `aios plugin enable <id>` | contribution を再適用 |
| `aios plugin remove <id>` | 登録を解除し、投影を撤回 |
| `aios plugin providers --json` | 組み込みとプラグインの provider を照会 |
| `aios plugin models --json` | 組み込みとプラグインのモデルを照会 |

GitHub インストールの書き込み先：

```text
<project>/
├── config/plugins.json                 # ライフサイクル・レジストリ
└── .aios/plugins/<plugin-id>/          # commit 固定の checkout
```

`remove` はソースディレクトリを削除しません。クリーンに再インストールする場合は、remove 後に `.aios/plugins/<plugin-id>` を削除してから再実行してください。

## プラグインを作成する

### 最小 manifest

```json
{
  "schemaVersion": 1,
  "id": "demo-plugin",
  "version": "1.0.0",
  "permissions": ["panel"],
  "lifecycle": {
    "install": "automatic",
    "upgrade": "manual",
    "disable": "toggle",
    "remove": "clean"
  },
  "contributes": {
    "panels": [
      {
        "id": "demo",
        "href": "/demo",
        "label": "Demo",
        "title": "Demo plugin",
        "ui": { "entry": "panel.html" }
      }
    ]
  }
}
```

ルール：

- `id` は小文字で `^[a-z][a-z0-9._-]*$` に一致します。
- `version` は `1.2.3` や `1.2.3-beta.1` のような SemVer 形式です。
- `ui.entry` はプラグイン内の相対 `.html` パスで、最大 256 KiB です。
- provider の `entry` はプラグインディレクトリからの相対パスです。
- integration は既存の pinned-commit と sha256 検証を通ります。

### 実行モデルと信頼境界

| surface | 実行モデル | 信頼上の注意 |
| --- | --- | --- |
| manifest と panel データ | ホストが読んで投影 | 外部インストールスクリプトは実行しない |
| Panel HTML | `iframe sandbox="allow-scripts"` | ホスト DOM、Cookie、API への same-origin アクセスなし |
| Middleware | 制限付き Node VM、timeout、clone/rollback、fail-open | 硬隔離ではないため、信頼できるフックのみ |
| Provider entry | 独立 Node 子プロセス、stdio JSON-RPC | ホストと同じ OS 権限でプラグインコードを実行 |

インストールは信頼判断です。tag または完全な commit SHA を使い、`permissions` と `contributes`、provider/middleware のコードを確認してください。

## Pull Request で貢献する

中央マーケットはまだありませんが、コミュニティプラグインの PR は歓迎します。

1. ルート `manifest.json`、README、ライセンス付きでリポジトリを公開します。
2. release tag を付け、ローカルと GitHub の両方でインストールを検証します。
3. 下の表に次を記した行を追加する PR を出します：
   - プラグイン名とリポジトリ URL；
   - 検証した tag または commit；
   - 一文の用途；
   - 必要な権限；
   - インストール/テスト証拠。
4. プラグインは引き続き GitHub から直接インストールします。一覧 PR でコードを AIOS リポジトリへ移す必要はありません。

[プラグインガイドの編集ページ](https://github.com/rexleimo/aios/edit/main/docs-site/ja/plugins.md)から始めるか、[issue](https://github.com/rexleimo/aios/issues) を開いてください。

### コミュニティプラグイン

| プラグイン | source | install |
| --- | --- | --- |
| 公式 `hello-plugin` サンプル | [AIOS repository](https://github.com/rexleimo/aios/tree/main/examples/hello-plugin) | AIOS checkout 内で `aios plugin install --id hello-plugin --dir examples/hello-plugin` |
| あなたのプラグイン | PR welcome | `aios plugin install github:owner/repo#tag` |

## トラブルシューティング

| 症状 | 原因 | 対処 |
| --- | --- | --- |
| `GitHub source must name owner/repo` | 不正な簡略形式または URL パス | `github:owner/repo` か `https://github.com/owner/repo` を使う |
| `git clone failed` | Git なし、ネットワーク/プロキシ、非公開リポジトリ | Git を入れ、接続を確認し、公開リポジトリを使う |
| `plugin manifest ... is not valid JSON or missing` | ルートに `manifest.json` がない | ルートに正当な manifest を追加 |
| `manifest id ... != requested ...` | `--id` が manifest と不一致 | `--id` を省略するか manifest id を使う |
| `plugin target already exists` | 古い checkout が残存 | remove 後に `.aios/plugins/<id>` を削除して再インストール |
| `plugin ... already installed` | id が登録済み | 無効化、または remove してから再インストール |
| TypeScript プラグインが読まれない | Git インストールではビルドしない | 読み込み可能な JS を commit するかビルド済みファイルを配布 |

## 現在の制限

- 公開 GitHub HTTPS リポジトリのみ。SSH、非公開、npm パッケージ、埋め込み認証情報は非対応。
- 自動更新、マーケット検索、署名レジストリはまだありません。
- manifest はリポジトリルート必須です。
- AIOS はリポジトリのビルドスクリプトを許可・実行しません。

## 次のステップ

- [リリースブログ：GitHub プラグインを 1 コマンドで](https://cli.rexai.top/blog/ja/2026-11-plugin-ecosystem/)
- [サードパーティ統合](integrations.md)——固定版 skill/MCP の管理。
- [Model Router](model-router.md)——モデルプロバイダ間のルーティング。
- [Architecture](architecture.md)——AIOS ランタイムにおけるプラグインの位置。
