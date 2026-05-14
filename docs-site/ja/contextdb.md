---
title: ContextDB
description: 5ステップ、token 圧縮コンテキストパケット、SQLite サイドカー、主要コマンド。
---

# ContextDB ランタイム

## クイックアンサー（AI 検索）

ContextDB はマルチ CLI agent 用のファイルシステムセッション層です。プロジェクトごとにイベント、チェックポイント、コンテキストパケットを保存し、SQLite サイドカーで検索を高速化し、ノイズの多い履歴を token 予算内へ圧縮して最新の高シグナル作業を残せます。

## 標準 5 ステップ

ランタイムで ContextDB は以下のシーケンスを実行できます:

1. `init` - DB フォルダとサイドカーインデックスの存在を確認。
2. `session:new` または `session:latest` - `agent + project` ごとにセッションを解決。
3. `event:add` - user/model/tool イベントを保存。
4. `checkpoint` - ステージサマリー、ステータス、next アクションを記録。
5. `context:pack` - 次の CLI 呼び出し用の markdown パケットをエクスポート。

## インタラクティブ vs ワンショット

- インタラクティブモードは通常 CLI 起動前にステップ `1, 2, 5` を実行。
- ワンショットモードは `1..5` を単一コマンドで実行。

## 起動時の自動 route prompt

ラップされた対話型クライアント（`codex`、`claude`、`gemini`、`opencode`）は保守的な起動 route prompt を受け取ります。通常作業は `single` のまま進め、明確に別レーンが必要な時だけ AIOS コマンドを自己トリガーします:

- `single`: 現在のクライアントで続行。
- `subagent`: 1つの主ドメインに staged orchestration / verification gate が必要。
- `team`: GroupChat Runtime を使用 — 共有会話履歴と自動 re-plan を持つラウンドベースの並列エージェント。
- `harness`: 明示的な長時間・夜間・再開可能・checkpoint 重視の目標。

## ネイティブ route shortcut

`aios setup` と `aios update --components native` は、管理対象の route shortcut ファイルもインストールします。レーンを明示したい場合は、起動中のクライアント内で次を使います:

| クライアント | ショートカット形式 | 管理対象ファイル |
|---|---|---|
| Codex | `/prompts:single <task>`、`/prompts:subagent <task>`、`/prompts:team <task>`、`/prompts:harness <task>` | `~/.codex/prompts/{single,subagent,team,harness}.md` |
| Claude Code | `/single <task>`、`/subagent <task>`、`/team <task>`、`/harness <task>` | `~/.claude/commands/{single,subagent,team,harness}.md` |
| Gemini CLI | `/single <task>`、`/subagent <task>`、`/team <task>`、`/harness <task>` | `~/.gemini/commands/{single,subagent,team,harness}.toml` |
| OpenCode | `/single <task>`、`/subagent <task>`、`/team <task>`、`/harness <task>` | `~/.config/opencode/commands/{single,subagent,team,harness}.md` |

Codex はトップレベルの `/single` ではなく custom prompt 名前空間（`/prompts:<name>`）を使います。OpenAI は custom prompts を deprecated としていますが、現在もサポートされています。shortcut が欠けている、または drift している場合は `aios doctor --native --fix` を実行してください。

制御:

```bash
export CTXDB_INTERACTIVE_AUTO_ROUTE=0      # 起動 route prompt を無効化
export CTXDB_HARNESS_PROVIDER=codex       # codex|claude|gemini|opencode
export CTXDB_HARNESS_MAX_ITERATIONS=8     # 注入される harness ループ予算
```

注入される `harness` コマンドには `--workspace <project-root>` が含まれるため、session artifact は AIOS インストール先ではなくアクティブなプロジェクトへ書き込まれます。

## Fail-Open Packing

`contextdb context:pack` が失敗した場合、`ctx-agent` は **警告して続行** します（コンテキスト未注入で CLI を起動）。

パック失敗を致命的エラーにする場合:

```bash
export CTXDB_PACK_STRICT=1
```

シェルラッパー（`codex`/`claude`/`gemini`）はデフォルトで fail-open であり、`CTXDB_PACK_STRICT=1` を設定してもインタラクティブセッションを直接壊すことはありません。ラップ層も厳密に執行する場合:

```bash
export CTXDB_PACK_STRICT_INTERACTIVE=1
```

## 手動コマンド例

```bash
cd mcp-server
npm run contextdb -- init
npm run contextdb -- session:new --agent codex-cli --project demo --goal "implement feature"
npm run contextdb -- event:add --session <id> --role user --kind prompt --text "start"
npm run contextdb -- checkpoint --session <id> --summary "phase done" --status running --next "write tests|implement"
npm run contextdb -- context:pack --session <id> --out memory/context-db/exports/<id>-context.md
npm run contextdb -- index:sync --stats --jsonl-out memory/context-db/exports/index-sync-stats.jsonl
npm run contextdb -- index:rebuild
```

