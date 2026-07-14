---
title: Superpowers
description: 让 CLI 更智能的可复用自动化技能，按使用场景分类整理。
---

# Superpowers 超能力

> **快速答案：** Superpowers 是一组可复用的工程 playbook，覆盖头脑风暴、写计划、TDD、调试、验证、并行委派和安全检查。先选工作流路由，再选择最小适用的技能，不要对每个问题都启动完整流程。

Superpowers 是可复用的技能，用于自动化常见工作流。它们接入 Claude Code、Codex、Gemini CLI 和 OpenCode 来自动处理重复任务。

不用再重复输入相同的命令或提示，只需调用一个技能，它会引导 AI 完成经过验证的工作流、强制执行最佳实践，并在完成前验证结果。

---

## 技能总览
## 如何使用技能
## 我应该使用哪个技能？
## 强化学习训练系统
## 下一步去哪里

- [官方案例库](case-library.md) - 真实使用示例
- [ContextDB](contextdb.md) - 记忆如何跨会话持久化
- [多 Agent 实战](team-ops.md) - 多 agent 协作详情

## 常见问题

### Superpowers 会自动处理每个问题吗？

不会。提问和状态查询可以保持 direct；只有需要设计、排序、调试、委派或交付证据时才选择 playbook。

### 技能安装在哪里？

仓库可发现技能放在 `.codex/skills/` 或 `.claude/skills/`，由支持的工作流负责同步到客户端。

## 官方文档

从[工作流策略](workflow-policy.md)开始，再看[快速开始](getting-started.md)和[Agent Team](team-ops.md)。
