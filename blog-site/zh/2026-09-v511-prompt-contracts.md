---
title: v5.11.0 提示词契约加固——让模型自报状态，不再靠猜
date: 2026-09-06
description: "记忆五要素抽取、验证评分回环、卡死自报、压缩分级、弱模型钉死、节点 recipe 与 planning ledger：7 组提示词契约让模型自报状态，零运行时改动，升级只需拉取仓库并刷新客户端投影。无需改动任何运行时配置，拉取后刷新投影即可生效。"
---

# v5.11.0 提示词契约加固——让模型自报状态，不再靠猜

> 2026-09-06 · 纯提示词版本：7 组 skill 契约升级，零运行时改动，无破坏性变更。

## 快速答案

本版落地竞品审计中"只值得抄提示词的那一半"：记忆、验证、卡死、压缩、调度、并行、规划七处全部写成模型自报的结构化契约，runtime 只验客观事实。升级：拉取 + `node scripts/sync-skills.mjs`，`rex-planning` 投影随 `aios setup` / `aios update` 刷新。

## 核心变更

- **memo 五要素抽取**：`fact` / `entities[]` / 绝对日期 / `evidence_ref` / `confidence`，一事一条；寒暄半成品不入库；修正精确替换。
- **验证评分回环**：`VALIDATION` 带 `score` / `complete` / `missing[]` 直灌下一轮；重试预算默认 3；解析失败自重问。
- **卡死自报**：每轮 `progress_made` + `blocked_reason`，连 3 轮无进展换路；`planning_interval` 默认 5。
- **压缩分级**：`FULL` / `PARTIAL` / `SUMMARY` / `EXCLUDED`，护最近 2 轮，压缩写审计事件。
- **弱模型钉死 + 预算**：旁路杂务钉死低成本模型；调度声明预算与超支行为。
- **节点 recipe**：七件头（tools/model/max_turns/budget/output_schema/retry/subflow），下游按 schema 触发。
- **planning ledger**（子模块）：每轮 ledger + partial 续跑 + 无重叠纪律；history 钉 LF。

## 升级说明

无破坏性变更。效能提升未实测，已验证不退化（子模块四套件全绿，父仓 10/10）。
