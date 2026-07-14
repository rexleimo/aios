---
title: "ContextDB 检索升级：FTS5/BM25 + 增量索引同步"
description: "ContextDB 如何结合 SQLite FTS5、BM25、refs 精确过滤和可观测增量同步，提升 AI Agent 记忆检索可靠性。"
date: 2026-06-18
tags: ["ContextDB", "FTS5", "BM25", "Agent 记忆", "检索"]
---

# ContextDB 检索升级：FTS5/BM25 + 增量索引同步（P1.5）

> **快速答案：** ContextDB 使用 SQLite FTS5 和 BM25 做排序检索，再通过规范化 `event_refs` 执行精确过滤，并用 `index:sync --stats` 观测增量同步。需要 CI 或运维流水线时，可以用 `--jsonl-out` 保存机器可读历史。

ContextDB 在 P1 阶段将检索主路径切到 SQLite FTS5 + BM25。  
现在 P1.5 继续补齐可观测与性能治理能力：

- 增量 sidecar 同步可观测（`index:sync --stats`）；
- 同步指标 JSONL 持久化（`--jsonl-out`）；
- `event_refs` 规范化表驱动 refs 精确过滤；
- refs 查询基准与 CI gate 脚本。

## 为什么继续升级

FTS5/BM25 落地后，实际运行里还剩两个问题：

- 缺少每次同步的结构化指标，不利于追踪索引新鲜度与成本；
- refs 过滤在大数据量下仍需要更严格的精确匹配保证。

P1.5 在不破坏现有使用方式的前提下补齐了这两点。

## 当前生效路径

`contextdb search` 和索引维护现在是：

1. SQLite FTS5 `MATCH`
2. BM25 排序（`bm25(...)`，作用于 `kind/text/refs`）
3. FTS 不可用时回退 lexical
4. `event_refs` 规范化表做 refs 精确匹配（避免子串歧义）
5. `index:sync` 做增量同步（保留 `index:rebuild` 全量重建）

## 命令示例

```bash
cd mcp-server
npm run contextdb -- search --query "auth race" --project demo --refs auth.ts
npm run contextdb -- index:sync --stats
npm run contextdb -- index:sync --stats --jsonl-out memory/context-db/exports/index-sync-stats.jsonl
npm run bench:contextdb:refs:ci
npm run bench:contextdb:refs:gate
```

本地调参可用：

```bash
npm run bench:contextdb:refs -- --events 2000 --refs-pool 200 --queries 300 --warmup 30 --json-out test-results/contextdb-refs-bench.local.json
```

## 实际价值

- 能持续观测同步质量与成本（`scanned/upserted`、耗时、throttle skip）。
- refs 过滤在大规模数据下更稳定，误命中更少。
- 通过 CI 阈值 gate 约束 refs 查询的延迟与命中率回归。
- 长会话与跨 CLI 接力场景无需频繁全量重建。

## 常见问题

### BM25 会替代 refs 精确过滤吗？

不会。BM25 负责给文本匹配结果排序，规范化的 `event_refs` 会在后续强制执行精确引用约束。

### 每次运行都要重建整个索引吗？

不需要。日常维护使用增量 `index:sync`；只有恢复、迁移或明确需要全量刷新时才使用 `index:rebuild`。

### 当前实现应该看哪份文档？

请看 [ContextDB 文档](https://cli.rexai.top/zh/contextdb/)、[Token Intelligence](https://cli.rexai.top/zh/token-compression/) 和[故障排查](https://cli.rexai.top/zh/troubleshooting/)。
