---
title: 模型路由器
description: 各任务自动选择合适的 AI 模型 - 无需自己思考。
---

# 模型路由器

**不同的 AI 模型擅长不同的事情。** 模型路由器自动将每个任务发送到最擅长的模型。

前端工作？用 Kimi K2.6。安全审查？用 Claude Opus。浏览器自动化？用 GPT-5.5。不需要记住这些 — 路由器从任务描述中判断。

## 简单版本

```bash
# 将任务路由到最优模型
node scripts/aios.mjs model-router route \
  --task "构建一个漂亮的落地页组件" \
  --explain

# 结果: frontend → kimi-k2.6（因为检测到"落地页"、"组件"、"漂亮"）
```

就是这样。路由器读取任务，检测信号，选择最优模型。

## 为什么不重要

没有模型路由器，你需要：

1. 知道每个任务类型最适合哪个模型
2. 在 `codex`、`claude`、`gemini` 命令之间手动切换
3. 记住每个 CLI 的正确模型标志

有了模型路由器，只需描述任务，剩下的由它处理。

## 工作原理

```
任务描述
    ↓
信号检测（"browser"、"security"、"frontend" 等关键词）
    ↓
任务类型分类（browser-automation、code-review 等）
    ↓
模型选择（基于路由配置文件）
    ↓
CLI 命令生成（codex/claude/gemini 的正确标志）
    ↓
执行 + 结果记录
```

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
| **codex** | `codex exec --dangerously-bypass-approvals-and-sandbox -m <模型名> "<提示词>"` | GPT-5.5 |
| **gemini** | `gemini -m gemini-3-pro -p "<提示词>"` | Gemini-3-Pro |
| **claude** | `claude --model <模型名> -p "<提示词>"` | 其余所有模型 |

Codex live worker 会默认附加 `--dangerously-bypass-approvals-and-sandbox`（当前等价于旧的 `--yolo` 快捷方式），避免后台子进程等待 approval/sandbox prompt。只有在手动调试 Codex 时才建议设置 `AIOS_SUBAGENT_CODEX_UNATTENDED=0` 关闭。

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

## 路由配置文件

选择路由的积极程度：

| 配置 | 使用时机 | 行为 |
|------|----------|------|
| `balanced`（默认） | 大多数工作 | 强信号升级模型；普通编码保持廉价 |
| `premium` | 风险较高或不清楚的任务 | 更愿意使用 Opus 或 GPT-5.5 等高成本模型 |
| `budget` | 成本敏感的工作 | 除非任务真的需要强模型，否则优先使用廉价模型 |

```bash
# 每次命令使用
node scripts/aios.mjs model-router route --task "..." --profile premium --explain

# 或为会话设置
export AIOS_MODEL_ROUTER_PROFILE=premium
```

## 快速开始

### 查看所有模型

```bash
node scripts/aios.mjs model-router list
```

### 带解释的任务路由

```bash
node scripts/aios.mjs model-router route \
  --task "构建一个漂亮的落地页组件" \
  --profile balanced \
  --explain
```

### 强制特定任务类型

```bash
node scripts/aios.mjs model-router route \
  --task "重构数据库连接" \
  --task-type implementation
```

### 查看调度历史

```bash
node scripts/aios.mjs model-router stats
```

## 为什么选择这个模型

在任何 route 命令后加 `--explain` 查看推理：

```json
{
  "resolvedType": "browser-automation",
  "modelId": "gpt-5.5",
  "confidence": 0.86,
  "matchedSignals": [
    { "taskType": "browser-automation", "signal": "browser", "weight": 8 }
  ],
  "why": ["检测到 browser-automation 信号: browser, upload"]
}
```

- **高置信度** = 一个任务类型明确匹配
- **多个 recommendedPhases** = 任务是复合的；分割以获得更好的路由
- **matchedSignals** 显示准确哪个关键词触发了路由

## 环境变量覆盖

如果想强制使用特定模型：

```bash
# 按角色
export AIOS_MODEL_PLANNER=claude-opus
export AIOS_MODEL_IMPLEMENTATION=deepseek-v4
export AIOS_MODEL_REVIEWER=claude-opus

# 按任务类型
export AIOS_MODEL_BROWSER_AUTOMATION=gpt-5.5
export AIOS_MODEL_CODE_REVIEW=claude-opus

# 完全禁用路由（使用固定模型）
export AIOS_MODEL_ROUTER=0
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
| `scripts/lib/specs/model-registry.json` | 模型能力、路由规则、CLI 协议配置 |
| `scripts/lib/specs/orchestrator-agents.json` | Agent 角色→preferredModel 映射（schema v2） |
| `.claude/skills/model-router/SKILL.md` | Agent 可调用的自助路由 skill |
| `.claude/agents/*.md` | 包含 preferredModel frontmatter 的 Agent 角色卡 |
| `scripts/lib/model-router.mjs` | 路由器逻辑：匹配、降级、CLI 构建、统计 |

## 常见问题

### 为什么一切都路由到 DeepSeek？

在 `balanced` 配置下，普通实现任务会路由到 DeepSeek（因为它便宜且好）。对于需要更强模型的任务，使用 `--profile premium`。

### 我的任务有多个部分，只得到一个模型

目前复合任务获得一个模型。检查 explain 输出中的 `recommendedPhases` — 如果显示多个类型，将工作分割成单独的任务。

### 我可以将它用于 Agent Team 吗？

可以。Agent Team 默认使用模型路由器 — 团队的每个阶段自动路由到最优模型。

## 下一步

- [Agent Team](team-ops.md) — 带自动路由的多 agent 协作
- [ContextDB](contextdb.md) — 项目内存
- [Solo Harness](solo-harness.md) — 长时间运行的单个 agent 工作