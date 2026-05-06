---
title: Superpowers
description: 让 CLI 更智能的可复用自动化技能，按使用场景分类整理。
---

# Superpowers

Superpowers 是可复用的技能，用于自动化常见工作流。它们接入 Claude Code、Codex、Gemini CLI 和 OpenCode 来自动处理重复任务。

不用再重复输入相同的命令或提示，只需调用一个技能，它会引导 AI 完成经过验证的工作流、强制执行最佳实践，并在完成前验证结果。

---

## 🚀 快速开始场景

用于开启新任务时快速理清思路和规划的技能。

<div class="skill-grid">
  <div class="skill-card skill-card--start">
    <div class="skill-card__header">
      <div class="skill-card__icon">💡</div>
      <div class="skill-card__name">brainstorming</div>
    </div>
    <div class="skill-card__desc">在开始任何创意工作前，锁定你的意图。探索上下文、逐一询问澄清问题、提出带权衡的方案，并在编码前获得批准。</div>
    <div class="skill-card__example">帮我用 brainstorming 想想这个功能怎么做</div>
  </div>
  <div class="skill-card skill-card--start">
    <div class="skill-card__header">
      <div class="skill-card__icon">📝</div>
      <div class="skill-card__name">writing-plans</div>
    </div>
    <div class="skill-card__desc">将需求转化为可执行计划。分析需求、拆分为顺序步骤、识别依赖关系，并输出详细的计划文档。</div>
    <div class="skill-card__example">用 writing-plans 把这个需求拆成步骤</div>
  </div>
</div>

---

## 🐛 调试排错场景

用于修复 bug 和确保证据而非猜测来保证质量的技能。

<div class="skill-grid">
  <div class="skill-card skill-card--debug">
    <div class="skill-card__header">
      <div class="skill-card__icon">🔍</div>
      <div class="skill-card__name">systematic-debugging</div>
    </div>
    <div class="skill-card__desc">用证据修复 bug。收集症状和错误信息、形成假设、系统性地测试，并验证修复有效。</div>
    <div class="skill-card__example">遇到 bug 了，用 systematic-debugging</div>
  </div>
  <div class="skill-card skill-card--debug">
    <div class="skill-card__header">
      <div class="skill-card__icon">✅</div>
      <div class="skill-card__name">verification-before-completion</div>
    </div>
    <div class="skill-card__desc">绝不在没有证据的情况下声称完成。运行验证命令、确认输出符合预期，在声称成功前要求具体证据。</div>
    <div class="skill-card__example">完成前用 verification-before-completion 验证一下</div>
  </div>
</div>

---

## ⚡ 效率提升场景

用于更快运行和大规模协作的技能。

<div class="skill-grid">
  <div class="skill-card skill-card--efficiency">
    <div class="skill-card__header">
      <div class="skill-card__icon">⚡</div>
      <div class="skill-card__name">dispatching-parallel-agents</div>
    </div>
    <div class="skill-card__desc">同时运行多个独立任务。识别独立工作流、启动并行 agent、聚合结果，并优雅地处理失败。</div>
    <div class="skill-card__example">用 dispatching-parallel-agents 并行处理这个</div>
  </div>
  <div class="skill-card skill-card--efficiency">
    <div class="skill-card__header">
      <div class="skill-card__icon">👥</div>
      <div class="skill-card__name">team-ops</div>
    </div>
    <div class="skill-card__desc">使用 HUD 和团队状态工具监控和管理多 agent 协作。查看实时会话状态、追踪结果，并发现技能改进候选。</div>
    <div class="skill-card__example">查看 team-ops 监控面板</div>
  </div>
</div>

---

## 🔒 安全合规场景

用于确保自动化安全的技能。

<div class="skill-grid">
  <div class="skill-card skill-card--security">
    <div class="skill-card__header">
      <div class="skill-card__icon">🔒</div>
      <div class="skill-card__name">security-scan</div>
    </div>
    <div class="skill-card__desc">在自动化前检查配置的安全问题。扫描技能、钩子、MCP 设置，识别暴露的密钥，并提供修复建议。</div>
    <div class="skill-card__example">运行 security-scan 检查配置安全</div>
  </div>
</div>

---

## 如何使用

1. **需要 Superpower 时，自然地说出来** — AI 会识别意图并自动调用技能。
2. **技能会自动引导你** 完成经过验证的工作流。
3. **结果会保存** 到你的项目记忆中供将来参考。

### 示例命令

```
"帮我用 brainstorming 想想这个功能怎么做"
"用 writing-plans 把这个需求拆成步骤"
"遇到 bug 了，用 systematic-debugging"
"完成前用 verification-before-completion 验证一下"
"用 dispatching-parallel-agents 并行处理这个"
"运行 security-scan 检查配置安全"
```

---

## RL Training System

AIOS 包含多环境强化学习系统。它在 shell、浏览器和编排器任务中使用统一的控制平面训练共享的学生策略。

详情请参阅[架构页面](architecture.md#rl-training-layer-aios)。

---

## 更多阅读

- [官方案例库](case-library.md) - 真实使用示例
- [ContextDB](contextdb.md) - 记忆如何跨会话持久化
- [多 Agent 实战](team-ops.md) - 多 agent 协作详情
