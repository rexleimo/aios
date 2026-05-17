---
title: "debug-hub: Agent が自分自身をデバッグできれば、よく眠れる"
description: "coding agent が自分のエラーログを読んで、あなたを起こさずに問題を修正できたら？ それが debug-hub です。"
date: 2026-05-06
tags: ["debug-hub", "MCP", "Coding Agent", "可観測性"]
---

# debug-hub: Agent が自分自身をデバッグできれば、よく眠れる

想像してみてください: 深夜3時、夜間の agent 実行がエラーにぶつかりました。以前なら、朝起きて壊れた状態を目にし、ログを掘り返す午前を過ごすことになりました。

**agent が自分自身をデバッグできたらどうでしょう？**

それがまさに debug-hub の役目です。agent に自身のログを検索し、実行パスをトレースし、何が悪かったのかを特定するツールを提供します — すべてあなたなしで、自動的に。

## 課題: Agent は目が見えない

agent がエラーにぶつかると、自身のログを見ることができません。ターミナル出力を `grep` したり、タイムスタンプを関連付けたりすることはできません。デバッグの流れはいつもこうです:

1. **あなた** が何かおかしいことに気づく
2. **あなた** がログをスクロールする
3. **あなた** がエラーを見つけて agent に貼り付ける
4. agent がようやく理解する

短いセッションならこれで十分です。でも、夜間実行、マルチ agent タスク、長時間の harness ジョブでは — 見ている人がいません。agent はただ……黙って失敗します。

## 解決策: Agent のためのツール

debug-hub は MCP 経由でログツールを公開します — agent が他のツールで既に使っているのと同じプロトコルです。agent は新しい機能を手に入れます:

| ツール | agent にできること |
|---|---|
| `search_logs` | 「直近5分のエラーをすべて見せて」 |
| `get_trace` | 「このエラーの実行パス全体を見せて」 |
| `get_stats` | 「エラーはいくつある？」 |
| `start_session` | 「デバッグを始めるから追跡して」 |
| `cleanup_instruments` | 「デバッグコードを削除して、バグは直った」 |

### 自己デバッグの例

リトライループに陥った agent は次のように動けます:

1. 自身の直近のエラーログを検索
2. 正確なエラーメッセージと trace ID を特定
3. 完全な実行トレースを取得して、どのステップで失敗したか確認
4. 問題を診断して修正
5. すべてあなたを起こさずに

## 中身

debug-hub は単一の Node.js プロセスで、すべてが内蔵されています:

- **HTTP API** — コードからログを受信
- **MCP Server** — agent 用ツールを公開
- **Web UI** — ダークテーマのダッシュボード（人間用）
- **ファイルストレージ** — `~/.debug-hub/` 配下のシンプルな JSONL ファイル

データベース不要。Docker 不要。接続文字列不要。`npm install` するだけ。

### 3つの SDK

どのランタイムでも同じ API が使えます:

**Node.js:**
```typescript
import { DebugHub } from '@debug-hub/node';
const debug = new DebugHub({ service: 'my-agent' });
debug.info('Tool call started', { tool: 'search' });
```

**Browser:**
```typescript
import { DebugHub } from '@debug-hub/browser';
const debug = new DebugHub({ service: 'web-ui' });
debug.warn('API latency spike', { endpoint: '/api/chat' });
```

**Go:**
```go
debug := debughub.New(debughub.Config{Service: "harness-runner"})
trace := debug.StartTrace("iteration-42")
```

## 始め方

```bash
cd packages/debug-hub
npm install
npm run dev
# → HTTP API + Web UI: http://localhost:39200
# → MCP: stdio モード
```

テストログを送信:
```bash
curl -X POST http://localhost:39200/api/logs/single \
  -H 'Content-Type: application/json' \
  -d '{"id":"1","timestamp":1714500000000,"level":"info","message":"hello","source":{},"sdk":{"name":"test","version":"0.3.0","runtime":"node"}}'
```

http://localhost:39200 を開いてダッシュボードで確認できます。

## 大きな絵

debug-hub は RexCLI の **可観測性レイヤー** の一部です。次のものと連携します:

- [ContextDB](https://cli.rexai.top/ja/contextdb/) — セッションをまたぐメモリ
- [Solo Harness](https://cli.rexai.top/ja/solo-harness/) — 自己診断できる夜間実行
- [Agent Team](https://cli.rexai.top/ja/team-ops/) — マルチ agent トレーシング

agent が自分自身をデバッグできるようになれば、より長く動かし、より複雑なタスクを処理し、エラーから回復できると信頼できます — すべてあなたの絶え間ない注目なしで。

---

*debug-hub は v0.3.0 で、[RexCLI](https://cli.rexai.top) の一部です。試して、あなたの agent に自己省察の力を与えてください。*
