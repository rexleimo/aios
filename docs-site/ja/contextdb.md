---
title: ContextDB：pull-based プロジェクト記憶
description: ローカル ContextDB registry、memo storage、unified project search、lazy load、client 間の記憶境界を説明します。
---

# ContextDB

## まず答え

ContextDB は Harness CLI のローカル project memory layer です。session、event、checkpoint、memo、context pack の参照を project workspace に保存し、対応する client が別の session から必要な事実を見つけられるようにします。現在のモデルは pull-based です。registry が source を示し、agent が task に必要な evidence だけを recall します。

## 今すぐ実行

project root で：

~~~bash
aios init --all
aios doctor --native --verbose
node scripts/aios.mjs search "release readiness" --agent codex-cli --json
~~~

current init は .aios/context-db/index.json を指す project marker を追加します。

## Local registry

典型的な workspace：

~~~text
.aios/
  context-db/
    index.json                 # source registry
    sessions/<session-id>/     # session event と checkpoint
    index/                     # derived search data
    exports/                   # context pack と handoff
  memo/
    file/events.jsonl          # canonical append-only memo
    split/                     # optional one-file-per-memo backend
~~~

実際の file は client と実行した command により異なります。registry は repository 全体のコピーではなく source pointer です。

## Pull-based recall の流れ

~~~text
client start
  -> AGENTS.md、CLAUDE.md、GEMINI.md、または client guidance を読む
  -> .aios/context-db/index.json を見つける
  -> source metadata と task relevance を確認
  -> handoff、memo、checkpoint、context pack を検索または読む
  -> 必要な evidence だけで task を続ける
~~~

これは context control の方法であり、固定の prompt size や startup time を保証しません。source がない、古い、または別 project にある場合は明示的な pointer が必要です。

## 記録されるもの

| Source | 例 | 用途 |
| --- | --- | --- |
| Session events | prompt、tool result、error、変更 path | 何が起きたかを復元 |
| Checkpoints | goal、status、next step、evidence | 長い task を再開 |
| Memos | project decision、constraint、reminder | 持続的な事実 |
| Context packs | 範囲を限定した history export | 選択した context の handoff |
| Unified search | memory、plans、docs、code | 広い read 前の evidence 探索 |

ContextDB は未検証の agent response を evidence に変えません。test、diagnostic、review、privacy check は別の quality gate です。

## Memory With Memo {#memory-with-memo}

### Workspace Memory AIOS Memo {#workspace-memoryaios-memo}

### Workspace Memory AIOS Memo (legacy anchor) {#workspace-memory-aios-memo}

memo は project の durable note です。default の canonical backend は .aios/memo/file/events.jsonl の append-only JSONL で、split は optional です。

~~~bash
aios memo add "Keep authentication tests strict"
aios memo pin add "Do not push directly to main"
aios memo search "authentication"
aios memo recall "release readiness" --limit 5
aios memo storage status
~~~

storage を意図的に変更・確認します。

~~~bash
aios memo storage use split
aios memo storage use file
aios memo storage rebuild
aios memo storage doctor
~~~

rebuild は derived query file を更新するだけで canonical record を書き換えません。

## 統合プロジェクト検索（v1.50.0） {#統合プロジェクト検索v1500}

広い grep や repository 全体の read の前に使います。

~~~bash
node scripts/aios.mjs search "native client guidance" --agent codex-cli --json
node scripts/aios.mjs search "release blocker" --source memory,plans
node scripts/aios.mjs search "browser MCP" --source docs,code --limit 8
~~~

| Source | 内容 | 用途 |
| --- | --- | --- |
| memory | project-shared と許可された private memo | decision と handoff |
| plans | docs/plans と implementation plan | intent と checkpoint |
| docs | README、native guidance、public docs | runbook |
| code | scripts、mcp-server、test、config | implementation fact |
| all | 全 source | 最初の targeted lookup |

project-shared memo は対応 client 間で見えます。agent-private note は codex-cli、claude-code、gemini-cli、opencode-cli、hermes-agent、grok-build など matching runtime id が必要です。

## Lazy Load (Fast Startup) {#lazy-load}

interactive session は default で lazy context loading を使用します。compatibility workflow が full context を必要とする場合：

~~~bash
export CTXDB_LAZY_LOAD=0
~~~

aios init が registry marker を作成すると、client は registry と facade guidance から context を発見できます。legacy または unwrapped client は compatibility fallback を使う場合があります。lazy loading は context selection の動作であり、source の存在や自動 query を保証しません。

## Context pack と manual control

handoff や限定した history slice には bounded context pack を使います。

~~~bash
cd mcp-server
npm run contextdb -- context:pack \
  --session <session-id> \
  --limit 80 \
  --token-budget 1200 \
  --token-strategy balanced
~~~

storage 診断や再現可能な handoff が必要な場合：

~~~bash
npm run contextdb -- init
npm run contextdb -- session:new --agent codex-cli --project my-app --goal "fix auth bug"
npm run contextdb -- checkpoint --session <id> --summary "auth fix done" --status running
npm run contextdb -- index:rebuild
~~~

通常は aios init と native doctor から始めてください。

## Client 間の記憶と privacy

integration が対応し sync 済みなら、複数の client は一つの project registry を共有できます。ただし registry は別 client の private home configuration を公開しません。実際の状態は aios doctor --native --verbose で確認します。

project file はローカルですが、agent は選んだ内容を設定済み model provider に送信できます。package install と MCP registration にも別の network boundary があります。機密情報は redaction workflow を通してから共有します。

## Legacy compatibility

古い wrapper や script は .contextdb-enable を opt-in marker として認識する場合があります。現在の primary path は aios init と .aios/context-db/index.json です。compatibility workflow が明示的に要求する場合だけ legacy switch を使ってください。

## FAQ

### ContextDB は cloud database ですか？

いいえ。registry、session、export、canonical memo は local workspace file です。client provider と optional integration には別の network boundary があります。

### 複数 client は同じ記憶を共有しますか？

対応と sync が完了していれば同じ project ContextDB を利用できます。ただし route、skill、MCP の機能が同じとは限りません。

### /new や /clear の後は？

terminal conversation が reset されるだけで project file は残ります。新しい session を起動し、registry、unified search、named context pack から evidence を recall してください。

### memory を無効にするには？

client を停止し、client guidance に従って integration marker を調整します。古い workflow が .contextdb-enable を使っていた場合だけその file を削除します。marker の削除は既存の .aios data を消しません。

### 何を削除できますか？

derived index は再構築できます。sessions、exports、memo JSONL は source data なので、削除前に backup してください。

## 次に読むページ

- [クイックスタート](getting-started.md)
- [Workflow Policy](workflow-policy.md)
- [Token Intelligence](token-compression.md)
- [アーキテクチャ](architecture.md)
- [トラブルシューティング](troubleshooting.md)
