---
title: debug-hub
description: coding agent が自身のランタイムログをクエリし、エラーを自己診断できる MCP ネイティブのデバッグログサービス。
---

# debug-hub

> coding agent に自己デバッグ能力を。

debug-hub は、coding agent 専用に設計された MCP ネイティブのデバッグログサービスです。ログとトレースを MCP ツールとして公開し、agent が直接 `search_logs`、`get_trace`、`get_stats` をクエリできるようにします。人間がターミナル出力を grep したり、エラースパンを手動で関連付けたりする必要はありません。

[ブログ記事を読む](/blog/ja/2026-05-debug-hub-mcp/){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="debug_hub_hero" data-rex-target="blog_post" }
[クイックスタート](#quick-start){ .md-button data-rex-track="cta_click" data-rex-location="debug_hub_hero" data-rex-target="quick_start" }

---

## なぜ debug-hub か

coding agent がエラーループに陥ったり、判断で停滞したり、予期しない出力を生み出したりした時、デバッグワークフローは常に **人間ファースト** です：

1. 人間が何かおかしいことに気づく
2. ターミナル履歴をスクロールするかログファイルを開く
3. タイムスタンプ、エラーメッセージ、スパンを手動で関連付ける
4. 関連部分を agent のコンテキストに貼り付ける
5. やっと agent が回復に十分なシグナルを得る

これは、誰も見ていない長時間実行の harness ジョブ、夜間実行、マルチ agent オーケストレーションでは破綻します。

**核心的洞察**: agent は自身の実行トレースを内省できるべきです。既にツールアクセス（MCP）を持っています。必要なのは自身のランタイム状態に対するクエリ可能なインターフェースだけです。

---

## コア機能

<div class="feature-grid">
  <div class="feature-card feature-card--debug">
    <div class="feature-card__icon">🔧</div>
    <div class="feature-card__title">agent 用 MCP ツール</div>
    <div class="feature-card__desc">
      ログ/Trace ツールに加えて <code>start_session</code>、<code>record_event</code>、<code>timeline</code>、<code>health</code>、<code>compact_context</code> を提供し、agent はログだけでなく実行証拠をクエリできます。
    </div>
  </div>
  <div class="feature-card feature-card--tool">
    <div class="feature-card__icon">📦</div>
    <div class="feature-card__title">3 種類の SDK</div>
    <div class="feature-card__desc">
      Node.js、Browser、Go — すべてのランタイムで一貫した API パターン。
    </div>
  </div>
  <div class="feature-card feature-card--memory">
    <div class="feature-card__icon">📁</div>
    <div class="feature-card__title">ゼロ依存</div>
    <div class="feature-card__desc">
      <code>~/.debug-hub/</code> 配下のファイルベース JSONL ストレージ — <code>cat</code>/<code>grep</code> で直接読み取り可能。
    </div>
  </div>
  <div class="feature-card feature-card--workflow">
    <div class="feature-card__icon">🖥️</div>
    <div class="feature-card__title">組み込み Web UI</div>
    <div class="feature-card__desc">
      ダークテーマのダッシュボード。ログ検索、トレースビューア、SSE ライブフィード付き。
    </div>
  </div>
</div>

---

## クイックスタート {#quick-start}

```bash
cd packages/debug-hub
npm install
npm run dev
```

- **HTTP API + Web UI**: http://localhost:39200
- **MCP**: stdio モード（agent の MCP 設定に追加）

### テストログを送信

```bash
curl -X POST http://localhost:39200/api/logs/single \
  -H 'Content-Type: application/json' \
  -d '{
    "id": "1",
    "timestamp": 1714500000000,
    "level": "info",
    "message": "hello from debug-hub",
    "source": {},
    "trace": {"traceId": "t1", "spanId": "s1"},
    "sdk": {"name": "test", "version": "0.2.0", "runtime": "node"}
  }'
```

`trace` フィールドはオプションです — トレース不要なログは省略可能。バッチ POST では無効なエントリがスキップされます（レスポンスに `written`/`skipped` カウントが含まれます）。単一エントリの POST は不正なペイロードに対して HTTP 400 を返します。

その後、`http://localhost:39200` を開いてダッシュボードで確認してください。

---

## SDK の使い方

### Node.js

```typescript
import { DebugHub } from '@debug-hub/node';

const debug = new DebugHub({ service: 'my-agent' });
debug.info('Tool call started', { tool: 'search', args: { query: '...' } });

const trace = debug.startTrace('agent-turn');
const span = trace.span('llm-call');
span.info('Prompt sent', { model: 'claude-opus-4-7' });
span.end();
trace.end();
```

### Browser

```typescript
import { DebugHub } from '@debug-hub/browser';

const debug = new DebugHub({ service: 'web-ui' });
debug.warn('API latency spike', { endpoint: '/api/chat', p99: 3200 });
```

### Go

```go
debug := debughub.New(debughub.Config{Service: "harness-runner"})
trace := debug.StartTrace("iteration-42")
span := trace.Span("checkpoint-write")
span.Info("Checkpoint saved", map[string]interface{}{"bytes": 12400})
span.End()
trace.End()
```

---

## MCP ツールリファレンス

| ツール | 説明 |
|------|-------------|
| `debug_hub.list_traces` | フィルタ付きで最近の実行トレースを一覧表示 |
| `debug_hub.get_trace` | 特定のトレースの完全なスパンツリーを取得 |
| `debug_hub.search_logs` | 大文字小文字を区別せず、キーワード、レベル、時間範囲、モジュール、traceId で検索 |
| `debug_hub.get_stats` | 集計カウント、エラーサマリー、レベル内訳 |
| `debug_hub.clear_logs` | 保持ポリシーに基づいて古いログをクリーンアップ |
| `debug_hub.start_session` | 目的とワークスペース情報を持つ agent デバッグセッションを作成 |
| `debug_hub.record_event` | 構造化証拠を記録（無効な level は `info`、無効な kind は `note` にデフォルト） |
| `debug_hub.get_session` | セッションと記録された証拠を取得 |
| `debug_hub.timeline` | コンパクトな時系列証拠ストリームを返す |
| `debug_hub.health` | 取り込み/ストレージの健全性と schema version を返す |
| `debug_hub.compact_context` | agent の再開/引き継ぎ用コンテキストパックを生成 |

### 自己診断の例

繰り返しエラーが発生した agent は、以下を実行できます：

1. `search_logs` を `{ level: "error", since: <5 分前> }` で呼び出し
2. 正確なエラーメッセージとそのトレース ID を取得
3. 関連トレースで `get_trace` を呼び出して完全なスパンツリーを確認
4. パイプラインのどのステップが失敗しているか自己診断
5. 人間の介入なしに自己修正

---

## アーキテクチャ

debug-hub は 4 つのコンポーネントをパックした単一の Node.js バイナリです：

| コンポーネント | 役割 |
|-----------|------|
| **HTTP API** | SDK からログを受信し、検索/統計エンドポイントを提供 |
| **MCP Server** | coding agent 用にログ/Trace、セッション、イベント、ヘルス、タイムライン、コンパクトコンテキストのツールを公開 |
| **組み込み Web UI** | ログ検索、トレースビューア、SSE ライブフィード付きダークテーマダッシュボード |
| **ファイルストレージ** | `~/.debug-hub/` 配下の JSONL ファイル — 直接読み取り可能 |

### 設計判断

**データベース依存なし。** ストレージはディスク上の JSONL ファイルです。これは：
- `npm install` 以外のセットアップが不要
- agent が API をバイパスしてファイルを直接読み取れる
- デーモン不要、Docker 不要、接続文字列不要

**MCP ファースト、HTTP セカンド。** MCP ツール定義は同じストレージレイヤーを共有し、HTTP API と共同設計されています。

**ダッシュボードには SSE。** 新しいログエントリは Server-Sent Events でブロードキャスト — WebSocket の複雑さなし、ポーリングオーバーヘッドなし。

---

## 使用例

### エラーループの自己診断

agent が再試行ループに陥った時、自身の最近のエラーログをクエリし、パターンを特定し、戦略を調整できます — 人間を起こす必要なし。

### 長時間実行タスクの監視

夜間の harness 実行、データ処理ジョブ、トレーニングパイプラインは構造化トレースをログできます。問題が発生した場合、翌朝の診断 agent がトレース履歴から正確な失敗ポイントを取得できます。

### マルチ agent 実行トレーシング

分散型オーケストレーター/ワーカーパターンは、agent 境界を越えてトレースを相関付けでき、複雑なマルチステップワークフローの統一ビューを提供します。

---

## 今後の予定

debug-hub は 0.2.0 です。最近の改善には、自動 Trace 物化（デバウンス）、agent デバッグセッション、構造化証拠イベント、HTTP エンドポイント入力バリデーション、MCP 引数バリデーション、パストラバーサル保護、大文字小文字を区別しない検索、コンパクトコンテキストパックが含まれます。ロードマップには：

- **Python SDK** — より広い AI/ML agent エコシステム向け
- **マルチ agent 相関** — オーケストレーター/ワーカーパターン向けクロス agent トレースリンク
- **永続アラートルール** — ログパターンで発火する agent 設定可能な監視条件

---

## リソース

- **詳細ブログ**: [debug-hub: MCP ネイティブデバッグログサービス](/blog/ja/2026-05-debug-hub-mcp/)
- **ソースコード**: rex-ai-boot monorepo の `packages/debug-hub`
- **要件**: Node.js ≥ 22

---

## 関連機能

- [ソロ Harness](solo-harness.md) — ジャーナリング付き長時間単一 agent 作業
- [Agent Team](team-ops.md) — マルチ agent 協調と調整
- [トラブルシューティング](troubleshooting.md) — 一般的なデバッグと診断
