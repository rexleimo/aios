---
title: "debug-hub: Coding Agent が自分自身をデバッグできる MCP ネイティブなデバッグサービス"
description: "debug-hub 0.1.0 をリリース。Coding Agent 専用に設計された軽量 MCP ネイティブのデバッグログサービス。Node.js / Browser / Go SDK、組み込み Web UI、エージェントが直接 grep 可能なファイルベースストレージを提供。"
date: 2026-05-06
tags: ["debug-hub", "MCP", "Coding Agent", "可観測性", "Node.js", "Go", "AIOS"]
---

# debug-hub: Coding Agent が自分自身をデバッグできる MCP ネイティブなデバッグサービス

すべての coding agent はログを生成します。しかし、問題が発生したとき、agent 自身にはそれらのログを調査する手段がありません——ターミナル出力を grep したり、JSONL トレースを解析したり、スパン間のエラーを関連付けたりすることはできません。最終的には、あなた（人間のオペレーター）が作業を中断して探偵役を引き受けることになります。

**debug-hub** はこの状況を変えます。coding agent のためにゼロから設計されたデバッグログ収集サービスであり、ログとトレースを agent が直接クエリできる MCP ツールとして公開します。

## 課題: Agent は自身のランタイムを見ることができない

coding agent がエラーループに陥ったり、判断に行き詰まったり、予期しない出力を生成した場合、デバッグフローは常に「人間ファースト」です:

1. 何かがおかしいことに気づく
2. ターミナルの履歴をスクロールするか、ログファイルを開く
3. タイムスタンプ、エラーメッセージ、スパンを手動で関連付ける
4. 関連する部分を agent のコンテキストに貼り付ける
5. Agent がようやく十分なシグナルを得て回復する

短いセッションではこれで十分です。しかし、長時間実行のハーネスジョブ、夜間実行、人間が監視していないマルチ agent オーケストレーションでは破綻します。

核心的な洞察: **agent は自身の実行トレースを内省できるべきです**。彼らはすでにツールアクセス（MCP）を持ち、エラーについて推論できます。必要なのは、自身のランタイム状態に対するクエリ可能なインターフェースだけです。

## debug-hub が提供するもの

debug-hub は単一の Node.js バイナリで、4 つのコンポーネントを 1 つのプロセスにパッケージしています:

| コンポーネント | 役割 |
|-----------|------|
| **HTTP API** | SDK からのログ受信、検索/統計エンドポイントの提供 |
| **MCP Server** | 5 つのツール（`list_traces`、`get_trace`、`search_logs`、`get_stats`、`clear_logs`）を coding agent に公開 |
| **組み込み Web UI** | ダークテーマのダッシュボード、ログ検索、トレースビューア、SSE ライブフィード |
| **ファイルストレージ** | `~/.debug-hub/` 配下の JSONL ファイル——`cat`/`grep` で直接読み取り可能 |

### SDK サポート

3 つの SDK、一貫した API パターン:

**Node.js**
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

**Browser**
```typescript
import { DebugHub } from '@debug-hub/browser';

const debug = new DebugHub({ service: 'web-ui' });
debug.warn('API latency spike', { endpoint: '/api/chat', p99: 3200 });
```

**Go**
```go
debug := debughub.New(debughub.Config{Service: "harness-runner"})
trace := debug.StartTrace("iteration-42")
span := trace.Span("checkpoint-write")
span.Info("Checkpoint saved", map[string]interface{}{"bytes": 12400})
span.End()
trace.End()
```

### Agent 向け MCP ツール

debug-hub を agent の MCP 設定に追加すると、5 つの新しいツールが利用可能になります:

```
debug_hub.list_traces   — 最近の実行トレースを一覧表示
debug_hub.get_trace     — 特定のトレースのスパン全体を取得
debug_hub.search_logs   — キーワード、レベル、時間範囲、モジュール、traceId で検索
debug_hub.get_stats     — 集計カウント、エラーサマリー、レベル分布
debug_hub.clear_logs    — 古いログをクリーンアップ
```

エラーを繰り返している agent は、次のように自己診断できます:

1. `search_logs` を `{ level: "error", since: <5分前> }` で呼び出す
2. 正確なエラーメッセージと trace ID を取得
3. 関連するトレースで `get_trace` を呼び出してスパン全体を確認
4. パイプラインのどのステップで失敗しているかを自己診断
5. 人間の介入なしに自己修正

## 注目すべきアーキテクチャ上の決定

**データベース不要。** ストレージは `~/.debug-hub/` 配下の JSONL ファイルです。これにより:
- `npm install` 以外のセットアップ不要
- データベース、Docker、接続文字列は不要
- Agent は API をバイパスして `cat`/`grep` で直接ファイルを読み取り可能
- 人間のオペレーターも使い慣れたコマンドラインツールでトラブルシューティング可能

**MCP ファースト、HTTP セカンド。** MCP ツール定義は HTTP API に後付けされたものではなく、同じストレージレイヤーを共有し、同時に設計されています。HTTP API は SDK の取り込みと Web UI のために存在し、MCP インターフェースが agent が実際にクエリするための窓口です。

**SSE によるダッシュボード更新。** 新しいログエントリは Server-Sent Events を介して Web UI にブロードキャストされます——WebSocket の複雑さもポーリングのオーバーヘッドもありません。

## クイックスタート

```bash
cd packages/debug-hub
npm install
npm run dev
# HTTP API + Web UI: http://localhost:39200
# MCP: stdio モード（agent の MCP 設定に追加）
```

テストログを送信:
```bash
curl -X POST http://localhost:39200/api/logs/single \
  -H 'Content-Type: application/json' \
  -d '{"id":"1","timestamp":1714500000000,"level":"info","message":"hello from debug-hub","source":{},"trace":{"traceId":"t1","spanId":"s1"},"sdk":{"name":"test","version":"0.1.0","runtime":"node"}}'
```

その後 `http://localhost:39200` を開いてダッシュボードで確認できます。

## 0.1.0 以降の更新

**v0.2 (2026-05-09):** 自動 Trace 物化（デバウンス）、agent デバッグセッション（`start_session`、`record_event`、`get_session`）、構造化証拠イベント、コンパクトタイムラインとコンテキストパック、`/api/health`、入力バリデーション、パストラバーサル保護。

**v0.3 (2026-05-09):** インストルメンテーション追跡と自動クリーンアップ。新しい MCP ツール: `instrument`、`list_instruments`、`cleanup_instruments`。マーカー規約 `DH:<sessionId>` によるゼロ依存デバッグコード注入 — agent が 1 行の `__dh` レポーターを注入し、各デバッグ呼び出しをセッションマーカーでタグ付けし、バグ修正後に `cleanup_instruments` で全注入コードを除去。デュアルモードクリーンアップ（instrument 記録による明示的モード、workspace grep によるフォールバック）、`dryRun` プレビュー対応。

## ロードマップ

- **Python SDK** — より広範な AI/ML agent エコシステム向け
- **トレース圧縮** — 長いトレースを agent フレンドリーなサマリーに圧縮し、コンテキストウィンドウを節約
- **マルチ agent 相関** — orchestrator/worker パターン向けのクロス agent トレースリンク
- **永続的アラートルール** — ログパターンに一致したときに発火する agent 設定可能な監視条件

## 試してみる

debug-hub は [rex-ai-boot](https://github.com/rexleimo/rex-cli) モノレポの `packages/debug-hub` にあります。Node.js ≥ 22 が必要です。

coding agent、ハーネスランナー、MCP サーバーを構築しているなら——あなたの agent に自身をデバッグする能力を与えてください。
