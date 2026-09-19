---
title: 模型路由器
description: "模型路由器会按任务类型、路由档位、能力注册表与回退规则自动挑选合适的 AI 模型，省去记忆各家模型特长与配额限制的负担。需要知道为什么这样选时，用 --explain 查看完整决策依据再决定是否覆盖，配置文与能力注册表的位置也在文中给出。，改配置不用猜。"
---

# 模型路由器

> **快速答案：** 模型路由器根据任务类型、路由 profile、能力注册表和 fallback 规则选择模型。需要理解选择原因时使用 `--explain`；如果成本、延迟或能力要求不同，再使用 profile 或显式覆盖。

## 先运行可解释路由

第一次使用时优先运行带 explain 的路由。它会显示声明的任务类型、选中的模型和命中原因，让调度决策可以被复核，而不是看起来像魔法。

**不同的 AI 模型擅长不同的事情。** 模型路由器自动将每个任务发送到最擅长的模型。

前端工作？Claude Sonnet 5。安全审查？Claude Opus 5。浏览器自动化？GPT-6-Astra。不需要记住这些：由调用方声明任务类型（phase 角色、`--task-type` 或你直接指定），路由器再解析模型与客户端。

## 简单版本

```bash
# 将任务路由到最优模型
node scripts/aios.mjs model-router route \
  --task "构建一个漂亮的落地页组件" \
  --task-type frontend \
  --explain

# 结果: frontend -> claude-sonnet-5（客户端 `claude`，协议 `claude`）
```

就是这样。路由器把**声明的**任务类型解析成模型与可启动命令。

它刻意**不**从自由文本猜任务类型或意图：关键词猜测不可复核。因此
`scripts/lib/model-router/signals.mjs` 只接受显式声明，缺省回落到 `general`；
真正知道任务性质的是调用方（rex phase、team 角色、你）。

## 为什么不重要

没有模型路由器，你需要：

1. 知道每个任务类型最适合哪个模型
2. 在 `codex`、`claude`、`gemini` 命令之间手动切换
3. 记住每个 CLI 的正确模型标志

有了模型路由器，只需描述任务，剩下的由它处理。

## 工作原理

```
声明的任务类型（phase 角色、--task-type、显式 intent）
    ↓
路由规则查表（首选模型 + 降级链）
    ↓
profile 调整（balanced / premium / budget）+ 角色或环境变量覆盖
    ↓
客户端契约校验（启动方能否使用该模型协议）
    ↓
通道可用性校验（中转站这条通道当前是否健康）
    ↓
CLI 命令生成（该客户端正确的 --model/-m 参数）
    ↓
执行 + 结果回写通道可用性
```

## 模型能力注册表

注册表收录路由规则用到的 16 个模型；`node scripts/aios.mjs model-router` 打印完整实时清单。

| 模型 | 可说协议 | 最擅长 | 成本 | 上下文 |
|---|---|---|---|---|
| **Claude Opus 5** | `claude` | 代码审查, 架构设计, 安全审计 | 最高 | 200K |
| **Claude Opus 4.8** | `claude` | 代码审查, 安全审计, 长文写作 | 高 | 200K |
| **GPT-6-Astra** | `openai-response` | 全能位, 通用推理, 浏览器自动化 | 最高 | 1M |
| **Claude Sonnet 4.6** | `claude` | 日常开发, 快速原型, RAG | 中 | 200K |
| **GLM-5.2** | `claude`, `openai-chat` | 自主循环, 长程规划, 数学推理 | 低 | 200K |
| **Claude Opus 4.7** | `claude` | 代码审查, 架构设计, 安全审计 | 最高 | 200K |
| **DeepSeek-V4-Pro** | `claude` | 算法实现, 核心逻辑, 长日志分析 | 最低 | 1M |
| **Claude Sonnet 5** | `claude` | 日常开发, 快速原型, 前端 UI | 中 | 200K |
| **DeepSeek-V4-Flash** | `openai-chat`, `claude` | 算法实现, 批处理, 长日志分析 | 最低 | 1M |
| **GPT-5.5** | `openai-response` | 通用推理, 浏览器自动化, 桌面自动化 | 最高 | 1M |
| **Gemini-3.8-Flash** | `gemini` | 多模态分析, 长文档研究, 视频分析 | 中 | 1M |
| **GPT-5.6-Sol** | `openai-response` | 通用推理, 长周期执行, 代码执行 | 高 | 1M |
| **Claude Haiku 4.5** | `claude` | 分类, 摘要, 批处理 | 低 | 200K |
| **GLM-5.3-Flash** | `openai-chat` | 分类, 文档写作, 测试执行 | 最低 | 200K |
| **Kimi K2.6** | `claude` | 多 Agent 编排, 长周期执行, 前端 UI | 低 | 200K |
| **MiniMax-M2.7** | `claude` | 自愈恢复, 生产恢复, 持续优化 | 低 | 200K |

## CLI 协议

协议词表共四种；只有模型声明的协议与启动客户端可说协议相交，这条路由才可执行（见〈客户端模型路由契约〉）：

