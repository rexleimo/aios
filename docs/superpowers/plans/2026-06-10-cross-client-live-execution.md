# 全客户端真正适配执行 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` if this plan is resumed later.

**Goal:** 让跨客户端执行链路对真实 CLI 契约保持诚实：`crush` 按已验证用法接入，`antigravity` 在真实安装验证前继续保持 `pending-smoke`。

**Architecture:** 分三层推进。第一层是提示词与技能投影的跨客户端中立化；第二层是运行时接线与 `pending-smoke` 阻断；第三层是基于 smoke evidence 的后续放开。当前只完成前两层中的“已验证部分”。

**Tech Stack:** Node.js ESM, `node:test`, repo-local AIOS CLI/runtime.

---

## 当前结论

- `crush` 已在本机通过 `crush --help` / `crush run --help` 核实，真实非交互契约是 `crush run [prompt...]`。
- 之前把 `crush` 类比成 `-p` prompt flag 的接法是错误的，现已修正。
- `antigravity` 当前没有本机安装证据，也没有 `--help` / smoke 证据，因此不能宣称已可执行。
- `pending-smoke` 不仅要挡 `ctx-agent`，也要挡 harness/subagent 路径，避免“文档说未启用，运行时却能偷偷执行”。

## 已完成

### A. 提示词 / 技能中立化

- 相关 skill source 与同步逻辑已调整为跨客户端表述。
- 技能/原生输出同步与相关测试已通过。

### B. 运行时修正

- `crush` one-shot / subagent / smoke 全部改为 `crush run ...` 形态。
- `antigravity` 不再伪造未验证的 one-shot handler / harness 策略。
- subagent runtime 新增 `pending-smoke` 阻断，避免绕过 `ctx-agent`。
- workspace memory session 创建逻辑已修复，不再把对象参数写成 `workspace-memory--[object-object]`。

### C. 验证状态

- 重点测试通过：
  - `scripts/tests/client-smoke.test.mjs`
  - `scripts/tests/ctx-agent-pending-smoke.test.mjs`
  - `scripts/tests/aios-state-root.test.mjs`
  - `scripts/tests/ctx-agent-core.test.mjs`
- 全量脚本测试通过：`npm run test:scripts`

## 仍然保持未完成 / 未放开的部分

- `antigravity` 仍然是 `pending-smoke`
- `PENDING_SMOKE_CLIENTS` 还不能移除 `antigravity`
- 没有真实安装与 CLI 证据前，不应补回 `antigravity` 的 live handler / unattended args / smoke probe

## 后续任务

### Task 1: 补 `antigravity` 真实证据

- 在真实环境安装 `antigravity`
- 收集：
  - `antigravity --help`
  - 可行的非交互 prompt 语法
  - MCP 配置实际落点
  - skills / instruction file 实际继承关系

### Task 2: 基于证据接入 `antigravity`

- 仅在 Task 1 完成后，再决定是否补：
  - `ctx-agent` one-shot handler
  - harness/subagent invocation strategy
  - smoke probe
  - unattended args

### Task 3: smoke 通过后再翻转 gating

- `scripts/lib/clients/capability-report.mjs`
- `scripts/lib/ctx-agent-core/one-shot.mjs`
- 必要的测试断言

## 验证命令

```bash
node --test \
  scripts/tests/client-smoke.test.mjs \
  scripts/tests/ctx-agent-pending-smoke.test.mjs \
  scripts/tests/aios-state-root.test.mjs \
  scripts/tests/ctx-agent-core.test.mjs

npm run test:scripts
```

## 诚实边界

- 当前可以说：`crush` 接线已按真实 CLI 修正，且测试通过。
- 当前不能说：`antigravity` 已经完成 live execution 适配。
- 后续任何关于 `antigravity` 的放开，都必须先基于真实安装与 smoke evidence，而不是类比 Gemini/Crush 的参数形态。
