---
title: "v1.50.0：記憶、ドキュメント、計画、コードを横断する統合 AIOS 検索"
description: "Harness CLI v1.50.0 は、対応するすべての coding client に project memory、pinned memo、docs、plans、code を横断する安全な検索面を提供します。"
date: 2026-06-04
tags: ["release", "search", "contextdb", "memory", "multi-client", "AIOS"]
---

# v1.50.0：記憶、ドキュメント、計画、コードを横断する統合 AIOS 検索

Agent の知性は、モデルだけで決まりません。同じ project fact を何度も探すと、計画、pinned memo、docs、code の関係が切れてしまいます。

Harness CLI v1.50.0 では、その探索経路を 1 つの検索面に統合しました。対応するすべての client が、project memory、pinned memo、docs、plans、code を同じコマンドで検索できます。

## 基本コマンド

リポジトリ root で実行します：

```bash
node scripts/aios.mjs search "native client guidance" --agent codex-cli --json
```

`--agent` は重要です。AIOS はこの値で検索している runtime client を判定し、共有 memory と client private memory を安全に扱います。

対応 runtime client id：

- `codex-cli`
- `claude-code`
- `gemini-cli`
- `antigravity-cli`
- `opencode-cli`
- `crush-cli`

## 必要な source だけを検索する

タスク開始時は広く検索し、方向が見えたら source を絞ります。

```bash
node scripts/aios.mjs search "release blocker" --source memory,plans
node scripts/aios.mjs search "browser MCP" --source docs,code --limit 8
node scripts/aios.mjs search "private scratch" --scope agent_private --agent claude-code
```

source filter は `memory`、`plans`、`docs`、`code`、`all` です。

## Memory visibility

v1.50.0 は cross-client collaboration と identity isolation を分けて扱います：

- `project_shared` は全 client から見えます。
- `agent_private` は一致する `--agent <runtime-client-id>` の場合のみ見えます。
- 一致しない client には private record を返しません。

つまり Codex から Claude や OpenCode に切り替えても重要な project memory は失われず、client ごとの scratch memo は隔離されたままです。

## 全 client に同じ guidance を配布

検索 workflow は、それぞれの client が実際に読む native instruction surface に書き出されます：

| Client | Instruction surface |
| --- | --- |
| Codex | `AGENTS.md` |
| Claude | `CLAUDE.md` |
| Gemini | `GEMINI.md` |
| Antigravity | `GEMINI.md` |
| OpenCode | `AGENTS.md` |
| Crush | `AGENTS.md` |

Antigravity と Crush は live execution ではまだ `pending-smoke` ですが、static search guidance は同じ client registry で生成・検証されています。

## 推奨 workflow

大きな file scan の前に、まず AIOS search に聞きます：

```bash
node scripts/aios.mjs search "what did we decide about search visibility" --agent codex-cli
```

次に範囲を絞ります：

```bash
node scripts/aios.mjs search "agent_private" --source memory,docs --agent codex-cli --json
```

memory と docs で方向を決めてから code search に進むことで、agent の reasoning budget を節約し、過去の project decision を保ったまま作業できます。

## Resource integrity checklist

Release 前に public surface をまとめて検証します：

```bash
npm run check:site-sync
node --test scripts/tests/native-agent-guidance.test.mjs scripts/tests/client-registry.test.mjs scripts/tests/native-source-tree.test.mjs scripts/tests/search.test.mjs
git diff --check
```

MkDocs がある場合は両方の site を build します：

```bash
mkdocs build --strict
mkdocs build -f mkdocs.blog.yml --strict
```

詳細は [ContextDB search docs](https://cli.rexai.top/ja/contextdb/#統合プロジェクト検索v1500) を参照してください。