| 协议 | 中转站端点 | 可启动客户端 |
|---|---|---|
| `openai-response` | `https://coding.rexai.top/openai/v1/responses` | codex, opencode |
| `openai-chat` | `https://coding.rexai.top/openai/v1/chat/completions` | hermes, opencode, pi |
| `claude` | `https://coding.rexai.top/claude/v1/messages` | claude, hermes, opencode, pi |
| `gemini` | `https://coding.rexai.top/gemini/v1beta/models/<model>:generateContent` | opencode |

Codex live worker 会默认附加 `--dangerously-bypass-approvals-and-sandbox`（当前等价于旧的 `--yolo` 快捷方式），避免后台子进程等待 approval/sandbox prompt。只有在手动调试 Codex 时才建议设置 `AIOS_SUBAGENT_CODEX_UNATTENDED=0` 关闭。

## 路由规则

| 任务类型 | 首选模型 | 降级链 |
|---|---|---|
| `code-review` | **Claude Opus 5** | Claude Opus 4.8 → GPT-6-Astra → Claude Sonnet 4.6 |
| `security-review` | **Claude Opus 5** | Claude Opus 4.8 → GPT-6-Astra → GLM-5.2 |
| `architecture` | **Claude Opus 5** | GPT-6-Astra → GLM-5.2 → Claude Opus 4.7 |
| `implementation` | **DeepSeek-V4-Pro** | GPT-6-Astra → Claude Sonnet 5 → DeepSeek-V4-Flash |
| `browser-automation` | **GPT-6-Astra** | GPT-5.5 → Claude Sonnet 5 |
| `research` | **Gemini-3.8-Flash** | DeepSeek-V4-Pro → Claude Sonnet 5 → GPT-5.6-Sol |
| `planning` | **GLM-5.2** | GPT-6-Astra → Claude Opus 5 → Claude Opus 4.7 |
| `testing` | **Claude Haiku 4.5** | Claude Sonnet 5 → GLM-5.3-Flash → DeepSeek-V4-Flash |
| `docs` | **Claude Sonnet 5** | GLM-5.3-Flash → GPT-5.5 → Kimi K2.6 |
| `frontend` | **Claude Sonnet 5** | GPT-5.6-Sol → Kimi K2.6 → GPT-5.5 |
| `self-healing` | **GLM-5.2** | GPT-6-Astra → MiniMax-M2.7 → DeepSeek-V4-Pro |
| `general` | **GPT-6-Astra** | Claude Sonnet 5 → GLM-5.2 → DeepSeek-V4-Pro |

## 路由配置文件

选择路由的积极程度：

| 配置 | 使用时机 | 行为 |
|------|----------|------|
| `balanced`（默认） | 大多数工作 | 强信号升级模型；普通编码保持廉价 |
| `premium` | 风险较高或不清楚的任务 | 更愿意使用 Claude Opus 5 或 GPT-6-Astra 等高成本模型 |
| `budget` | 成本敏感的工作 | 除非任务真的需要强模型，否则优先使用廉价模型 |

```bash
# 每次命令使用
node scripts/aios.mjs model-router route --task "..." --profile premium --explain

# 或为会话设置
export AIOS_MODEL_ROUTER_PROFILE=premium
```

## 快速开始

### 查看注册表与路由规则

```bash
node scripts/aios.mjs model-router
```

### 带解释的任务路由

```bash
node scripts/aios.mjs model-router route \
  --task "构建一个漂亮的落地页组件" \
  --task-type frontend \
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

### 查看通道可用性状态

```bash
node scripts/aios.mjs model-router availability
```

## 为什么选择这个模型

在任何 route 命令后加 `--explain` 查看推理：

```json
{
  "resolvedType": "implementation",
  "modelId": "deepseek-v4",
  "model": "DeepSeek-V4-Pro",
  "clientId": "claude-code",
  "reason": "primary match for taskType=\"implementation\"",
  "profile": "premium",
  "confidence": 1,
  "matchedSignals": [],
  "why": ["Explicit task type selected: implementation"],
  "contractMode": "",
  "modelProtocols": ["claude"],
  "requestedModelId": "deepseek-v4",
  "skippedForCapability": []
}
```

- **`resolvedType`** 是从声明解析出的任务类型，不是关键词推断的证据
- **`matchedSignals: []`** ——路由器不从自由文本猜任务类型（`signals.mjs` 的北极星约束）
- **`why`** 说明这次是 `Explicit task type selected: ...` 显式声明，还是 `general` 确定性兜底
- **`requestedModelId` / `skippedForCapability` / `contractMode`** 记录客户端契约如何收窄候选链

## 环境变量覆盖

如果想强制使用特定模型：

```bash
# 按角色（planner / implementer / reviewer / security-reviewer）
export AIOS_MODEL_PLANNER=claude-opus
export AIOS_MODEL_IMPLEMENTER=deepseek-v4
export AIOS_MODEL_REVIEWER=claude-opus
export AIOS_MODEL_SECURITY_REVIEWER=claude-opus

