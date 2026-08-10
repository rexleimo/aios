---
title: "ContextDB レイジーロード: 5秒の起動からエージェント自律発見へ"
description: "起動時の完全パック注入を廃止し、50ms未満のファサード読み込み、バックグラウンド非同期ブートストラップ、ランタイムトリガーオーケストレーションにより、エージェントが必要な時にメモリを読み込む仕組みを実装しました。"
date: 2026-04-19
tags: [ContextDB, レイジーロード, エージェントメモリ, AIOS, パフォーマンス]
---

# ContextDB レイジーロード: 5秒の起動からエージェント自律発見へ

AIOS でラップされた CLI を開くたびに、ContextDB は `init → session → pack → inject` のフルパイプラインを実行していました。これにより、1文字も入力する前に2〜5秒の待ち時間が発生していました。ちょっとした雑談や1行の修正だけが必要なユーザーにとって、これは不要な摩擦でした。

本日、**レイジーロードパス**をリリースしました。起動時間を50ms未満に短縮しつつ、完全なメモリ機能を必要な時に利用可能にします。

## 問題

- **遅いコールドスタート** — `context:pack` は毎回全セッションマークダウンを再構築していました
- **認知ノイズ** — 大きなコンテキストパケットが、単純なタスクでも毎回注入されていました
- **強制継続** — 前回のセッションとは無関係な場合でも、すべてのセッションが前回の継続として扱われていました

## 解決策: 3つの層

### 層1 — 起動時のファサードプロンプト (50ms未満)

履歴全体をパックする代わりに、軽量な `memory/context-db/.facade.json` サイドカーを読み込みます:

```json
{
  "sessionId": "claude-code-20260419T095454-e6eb600d",
  "goal": "Shared context session for claude-code on aios",
  "status": "running",
  "lastCheckpointSummary": "Browser MCP weak-model remediation complete",
  "keyRefs": ["scripts/ctx-agent-core.mjs"],
  "contextPacketPath": "memory/context-db/exports/latest-claude-code-context.md"
}
```

これは150トークン未満のプロンプトとして `--append-system-prompt` 経由で注入されます:

> "このプロジェクトは ContextDB を使用してセッションメモリを管理しています。最新セッション: ... 完全な履歴は: ... 前のコンテキストが必要な時に読み込んでください。"

### 層2 — バックグラウンド非同期ブートストラップ

入力を開始している間に、切り離されたプロセスがバックグラウンドで完全なコンテキストパックを再構築します:

```
起動 ──► ファサード読み込み (20ms)
    ──► プロンプト注入 + CLI 起動
    ──► [バックグラウンド] contextdb init → pack → facade 更新
```

次回 CLI を開く時には、ファサードは最新状態でサイクルが繰り返されます。

### 層3 — ランタイムトリガーオーケストレーション (A → B → C)

エージェントがユーザーターンを受信すると、3つのシグナルを短絡順で評価します:

| シグナル | チェック内容 | トリガー例 |
|----------|-------------|------------|
| **A. 意図** | メモリ関連キーワード | "remember", "之前", "continue", "resume" |
| **B. 複雑度** | タスク構造指標 | "first do X then Y", "orchestrate a team" |
| **C. RL ポリシー** | 学習済み読み込み判断 | 将来: `rl-core` ポリシーモデル |

いずれかのシグナルが発火すると、エージェントは `@file` またはツール使用で完全な履歴を読み込みます — **ラッパーの関与は不要**です。

## アーキテクチャ

```
┌──────────────────────────────────────┐
│  起動 (50ms未満)                      │
│  1. .facade.json を読み込み            │
│  2. ファサードプロンプトを注入          │
│  3. CLI を起動                         │
│  4. [bg] 非同期ブートストラップ        │
└──────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────┐
│  ランタイム (エージェントターン)       │
│  ユーザー入力 → 意図 → 複雑度 → RL    │
│  いずれか true → エージェントが履歴読込│
└──────────────────────────────────────┘
```

## 主要な設計判断

- **デフォルトON** — `CTXDB_LAZY_LOAD` はデフォルトで `1`。`CTXDB_LAZY_LOAD=0` で即時パックに戻します
- **ワンショットは維持** — `--prompt` モードは常に完全な即時パスを使用します（エージェントは即座にコンテキストが必要）
- **フェイルオープン** — ファサードが欠落/期限切れの場合、セッションヘッダーから即座に生成します。非同期ブートストラップが失敗しても警告をログ出力して継続します
- **動的注入なし** — 現在の CLI アーキテクチャでは起動時にシステムプロンプトが固定されるため、読み込み責任をエージェント自身に移譲します

## 変更内容

| ファイル | 役割 |
|----------|------|
| `scripts/lib/contextdb/facade.mjs` | ファサードJSONの読み込み、TTL検証、フォールバック生成 |
| `scripts/lib/contextdb/async-bootstrap.mjs` | ファイアアンドフォーゲットのパック + ファサード更新 |
| `scripts/lib/contextdb/async-bootstrap-runner.mjs` | 切り離されたバックグラウンドプロセス用のスタンドアロンCLIランナー |
| `scripts/lib/contextdb/trigger/intent.mjs` | 正規表現/キーワードの意図検出 |
| `scripts/lib/contextdb/trigger/complexity.mjs` | ヒューリスティックタスク複雑度スコアリング |
| `scripts/lib/contextdb/trigger/orchestrator.mjs` | A→B→C短絡トリガー評価 |
| `scripts/ctx-agent-core.mjs` | `runCtxAgent` 内のレイジーロード分岐 |

## 検証

### 新規テスト
- `contextdb-facade.test.mjs` — 4テスト (ヒット、ミス、期限切れ、フォールバック生成)
- `trigger-intent.test.mjs` — 6テスト (回想、継続、参照、メタ、中立、否定)
- `trigger-complexity.test.mjs` — 4テスト (多段、横断、オーケストレート、単純)
- `trigger-orchestrator.test.mjs` — 4テスト (意図発火、否定抑制、複雑度発火、未発火)
- `async-bootstrap.test.mjs` — 1テスト (パック後にファサード書き込み)
- `contextdb-lazy-load.test.mjs` — 5テスト (ヘルパー、統合)

### 回帰
- `ctx-agent-core.test.mjs` — 既存24テスト、すべて `CTXDB_LAZY_LOAD=0` オプトアウトでパス

## 今後の展望

1. **RL ポリシー統合** — 実際の報酬シグナルを使用して "load memory?" 判断を最適化する `rl-core` ポリシーを訓練
2. **テレメトリー** — トリガー精度、読み込みレイテンシ、タスク完了効果を追跡して閾値を継続的に改善
3. **モデルティアプリセット** — 弱モデルと強モデルで異なるトリガー感度

---

**お試しください:** セッション履歴のあるプロジェクトで AIOS ラップ CLI を開きます。通常のパックパスの代わりに `Context packet: (lazy-load; agent self-discovers memory)` と表示されるはずです。「前回の続きを」とエージェントに伝えると、必要に応じて履歴を読み込みます。

## 関連ドキュメント

- [ContextDB](https://cli.rexai.top/ja/contextdb/)
- [Quick Start](https://cli.rexai.top/ja/getting-started/) — 30 秒で AIOS をインストール
- [Workflow Policy](https://cli.rexai.top/ja/workflow-policy/) — direct / guarded / planned ルート
