---
title: 模型路由器
description: 多模型 Agent Team 的智能模型调度 — 根据能力、成本和历史成功率将任务匹配到最优模型。
---

# 模型路由器

> 不要为每个模型记忆 CLI 命令。教你的 Agent 自动将任务路由到正确的模型。

模型路由器是 Agent Team 的智能调度层。它维护模型能力注册表，将子任务匹配到最佳模型，以正确的协议生成 CLI 命令，并通过感知反馈循环从调度历史中学习。

## 工作原理

1. **分析** — Agent 读取子任务，匹配任务类型（代码审查、实现、研究等）
2. **路由** — 模型路由器按能力匹配选择首选模型，附带按成本升序的降级链
3. **派发** — 根据模型所属协议自动生成正确的 CLI 命令
4. **学习** — 调度结果记录到感知层，未来路由会参考历史成功率

## 模型能力注册表

注册表包含 8 个模型及其结构化能力：

| 模型 | 协议 | 最擅长 | 成本 |
|------|------|--------|------|
| **Claude Opus 4.7** | claude | 代码审查、架构设计、安全审计 | 最高 |
| **Claude Sonnet 4.6** | claude | 日常开发、RAG、快速原型 | 中 |
| **GPT-5.5** | codex | 六边形战士：自动化、推理、代码全能 | 最高 |
| **DeepSeek-V4-Pro** | claude | 算法实现、核心逻辑、批处理 | 最低 |
| **GLM-5.1** | claude | 数学推理、自主循环、系统规划 | 低 |
| **Kimi K2.6** | claude | 多Agent编排、前端UI、长周期执行 | 低 |
| **MiniMax-M2.7** | claude | 自愈运维、生产恢复 | 低 |
| **Gemini-3-Pro** | gemini | 多模态分析、长文档研究、1M上下文 | 中 |

## CLI 协议

三种协议，由 provider 自动选择：

| 协议 | CLI | 使用者 |
|------|-----|--------|
| **codex** | `codex --yolo -m <模型名> -p "<提示词>"` | GPT-5.5 |
| **gemini** | `gemini -m gemini-3-pro -p "<提示词>"` | Gemini-3-Pro |
| **claude** | `claude --model <模型名> -p "<提示词>"` | 其余所有模型 |

## 路由规则

| 任务类型 | 首选模型 | 降级链 |
|----------|----------|--------|
| 代码审查 | Claude Opus | GPT-5.5 → GLM-5.1 |
| 安全审计 | Claude Opus | GPT-5.5 → GLM-5.1 |
| 架构设计 | Claude Opus | GPT-5.5 → GLM-5.1 |
| 写代码/实现 | DeepSeek-V4 | GPT-5.5 → Claude Sonnet |
| 浏览器自动化 | GPT-5.5 | Kimi K2.6 → Claude Sonnet |
| 调研/研究 | Gemini-3-Pro | GPT-5.5 → Kimi K2.6 |
| 规划/方案 | GLM-5.1 | GPT-5.5 → Claude Opus |
| 测试/QA | Claude Sonnet | GPT-5.5 → DeepSeek-V4 |
| 文档编写 | Claude Sonnet | GPT-5.5 → Kimi K2.6 |
| 前端/UI | Kimi K2.6 | GPT-5.5 → Claude Sonnet |
| 故障恢复 | MiniMax-M2.7 | GLM-5.1 → GPT-5.5 |
| 通用兜底 | GPT-5.5 | Claude Sonnet → DeepSeek-V4 |

## 快速开始

### 查看模型注册表

```bash
node scripts/aios.mjs model-router list
```

### 将任务路由到最优模型

```bash
# 从描述自动检测任务类型
node scripts/aios.mjs model-router route --task "审查 auth.js 的安全漏洞"

# 显式指定任务类型
node scripts/aios.mjs model-router route --task "重构数据库连接" --task-type implementation
```

### 查看调度统计

```bash
node scripts/aios.mjs model-router stats
```

## 环境变量覆盖

无需修改配置文件即可按角色覆盖模型选择：

```bash
export AIOS_MODEL_PLANNER=claude-opus
export AIOS_MODEL_IMPLEMENTATION=deepseek-v4
export AIOS_MODEL_REVIEWER=claude-opus
export AIOS_MODEL_SECURITY_REVIEWER=claude-opus
```

或按任务类型：

```bash
export AIOS_MODEL_CODE_REVIEW=claude-opus
export AIOS_MODEL_RESEARCH=gemini-3-pro
export AIOS_MODEL_GENERAL=gpt-5.5
```

## Agent 集成

### 通过任务路由引导

模型路由器通过 AIOS Task Router 注入 Agent 上下文。任何运行在 `ctx-agent` 下的 Agent 会自动获得模型调度指引。当派发子任务时，Agent 可调用 `model-router` skill 确定最优模型。

### 通过编排器

Agent 角色卡（`.claude/agents/*.md`）包含 `preferredModel` 字段，编排器在派发时自动解析：

```yaml
# .claude/agents/rex-reviewer.md
model: sonnet
preferredModel: claude-opus
```

模型解析优先级：**环境变量** > **preferredModel** > **model**（兜底）。

## 感知反馈循环

每次模型调度都记录为 ContextDB 中的 `model.dispatch` 事件。感知系统可按任务类型计算模型成功率。未来路由决策将综合：**能力匹配 × 历史成功率 × 成本**。

## 配置文件

| 文件 | 用途 |
|------|------|
| `memory/specs/model-registry.json` | 模型能力、路由规则、CLI 协议配置 |
| `memory/specs/orchestrator-agents.json` | Agent 角色→preferredModel 映射（schema v2） |
| `.claude/skills/model-router/SKILL.md` | Agent 可调用的自助路由 skill |
| `.claude/agents/*.md` | 包含 preferredModel frontmatter 的 Agent 角色卡 |
| `scripts/lib/model-router.mjs` | 路由器逻辑：匹配、降级、CLI 构建、统计 |