## Workspace Memory（`aios memo`）

CLI 作業の中で継続的なオペレーター記憶を扱いたい場合は `aios memo` を使います。
persona/user profile はグローバル層です。Agent の安定した振る舞いとユーザー設定をプロジェクト横断で再利用し、プロジェクト固有の事実は ContextDB に残します。

保存境界:

- `memo add/list/search` は ContextDB の `workspace-memory--<space>` セッションへ memo イベントを書き込み/検索
- `memo recall` は ContextDB `recall:sessions` を呼び、プロジェクト横断でセッション想起
- `memo pin show/set/add` は `memory/context-db/sessions/workspace-memory--<space>/pinned.md` を読み書き
- `memo persona ...` と `memo user ...` はグローバルファイル層（既定: `~/.aios/SOUL.md` と `~/.aios/USER.md`）

例:

```bash
aios memo use release-train
aios memo add "Need strict pre-PR gate before merge #quality"
aios memo pin add "Never run destructive git commands without explicit approval."
aios memo list --limit 10
aios memo search "pre-PR" --limit 5
aios memo recall "release gate" --limit 5
aios memo persona init
aios memo persona add "Response style: concise, direct, evidence-first"
aios memo user init
aios memo user add "Preferred language: zh-CN + technical English terms"
```

### Persona / User Profile Memory

ラップされた coding agent に「自分は誰で、どう働き、誰を支援するのか」を毎回の project prompt に書かずに共有したい場合に使います。

- `persona` は agent baseline を保存します: identity、tone、engineering standards、safety posture。
- `user` は安定した operator preference を保存します: language、delivery style、recurring priorities。
- `ctx-agent` は Memory prelude を persona、user profile、workspace memo の順に構築します。
- persona/user ファイルは書き込み前と注入前に、unsafe prompt-injection 類似内容をスキャンします。
- 各 identity file には容量制限があり、startup prompt の肥大化を防ぎます。

Commands:

```bash
aios memo persona init
aios memo persona set "Identity: pragmatic AI engineering partner"
aios memo persona add "Response style: concise, direct, evidence-first"
aios memo persona show
aios memo persona path

aios memo user init
aios memo user set "Preferred language: zh-CN + technical English terms"
aios memo user add "Delivery preference: implementation first, concise review second"
aios memo user show
aios memo user path
```

Configuration:

| Variable | Purpose | Default |
|---|---|---|
| `AIOS_IDENTITY_HOME` | グローバル identity file の directory | `~/.aios` |
| `AIOS_PERSONA_PATH` | 明示的な persona file path | `~/.aios/SOUL.md` |
| `AIOS_USER_PROFILE_PATH` | 明示的な user profile file path | `~/.aios/USER.md` |
| `AIOS_PERSONA_MAX_CHARS` | persona capacity limit | `2400` |
| `AIOS_USER_PROFILE_MAX_CHARS` | user profile capacity limit | `2400` |

## レイジーロード起動（P0） {#lazy-load}

ContextDB はインタラクティブ CLI セッション用に **レイジーロードモード** をサポートしています。毎回起動時に完全な `context:pack` を実行する代わりに（2〜5秒）、ラッパーは軽量なキャッシュ済みファサード（< 50 ms）を読み込み、エージェントが必要に応じてメモリを自律発見できるようにします。

### 仕組み

1. **高速ファサード読み込み** — 起動時に `memory/context-db/.facade.json`（キャッシュ済みセッションサマリー）を読み込みます。
2. **小さなプロンプト注入** — 150 トークン未満のファサードプロンプトを注入し、エージェントに以下を伝えます:
   - ContextDB が存在すること
   - 完全な履歴の場所
   - いつ読み込むべきか
3. **バックグラウンドブートストラップ** — 切り離されたプロセスをフォークし、完全なコンテキストパックを非同期に再構築します。
4. **ランタイムの自律トリガー** — エージェントがユーザーターンを受信すると、3 つのシグナルを短絡順で評価します:
   - **A. 意図検出** — "remember"、"之前"、"continue"、"resume" などのキーワード
   - **B. タスク複雑度** — マルチステップ、クロスドメイン、 orchestrate/team 言語
   - **C. RL ポリシーゲート** — 学習済み読み込み判断のための将来の `rl-core` 統合

### 有効化 / 無効化

レイジーロードはインタラクティブセッションで **デフォルトで有効** です。

