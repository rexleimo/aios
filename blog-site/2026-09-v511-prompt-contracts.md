---
title: v5.11.0 提示词契约加固——让模型自报状态，不再靠猜
date: 2026-09-06
description: "v5.11.0 是纯提示词版本：7 组 skill 契约升级，包含记忆五要素抽取、验证评分回环、卡死自报、压缩分级、弱模型钉死、节点 recipe 与 planning ledger。零运行时改动、无破坏性变更，升级只需拉取仓库再刷新客户端投影。"
---

# v5.11.0 提示词契约加固——让模型自报状态，不再靠猜

> 2026-09-06 · 纯提示词版本：7 组 skill 契约升级，零运行时改动，无破坏性变更。

## 快速答案（30 秒版）

v5.11.0 把 16 仓竞品审计里"只值得抄提示词的那一半"落地了：记忆怎么写、验证怎么判、卡死怎么报、上下文怎么压、便宜模型怎么钉死——全部写成模型自报的结构化契约，runtime 只验客观事实（退出码、schema、哈希），不猜语义。升级动作只有两行：拉取后重跑一次安装同步，`rex-planning` 投影自动刷新。

```bash
git pull
node scripts/sync-skills.mjs
# rex-planning 投影随 aios setup / aios update 刷新
```

## 为什么发这个版本

v5.10.0 的审计留下 7 条"提示词层就能收"的改进（竞品报告 P0–P2 里不碰 runtime 的那一半）。 verdict 只有一次性判定、记忆写入无门槛、长循环卡死无感知、压缩无分级、调度无预算——这些不是缺代码，是缺契约。本版逐条补上，每条都符合北极星：语义判断模型自报，代码只验客观事实。四条禁区一条没碰：按内容自动选模型、正则抽实体、LLM 判死循环、规则匹配消息语义。

## 核心变更

### 1. memo：五要素抽取契约

落库条目五要素：`fact` / `entities[]` / 绝对日期 / `evidence_ref` / `confidence`，一事一条。寒暄、半成品、无证据断言不入库；修正走精确替换 + `--supersedes`，日志只追加。harness 只存不验——schema 校验是代码活，进下一批。

### 2. verification-loop：评分回环

`VALIDATION` 加 `score` / `complete` / `missing[]`，reject 的 missing 直灌下一轮；重试预算默认 3，耗尽停手交接；解析失败（缺段/空段）走结构化自重问模板，只补格式不免检。四段 header 名未动，机检 validator 零改。

### 3. aios-long-running-harness：卡死自报

每轮 observations 自报 `progress_made` + `blocked_reason`，连续 3 轮 false 即换路或上报；同调用连发两次直接标无进展；`planning_interval` 默认 5，每 5 步重出 frontier 并 checkpoint 化。LLM 判死循环、关键词匹配一律不做。

### 4. contextdb-autopilot：压缩分级

`FULL` / `PARTIAL` / `SUMMARY` / `EXCLUDED` 四档 oldest-first，模型声明档位；最近 2 轮不低于 `PARTIAL`；摘要 agent 可见且带证据可回取，原文永留 session；每次压缩写审计事件（range + tier + refs）。

### 5. model-router：弱模型钉死 + 预算声明

摘要/标题/记忆抽取钉死 DeepSeek-V4，文档/例行评审钉死 Sonnet，fallback 只降不升；仅浏览器/长上下文/安全/生产恢复四类硬约束可打破。调度声明 `budget` / `quota_scope` / `downgrade|fail-fast`，无声明即无熔断。

### 6. aios-work-dispatch：节点 recipe 头

并行节点先声明 `tools` 白名单、`model` + `task-type`、`max_turns`、`budget`、`output_schema`、`retry`、`subflow` 七件，无头不派发；下游按 schema 产物触发，不读散文式 handoff。

### 7. rex-planning：progress ledger（子模块）

每轮输出 `{is_complete, in_progress[], facts[], assignment}`，空 facts 如实上报；超限/失败节点返 partial + 续跑句柄；`parallelGroups` 不重叠不伪造依赖。附带 `projection-history.json` 钉 LF，新 digest 追加、旧 digest 留作回滚。

## 升级说明

无破坏性变更，零运行时改动。拉取后：`node scripts/sync-skills.mjs` 已验证 8 面投影一致；`rex-planning` 投影随下一次 `aios setup` / `aios update` 刷新。门禁证据：子模块 skills/contract/scenarios/architecture 全绿 + doctor 零错，父仓 `agents-source-tree` 10/10。

## FAQ

**Q: 提示词改动能带来可测量的提升吗？**
A: 诚实回答：没有实测。验证过的只有"不退化"（上述全绿套件）。提升依据是 16 仓竞品审计的映射关系，属于推理而非证据；要确定性结论需跑 SkillOpt eval 或线上对照。

**Q: 为什么 P0 的 runtime 改造（hook 门、CheckpointSaver、记忆四件套代码侧）没进本版？**
A: 行为大改需独立 plan + provider 契约评审 + skill 认证，按 09-06 审核结论进 5.12+。本版只收提示词半。

**Q: `rex-planning` 本地投影还是旧的？**
A: 正常。父仓只 bump 了子模块指针，客户端投影由安装生命周期刷新，跑一次 `aios setup` 或 `aios update` 即可。

**Q: 这版动了哪些文件？**
A: 父仓 5 个 `skill-sources/*/SKILL.md` + CHANGELOG 镜像 + 本篇博客；子模块 `rex-planning/SKILL.md` + `projection-history.json` + `.gitattributes` 一行。生成目录全是弃置重建物，未入库。

## 相关链接

- 项目：`https://github.com/rexleimo/aios`（以仓库实际地址为准）
- 更新日志：`docs-site/changelog.md` / `docs-site/zh/changelog.md`
- 竞品审计底稿：`docs/reports/2026-09-05-competitor-orchestration-analysis.md`
