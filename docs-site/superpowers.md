---
title: Superpowers
description: Reusable automation skills that make your CLI smarter, organized by use case.
---

# Superpowers

Superpowers are reusable skills that automate common workflows. They hook into Claude Code, Codex, Gemini CLI, and OpenCode to handle repetitive tasks automatically.

Instead of repeating the same commands or prompts, invoke a skill that guides the AI through a proven workflow, enforces best practices, and validates results before completion.

---

## 🚀 Getting Started

Skills for kicking off new work with clarity and structure.

<div class="skill-grid">
  <div class="skill-card skill-card--start">
    <div class="skill-card__header">
      <div class="skill-card__icon">💡</div>
      <div class="skill-card__name">brainstorming</div>
    </div>
    <div class="skill-card__desc">Before starting any creative work, lock in your intent. Explore context, ask clarifying questions, propose approaches with trade-offs, and get approval before coding.</div>
    <div class="skill-card__example">帮我用 brainstorming 想想这个功能怎么做</div>
  </div>
  <div class="skill-card skill-card--start">
    <div class="skill-card__header">
      <div class="skill-card__icon">📝</div>
      <div class="skill-card__name">writing-plans</div>
    </div>
    <div class="skill-card__desc">Turn requirements into executable plans. Analyze requirements, break into sequential steps, identify dependencies, and output a detailed plan document.</div>
    <div class="skill-card__example">用 writing-plans 把这个需求拆成步骤</div>
  </div>
</div>

---

## 🐛 Debugging & Verification

Skills for fixing bugs and ensuring quality with evidence, not guesswork.

<div class="skill-grid">
  <div class="skill-card skill-card--debug">
    <div class="skill-card__header">
      <div class="skill-card__icon">🔍</div>
      <div class="skill-card__name">systematic-debugging</div>
    </div>
    <div class="skill-card__desc">Fix bugs with evidence. Gather symptoms and error messages, form hypothesis, test systematically, and verify the fix works.</div>
    <div class="skill-card__example">遇到 bug 了，用 systematic-debugging</div>
  </div>
  <div class="skill-card skill-card--debug">
    <div class="skill-card__header">
      <div class="skill-card__icon">✅</div>
      <div class="skill-card__name">verification-before-completion</div>
    </div>
    <div class="skill-card__desc">Never claim work is done without evidence. Run verification commands, confirm output matches expectations, and require concrete evidence before success claims.</div>
    <div class="skill-card__example">完成前用 verification-before-completion 验证一下</div>
  </div>
</div>

---

## ⚡ Efficiency & Collaboration

Skills for running faster and working together at scale.

<div class="skill-grid">
  <div class="skill-card skill-card--efficiency">
    <div class="skill-card__header">
      <div class="skill-card__icon">⚡</div>
      <div class="skill-card__name">dispatching-parallel-agents</div>
    </div>
    <div class="skill-card__desc">Run multiple independent tasks at once. Identify independent workstreams, launch parallel agents, aggregate results, and handle failures gracefully.</div>
    <div class="skill-card__example">用 dispatching-parallel-agents 并行处理这个</div>
  </div>
  <div class="skill-card skill-card--efficiency">
    <div class="skill-card__header">
      <div class="skill-card__icon">👥</div>
      <div class="skill-card__name">team-ops</div>
    </div>
    <div class="skill-card__desc">Monitor and manage multi-agent collaborations with HUD and Team status tools. View real-time session status, track outcomes, and discover skill improvement candidates.</div>
    <div class="skill-card__example">查看 team-ops 监控面板</div>
  </div>
</div>

---

## 🔒 Security & Compliance

Skills for keeping your automation safe.

<div class="skill-grid">
  <div class="skill-card skill-card--security">
    <div class="skill-card__header">
      <div class="skill-card__icon">🔒</div>
      <div class="skill-card__name">security-scan</div>
    </div>
    <div class="skill-card__desc">Check your config for security issues before automation. Scan skills, hooks, MCP settings, identify exposed secrets, and suggest fixes.</div>
    <div class="skill-card__example">运行 security-scan 检查配置安全</div>
  </div>
</div>

---

## How to Use

1. **When you need a superpower, just ask naturally** — the AI will recognize the intent and invoke the skill.
2. **The skill guides you through** the proven workflow automatically.
3. **Results are saved** to your project memory for future reference.

### Example Commands

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

AIOS includes a multi-environment reinforcement learning system. It trains a shared student policy across shell, browser, and orchestrator tasks using a unified control plane.

See the [Architecture page](architecture.md#rl-training-layer-aios) for details.

---

## Read More

- [Case Library](case-library.md) - Real-world usage examples
- [ContextDB](contextdb.md) - How memory persists across sessions
- [Agent Team & HUD](team-ops.md) - Multi-agent collaboration details