# 按 profile
export AIOS_MODEL_ROUTER_PROFILE=budget

# 完全禁用路由（各客户端保留自带默认模型）
export AIOS_MODEL_ROUTER=0
```

指定覆盖后，路由器会把**客户端**换成能使用该模型的客户端；只有自动路由才允许为了适配 worker 客户端换模型。


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


## 客户端模型路由契约

只有真正启动的客户端能用这个协议，路由才有意义。AIOS 从客户端注册表
（`scripts/lib/clients/core/definitions.mjs`）读取能力，而不是靠猜——下表是注册表派生数据：

| 客户端 | `modelRouting` | 可说协议 | 模型参数 |
|---|---|---|---|
| codex | `relay` | `openai-response` | `-m` |
| claude | `relay` | `claude` | `--model` |
| gemini | `own` | _未公布_ | `-m` |
| opencode | `relay` | `openai-chat`, `openai-response`, `claude`, `gemini` | `-m` |
| hermes | `relay` | `claude`, `openai-chat` | `--model` |
| grok | `own` | _未公布_ | `-m` |
| workbuddy | `own` | _未公布_ | `--model` |
| pi | `relay` | `openai-chat`, `claude` | `--model` |
| zcode | `own` | _未公布_ | `—` |
| qoder | `own` | _未公布_ | `—` |

- `relay`：原生协议网关型 CLI，配到 `coding.rexai.top` 即可使用全部策展模型。
- `own`：不传模型参数，沿用客户端自带默认模型，AIOS 绝不改写其配置。
- `hermes` 能终止 `openai-chat` 上游，但启动只用 Anthropic 兼容通道，因此声明 `claude` + `openai-chat`。
- `qoder` 是 `own`，与 zcode、grok、workbuddy 同一状态：模型绑定账号，用交互式 `/model` 选择；没有验证过的 headless `--model` 参数，所以 AIOS 暂时不会向它转发模型。

协议到端点的映射在 `scripts/lib/model-router/protocols.mjs`：`openai-chat -> /openai/v1/chat/completions`、
`openai-response -> /openai/v1/responses`、`claude -> /claude/v1/messages`、
`gemini -> /gemini/v1beta/models/<model>:generateContent`。

由此得到两条规则：

- **显式声明优先。** 只要设了 `-m`、`AIOS_MODEL_*` 或任务模型，就让客户端跟随模型
  （provider 客户端 + 它自己的 `--model` 通道）。只有自动路由才允许为了适配 worker 客户端换模型。
- **自动路由不换客户端。** team 角色、subagent、phase job 仍用任务指定的客户端启动；该客户端用不了
  最优模型时，沿降级链找到它能真正使用的最强模型。

每次决策都留在路由结果里：`requestedModelId`（原始诉求）、`skippedForCapability`（候选被跳过的原因）、
`modelProtocols`、`contractMode`。

## 通道可用性（运行态层）

注册表描述模型擅长什么，另一台状态机记录中转站**此刻**能提供什么，且只从真实派发结果学习：

| 现象 | 记录为 |
|---|---|
| `model_not_found`、`no available channel`、网关响应被截断、探针 HTTP 404 | 通道 `down`（404 直接判死） |
| 连接/超时/reset、5xx、首字节前断流 | `network` 失败 |
| 实际返回了别的模型 id | `degraded`（通道不稳定） |
| 首字节超过延迟预算 | `degraded` |
| 连续 2 次失败 | `down` |
| 成功 | 走恢复路径回到 `ok` |

Agent 自身导致的失败（`tool`、`provider-output`、`timeout-after-output`）**不算**通道证据——
worker 用错工具不该让模型降温。

查看方式：`node scripts/aios.mjs model-router availability`。路由默认**不**读这份缓存（保持离线确定性），
设 `AIOS_MODEL_AVAILABILITY=1` 后才会跳过不可用通道；生效结果见 `orchestrate plan preview` 与
phase 派发事件里的 `channelDown` / `degradedChannel`。`down` 冷却 `cooldownMs`（默认 300 秒）后自动恢复，
`ok` 记录超过 `ttlMs`（默认 600 秒）视为过期。缓存位于 `memory/specs/model-availability.json`
（`AIOS_MODEL_AVAILABILITY_PATH` 可覆盖，`AIOS_MODEL_AVAILABILITY_FEEDBACK=0` 关闭写回）。

## 下一步

- [Agent Team](team-ops.md) — 带自动路由的多 agent 协作
- [ContextDB](contextdb.md) — 项目内存
- [Solo Harness](solo-harness.md) — 长时间运行的单个 agent 工作

## 常见问题

### 模型路由器会在选择模型前调用模型吗？

不会。路由器根据任务元数据和已配置能力选择 client/model 路径，之后才由选中的客户端执行任务。

### 可以覆盖推荐结果吗？

可以。根据成本、延迟或能力要求，使用路由 profile 或按角色/任务的显式覆盖。

## 官方文档

配合阅读[Agent Team](team-ops.md)、[工作流策略](workflow-policy.md)和[ContextDB](contextdb.md)，了解完整执行契约。