```bash
# オプトアウト（毎回起動時に即時パック）
export CTXDB_LAZY_LOAD=0

# 明示的に有効化
export CTXDB_LAZY_LOAD=1
```

ワンショットモード（`--prompt`）はこの設定に関わらず、常に即時パスを使用します。

### ファサード JSON

ファサードサイドカーは、各成功したパック後に自動生成されます:

```json
{
  "version": 1,
  "generatedAt": "2026-04-19T10:00:00Z",
  "ttlSeconds": 3600,
  "sessionId": "claude-code-20260419T095454-e6eb600d",
  "goal": "Shared context session for claude-code on aios",
  "status": "running",
  "lastCheckpointSummary": "...",
  "keyRefs": ["scripts/ctx-agent-core.mjs"],
  "contextPacketPath": "memory/context-db/exports/latest-claude-code-context.md",
  "hasStalePack": false
}
```

ファサードが欠落または期限切れの場合、最新のセッションヘッダーから新しいファサードを生成するフォールバックが実行されます。

## Token 圧縮クイックスタート {#token-compression}

セッション履歴は有用だが、次の CLI 実行には上限付きのコンテキストだけを渡したい場合に token 圧縮を使います。`balanced` は最新イベント、エラー、ファイル、コマンド、next action を優先し、重複ログ・長い出力・stack trace を先に圧縮し、それでも入らない場合だけ低優先度イベントを落とします。小さな予算では `aggressive`、旧来の tail-only 動作が必要な場合は `legacy` を使います。

```bash
npm run contextdb -- context:pack \
  --session <id> \
  --limit 80 \
  --token-budget 1200 \
  --token-strategy balanced \
  --out memory/context-db/exports/<id>-compressed.md
```

生成されたパケットの `Event Window` 行には `tokenBudget`、`tokenUsed`、`rawTokenUsed`、`compressed`、`dropped`、`truncated` が出るため、イベント削除の前に圧縮で token を節約できたか確認できます。

<figure class="rex-visual">
  <img src="../assets/visual-token-compression-wireframe.svg" alt="ContextDB token compression wireframe: raw session history, budget-aware compression, smaller context packet">
  <figcaption>Token compression は「記憶を減らす」よりも、重要シグナルを残し、ノイズを圧縮し、次の agent に小さな packet を渡す仕組みです。</figcaption>
</figure>

## パック制御（P0）

`context:pack` は token-aware 圧縮とイベントフィルタをサポートします。これは AIOS ネイティブの入力圧縮であり、RTK や shell hook のインストールは不要です:

```bash
npm run contextdb -- context:pack \
  --session <id> \
  --limit 60 \
  --token-budget 1200 \
  --token-strategy balanced \
  --kinds prompt,response,error \
  --refs core.ts,cli.ts
```

- `--token-budget`: 推定トークン数で L2 イベント量の上限を設定。
- `--token-strategy`: `legacy|balanced|aggressive`（予算指定時の既定は `balanced`。旧動作が必要な場合を除き推奨）。
- `balanced`: 重複ログ、長い出力、stack trace を圧縮しつつ、最新イベントと高シグナルのエラー/ファイルを保護。
- `aggressive`: 小さな予算向けに行数と長さをさらに絞り、recall シグナルを優先。
- `legacy`: 旧来の tail-window 選択を使い、圧縮をスキップ。
- `--kinds` / `--refs`: 一致イベントのみ含める。
- デフォルトで重複イベントの除外が有効。

`balanced` strategy は重複行、stack-run ノイズ、低シグナルのイベント本文を圧縮しつつ、重要なエラー、ファイルパス、コマンドシグナル、最新状態を保持します。Packet telemetry は `strategy`、`rawTokenUsed`、`compressed`、`dropped`、`truncated` を出力し、削減内容を監査可能にします。

## 検索コマンド（P1）

ContextDB は SQLite サイドカーインデックスによる検索を提供します:

```bash
npm run contextdb -- search --query "auth race" --project demo --kinds response --refs auth.ts
npm run contextdb -- timeline --session <id> --limit 30
npm run contextdb -- event:get --id <sessionId>#<seq>
npm run contextdb -- index:sync --stats
npm run contextdb -- index:rebuild
```

- `search`: インデックス付きイベントをクエリ。
- `timeline`: イベント/チェックポイントのマージ済みフィード。
- `event:get`: 安定 ID で特定のイベントを取得。
- `index:sync`: セッション真源ファイルからサイドカーへ増分同期。
- `index:rebuild`: セッションファイルから SQLite サイドカーを再構築。
- デフォルトランキングパス: SQLite FTS5 `MATCH` + `bm25(...)`（`kind/text/refs` 対象）。
- 互換性フォールバック: FTS が利用不可の場合、`search` は自動的にレキシカルマッチングにフォールバック。

