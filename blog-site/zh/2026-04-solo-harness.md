---
title: "Solo Harness：把任务丢给 Agent，去睡觉，早上查结果"
description: "AIOS 1.7 新增过夜 Agent 运行模式，带日志、启停控制和 git worktree 隔离。"
date: 2026-04-26
tags: ["AIOS", "Solo Harness", "长时运行 Agent", "ContextDB"]
---

# Solo Harness：把任务丢给 Agent，去睡觉，早上查结果

Coding agent 处理短任务很在行。"修这个 bug"、"写这个函数"、"重构这个文件"——几分钟搞定。

但更大的目标呢？"重构整个 auth 模块并写测试。"这是几小时的活。你不可能一直盯着。

**Solo Harness 让你把大任务交接出去，做完再回来看。**

## 旧方式 vs 新方式

**以前：** 你启动一个长任务，去睡觉，第二天醒来面对……一团未知。也许跑完了，也许卡住了，也许把你的 git 历史搞得一团糟。你完全不知道发生了什么。

**现在：** 你用 `--worktree` 启动一次 harness 运行，去睡觉，第二天早上：

- 查看**运行日志**，了解具体发生了什么
- 查看**结构化状态**，确认是否完成
- 如果卡住了——从断点**恢复**
- 如果跑偏了——**删除 worktree**，你的主分支毫发无伤

## 工作方式

```bash
# 晚上：启动运行
aios harness run \
  --objective "重构 auth 模块并编写集成测试" \
  --session nightly-auth \
  --worktree

# 早上：查看运行情况
aios harness status --session nightly-auth --json

# 如果完成了：查看变更
aios hud --session nightly-auth

# 如果卡住了：修复问题后恢复
aios harness resume --session nightly-auth --max-iterations 10
```

## 为什么 `--worktree` 很重要

`--worktree` 这个标志很关键。它会在一个独立副本里创建你的仓库，agent 可以自由修改。

- **结果好？** 把 worktree 合并到主分支
- **结果差？** 直接删除 worktree——对代码零影响

不需要 `git reset --hard`。不需要冒险清理。就是安全的隔离。

## 会记录什么

每次 harness 运行都会写日志：

```
memory/context-db/sessions/<session-id>/artifacts/solo-harness/
  ├── objective.md           # 你让它做什么
  ├── run-summary.json       # 当前状态和进度
  ├── control.json           # 停止请求和备注
  ├── iteration-0001.json    # 每轮迭代发生了什么
  └── iteration-0001.log     # 详细日志
```

这给了你一条**可读的交接记录**——不是"agent 跑了一会儿"，而是它做了什么、什么有效、什么没用。

## 什么时候用 Solo Harness

**适合用：**
- 你有一个明确的大目标需要很长时间
- 任务不需要拆分给多个 agent
- 你想一觉醒来拿到结果，而不是全程盯着

**不适合用：**
- 任务能拆成独立的部分（用 [Agent Team](https://cli.rexai.top/zh/team-ops/)）
- 你还在理需求（先用普通会话）
- 你需要带质量关卡的阶段性执行（用 orchestrate）

## 试试看

```bash
# 先用 dry-run 确认一切就绪
aios harness run \
  --objective "为支付模块编写集成测试" \
  --session test-dry \
  --worktree \
  --dry-run --json

# 准备好了，正式开始
aios harness run \
  --objective "为支付模块编写集成测试" \
  --session payment-tests \
  --worktree \
  --max-iterations 20
```

---

*Solo Harness 在 AIOS 1.7 中发布。阅读[完整文档](https://cli.rexai.top/zh/solo-harness/)或今晚就试试。*
