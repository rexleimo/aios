---
title: "Model Router：Agent Team 的智能多模型调度层"
description: "推出 Model Router — 根据能力、成本和历史成功率将子任务匹配到最优模型的智能调度层，支持自动 CLI 协议选择。"
date: 2026-05-08
tags: ["model-router", "multi-model", "Agent Team", "orchestration", "dispatch", "AIOS"]
---

# Model Router：Agent Team 的智能多模型调度层

每个 coding agent 都有不同的能力形状。Claude Opus 擅长代码审查和架构设计。DeepSeek-V4 快速且便宜，适合写代码。Gemini-3-Pro 能处理 100 万 token 的研究文档。GPT-5.5 是六边形战士，什么都能做。

但问题来了：**你的编排器得记住哪个模型最适合哪种任务**，而且 CLI 命令也要写对。`claude --model <name>` vs `codex --yolo -m <name>` vs `gemini -m <name>`。8 个模型、12 种任务类型、按成本排序的降级链——没有工具辅助，任何人（或 agent）都记不住。

**Model Router** 用一个 agent 可直接调用的简单调度层解决了这个问题。

## 工作原理

Model Router 是一个四步流水线：

1. **分析** — 读取子任务描述，匹配任务类型（代码审查、代码实现、研究等）
2. **路由** — 按能力匹配选择首选模型，附带按成本升序排列的降级链
3. **派发** — 根据模型所属协议自动生成正确的 CLI 命令
4. **学习** — 将调度结果记录到 ContextDB，用于历史成功率反馈

```bash
# 从描述自动检测任务类型
node scripts/aios.mjs model-router route --task "审查 auth.js 的安全漏洞"
# → security-review → Claude Opus (首选)
# → 降级链: GPT-5.5 → GLM-5.1

node scripts/aios.mjs model-router route --task "实现一个用户登录接口"
# → implementation → DeepSeek-V4 (首选)
# → 降级链: GPT-5.5 → Claude Sonnet

node scripts/aios.mjs model-router route --task "研究 React 19 迁移方案"
# → research → Gemini-3-Pro (首选)
# → 降级链: GPT-5.5 → Kimi K2.6
```

## 模型能力注册表

路由器内置了涵盖 8 个模型的能力注册表：

| 模型 | 最擅长 | 成本 |
|------|--------|------|
| **Claude Opus 4.7** | 代码审查、架构设计、安全审计 | 最高 |
| **Claude Sonnet 4.6** | 日常开发、RAG、快速原型 | 中 |
| **GPT-5.5** | 六边形战士：自动化、推理、通用 | 最高 |
| **DeepSeek-V4-Pro** | 算法实现、核心逻辑、批处理 | 最低 |
| **GLM-5.1** | 数学推理、自主循环、系统规划 | 低 |
| **Kimi K2.6** | 多 Agent 编排、前端 UI | 低 |
| **MiniMax-M2.7** | 自愈运维、生产恢复 | 低 |
| **Gemini-3-Pro** | 多模态分析、长文档研究、1M 上下文 | 中 |

每个模型条目包含其 CLI 协议 — `claude`、`codex` 或 `gemini` — 路由器始终生成正确的命令。

## 三种 CLI 协议，自动选择

| 协议 | CLI 模板 | 使用者 |
|------|---------|--------|
| **codex** | `codex --yolo -m <模型名> -p "<提示词>"` | GPT-5.5 |
| **gemini** | `gemini -m gemini-3-pro -p "<提示词>"` | Gemini-3-Pro |
| **claude** | `claude --model <模型名> -p "<提示词>"` | 其余所有模型 |

不用再纠结是 `-m` 还是 `--model` —— 路由器全自动处理。

## 环境变量覆盖

无需修改配置文件即可按角色覆盖：

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

解析优先级：**环境变量** > **preferredModel**（agent 角色卡） > **model**（兜底）。

## 感知反馈循环

每次调度都记录为 `model.dispatch` 事件：

```json
{
  "kind": "model.dispatch",
  "modelId": "claude-opus",
  "taskType": "code-review",
  "success": true,
  "latencyMs": 4500,
  "costEstimate": "high"
}
```

随着时间推移，感知系统按任务类型计算模型成功率。未来的路由决策将综合考虑：**能力匹配 × 历史成功率 × 成本**。

## Agent 集成

Model Router 通过 AIOS Task Router 注入 Agent 上下文。任何通过 `ctx-agent` 运行的 Agent 都会自动获取模型路由指引。当派发子任务时，Agent 可调用 `model-router` skill 确定最优模型。

Agent 角色卡（`.claude/agents/*.md`）包含 `preferredModel` 字段：

```yaml
# .claude/agents/rex-reviewer.md
model: sonnet
preferredModel: claude-opus
```

## 快速开始

```bash
# 查看所有模型和能力
node scripts/aios.mjs model-router list

# 将任务路由到最优模型
node scripts/aios.mjs model-router route --task "你的任务描述"

# 查看调度统计
node scripts/aios.mjs model-router stats
```

Model Router 已在 RexCLI v1.8.0 中可用。详见[完整文档](https://cli.rexai.top/zh/model-router/)了解配置、路由规则和集成细节。