## 増分同期 + refs 正規化（P1.5）

ContextDB は SQLite に正規化済みの `event_refs` テーブルを保持します。  
`--refs` フィルタはこのテーブルで正規化 refs の完全一致を使うため、部分文字列一致による誤検出を減らせます。

```bash
npm run contextdb -- index:sync --stats
npm run contextdb -- index:sync --force --stats
npm run contextdb -- index:sync --stats --jsonl-out memory/context-db/exports/index-sync-stats.jsonl
```

- `--stats`: sessions/events/checkpoints の `scanned/upserted`、所要時間、throttle skip、force フラグを表示。
- `--jsonl-out`: 実行ごとに 1 行の JSON レコード（タイムスタンプ付き）を追記し、傾向分析に利用可能。
- `index:rebuild` は sidecar 欠損/破損時、またはスキーマ全面再構築が必要な場合のみ使用。

## refs クエリ性能ベンチマーク

refs クエリの遅延を監視し、回帰を gate するには次のスクリプトを使用します。

```bash
cd mcp-server
npm run bench:contextdb:refs -- --events 2000 --refs-pool 200 --queries 300 --warmup 30 --json-out test-results/contextdb-refs-bench.local.json
npm run bench:contextdb:refs:ci
npm run bench:contextdb:refs:gate
```

- `bench:contextdb:refs`: ローカルでデータセットを調整可能なベンチマーク。
- `bench:contextdb:refs:ci`: CI 用の標準データセット。
- `bench:contextdb:refs:gate`: 遅延/ヒット率しきい値を満たさない場合に失敗。

## 任意セマンティック検索（P2）

セマンティックモードは任意機能であり、利用不可時は自動的にレキシカル検索にフォールバックします。

```bash
export CONTEXTDB_SEMANTIC=1
export CONTEXTDB_SEMANTIC_PROVIDER=token
npm run contextdb -- search --query "issue auth" --project demo --semantic
```

- `--semantic`: セマンティックリランキングを要求。
- `CONTEXTDB_SEMANTIC_PROVIDER=token`: ローカル token overlap リランキング。网络呼び出しなし。
- 不明/無効な provider は自動的にレキシカルクエリパスにフォールバック。
- セマンティックリランキングは「現在のクエリのレキシカル候補セット」に対して実行されるため、最近イベントのみをサンプリングするよりも、古い完全一致がデフォルトでドロップされることを防ぎます。

## 保存レイアウト

ContextDB は真源データをセッションファイルに保存し、スピードのためにサイドカーインデックスを使用します:

```text
memory/context-db/
  sessions/<session_id>/*        # 真源データ
  index/context.db               # SQLite サイドカー（再構築可能）
  index/sessions.jsonl           # 互換性インデックス
  index/events.jsonl             # 互換性インデックス
  index/checkpoints.jsonl        # 互換性インデックス
```

## セッション ID フォーマット

セッション ID は以下の形式を使用します:

`<agent>-<YYYYMMDDTHHMMSS>-<random>`

これにより時系列が明確になり、衝突を避けます。

## FAQ

### ContextDB はクラウドデータベースですか？

いいえ。デフォルトでワークスペース下のローカルファイルシステムに保存します。

### `/new` (Codex) や `/clear` (Claude/Gemini) の後にコンテキストが消えるのはなぜですか？

これらのコマンドは **CLI 内の会話状態** をリセットします。ContextDB のデータはディスクに残りますが、ラッパーがコンテキストパケットを注入するのは **CLI プロセス起動時のみ** です。

復帰方法:

- 推奨: CLI を終了し、シェルから `codex` / `claude` / `gemini` / `opencode` を再実行（ラップが再 `context:pack` して注入）。
- 同一プロセスで続けたい場合: 新規会話の最初のメッセージで最新スナップショットを読ませる:
  - `@memory/context-db/exports/latest-codex-cli-context.md`
  - `@memory/context-db/exports/latest-claude-code-context.md`
  - `@memory/context-db/exports/latest-gemini-cli-context.md`

クライアントが `@file` 参照をサポートしない場合は、ファイル内容を最初のプロンプトとして貼り付けてください。

### Codex、Claude、Gemini はコンテキストを共有しますか？

はい。同じラップワークスペースで実行される場合（git ルートが利用可能なら同じ git ルート、なければ同じカレントディレクトリ）、同じ `memory/context-db/` を使用します。

### CLI 間のタスク引継ぎはどうしますか？

同一プロジェクトセッションを維持し、次の CLI 実行前に `context:pack` を実行してください。
