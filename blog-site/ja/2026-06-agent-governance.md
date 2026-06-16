---
title: "Agent Governance: Team live 実行の前に証跡を残す"
description: "Harness CLI が smoke 証跡、provenance、token compression metrics、skill training gate で多数の agents を1つの workflow に組み込む方法。"
date: 2026-06-16
tags: ["Agent Team", "governance", "smoke", "skills", "AIOS"]
---

# Agent Governance: Team live 実行の前に証跡を残す

agents を増やすこと自体は難しくありません。難しいのは、実際の workflow に入れてよいほど信頼できる状態にすることです。

Harness CLI は agent routing、team execution、skill update を evidence の問題として扱います。workflow を live にする前に、次の3つを証明します。

1. agent が smoke path を実行できること、
2. 実行が provenance と token-compression metrics を残すこと、
3. skill が変更された場合は training gate を通ること。

## なぜ governance が必要か

multi-agent system の失敗は地味です。

- client capability の検証前に role が live work を始める、
- skill が変わったのに新しい instruction の training を確認しない、
- output compression が一部 agent でしか動かない、
- team run は成功に見えるが、あとで audit できる evidence がない。

答えは agent を減らすことではありません。agent admission を退屈で、反復可能で、fail-closed な手順にすることです。

## 新しい workflow

routing、docs、skills、team behavior を変更する場合は、まず dry-run preview から始めます。

```bash
node scripts/aios.mjs agents smoke --dry-run --json
```

次に active agent set の smoke evidence を記録します。

```bash
node scripts/aios.mjs agents smoke --json
```

変更が skills に触れる場合は、workflow を ready と見なす前に training gate を実行します。

```bash
node scripts/aios.mjs skill verify-training --changed --base HEAD --json
```

これで運用ルールは単純になります。team と harness workflow は拡張してよいが、信頼される前に evidence を残す必要があります。

## 何が記録されるか

core-risk agent ごとに3種類の evidence file が残ります。

| Evidence | Path | Purpose |
|---|---|---|
| Smoke result | `.aios/agents/smoke/<agent>.json` | agent が smoke path を通ったことを示す |
| Provenance | `.aios/agents/provenance/<agent>.json` | どの agent/client path が evidence を作ったかを記録 |
| Compression metrics | `.aios/interception/metrics/agents-smoke-<agent>.jsonl` | `pre_send` と `post_receive` の token-compression accounting に agent identity が含まれることを確認 |

重要なのは `agent_id` です。stable な agent identity のない metrics は audit しにくいため、smoke evidence はその identity を compression data plane に通します。

## 日常作業での使いどころ

governance path は次の場合に使います。

- agent role を追加または rename する、
- team、harness、subagent routing を変更する、
- workflow skills を変更する、
- native client instructions を更新する、
- agent orchestration behavior を変える release を準備する。

通常の feature work では、user-facing flow はこれまで通りです。

```bash
aios team 3:codex "settings page を実装し、test と docs を更新"
aios team status --provider codex --watch
```

governance check はその背後で動き、ユーザーが team surface に依存する前に ready であることを確認します。

## Skill 変更には training が必要

Skills は単なる documentation ではなく、実行可能な operating procedure です。skill が変わったなら、changed skill が training gate を通ったことを確認するべきです。

```bash
node scripts/aios.mjs skill verify-training --changed --base HEAD --json
```

この command は warning ではなく gate です。training evidence がなければ workflow は停止し、新しい instruction に live agent work を依存させません。

## 運用原則

大きな agent system のルールは単純です。

> admission、provenance、compression、training が観測可能な場合にだけ、より多くの agents を受け入れる。

これが Harness CLI がより多くの agents を1つの system workflow に組み込む方法です。team run を trust fall にしません。

---

日常コマンドと governance checklist は、更新された [Agent Team docs](https://cli.rexai.top/ja/team-ops/) を参照してください。
