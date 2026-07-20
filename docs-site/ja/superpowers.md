---
title: Rex ワークフロー移行
description: 廃止された Superpowers ワークフローから Rex-only AIOS ワークフローへ安全に移行します。
---

# Rex ワークフロー移行

新しい AIOS インストールと管理されたワークフロー投影では、`rex-harness` が唯一の既定ソフトウェアエンジニアリングワークフローです。Superpowers は AIOS のインストールコンポーネントおよびワークフローから廃止されました。既存の `/superpowers/` URL はこの移行ガイドとして維持され、古いワークフローを教える代わりに現在の動作を説明します。

## 変更内容

Rex はソフトウェアエンジニアリングの制御ループ、すなわち Facts、Capability 選択、Workflow Activation、Command、Evidence Contract、復旧状態を所有します。AIOS は Rex 制御面の周囲で、ホストルーティング、クライアント投影、ContextDB、安全チェック、team 実行、長時間 harness を提供します。

新規インストールは Codex、Claude、Gemini、OpenCode、Hermes、Grok 用の Rex 投影を使用し、対応クライアントでは共有 `.agents` 投影も使用します。有効化できる Superpowers TUI オプションや独立した Superpowers ワークフローはありません。

## 安全なアップグレード動作

通常どおり更新を実行します。

```bash
aios update
```

通常の更新は Rex-only ワークフローをインストールして収束させます。AIOS の所有証明がない履歴上の Superpowers 投影は保持され、conflict として報告されます。この fail-closed な既定値により、AIOS は名前が旧投影に似ているだけのユーザー管理パスを削除しません。

## 明示的な旧投影の清掃

AIOS に正確に認識された旧 Superpowers 投影を採用して削除させる場合は、まず結果を確認し、その後で明示的な清掃を実行します。

```bash
aios update --adopt-legacy-superpowers --dry-run
aios update --adopt-legacy-superpowers
```

`aios update` を使わずに更新する場合も、同じ opt-in を利用できます。

```bash
aios init --all --adopt-legacy-superpowers
aios setup --adopt-legacy-superpowers
```

明示的な採用は、Codex、Claude、Gemini、OpenCode、Hermes、Grok、および共有 `.agents` 投影にある、認識済みの AIOS 旧リンクを対象にします。未知、変更済み、またはユーザー所有を証明できないパスは削除しません。所有権を確認した後、報告された conflict を手動で解決してください。

## 移行の確認

```bash
aios doctor --native --verbose
```

doctor の出力にはクライアント投影とワークフロー診断が表示されます。ソースからインストールした場合は、同梱の `rex-harness` submodule も利用可能であることを確認してください。

```bash
git submodule update --init --recursive -- rex-harness
```

## 関連ドキュメント

- [ワークフローポリシー](workflow-policy.md) - 現在の Rex Command の周囲で `direct`、`guarded`、`planned` のホストルーティングを選びます。
- [クイックスタート](getting-started.md) - AIOS をインストールして初期化します。
- [変更履歴](changelog.md) - リリース単位の移行情報です。
