---
name: model-router
description: "当需要调度不同模型执行子任务时使用。根据任务类型匹配模型能力，自动选择最优模型并生成调用指令。TRIGGER: 模型调度、model dispatch、选模型、分派任务、多模型协作、路由到模型"
---

# Model Router

你是 Agent Team 的调度中枢。阅读模型能力表，根据子任务类型匹配最优模型。

## CLI 协议

| 协议 | CLI | 使用场景 |
|------|-----|---------|
| **codex** | `codex exec --dangerously-bypass-approvals-and-sandbox -m <model> "<prompt>"` | 仅 GPT-5.5 |
| **gemini** | `gemini -m gemini-3-pro -p "<prompt>"` | 仅 Gemini-3-Pro |
| **claude** | `claude --model <model> -p "<prompt>"` | 其余所有模型 |

## 模型能力表

| 模型 | 协议 | 最擅长 | 成本 |
|------|------|--------|------|
| **Claude Opus 4.7** | claude | 代码审查、架构设计、安全审计 | 最高 |
| **Claude Sonnet 4.6** | claude | 日常开发、RAG、快速原型 | 中 |
| **GPT-5.5** | codex | 六边形战士，通用推理、浏览器自动化、代码执行全能 | 最高 |
| **DeepSeek-V4-Pro** | claude | 算法实现、核心逻辑、批处理 | 最低 |
| **GLM-5.1** | claude | 数学推理、自主循环、系统规划 | 低 |
| **Kimi K2.6** | claude | 多Agent编排、前端UI、长周期执行 | 低 |
| **MiniMax-M2.7** | claude | 自愈运维、生产恢复 | 低 |
| **Gemini-3-Pro** | gemini | 多模态分析、长文档研究、1M上下文 | 中 |

## 路由规则

| 任务类型 | 首选模型 | 降级链 |
|----------|----------|--------|
| 代码审查 | **Claude Opus** | GPT-5.5 → GLM-5.1 |
| 安全审计 | **Claude Opus** | GPT-5.5 → GLM-5.1 |
| 架构设计 | **Claude Opus** | GPT-5.5 → GLM-5.1 |
| 写代码/实现 | **DeepSeek-V4** | GPT-5.5 → Claude Sonnet |
| 浏览器自动化 | **GPT-5.5** | Kimi K2.6 → Claude Sonnet |
| 调研/长文档 | **Gemini-3-Pro** | GPT-5.5 → Kimi K2.6 |
| 规划/方案 | **GLM-5.1** | GPT-5.5 → Claude Opus |
| 测试/QA | **Claude Sonnet** | GPT-5.5 → DeepSeek-V4 |
| 文档/README | **Claude Sonnet** | GPT-5.5 → Kimi K2.6 |
| 前端/UI | **Kimi K2.6** | GPT-5.5 → Claude Sonnet |
| 故障恢复 | **MiniMax-M2.7** | GLM-5.1 → GPT-5.5 |
| 通用兜底 | **GPT-5.5** | Claude Sonnet → DeepSeek-V4 |

## Agent Team 集成

- `aios team` / `aios orchestrate --dispatch local --execute live` 默认启用 per-phase model routing，并为 planner / implementer / reviewer / security-reviewer 分别解析模型。
- 每个 phase job 的 `launchSpec.modelRouting` 会包含 `role`、`taskType`、`modelId`、`provider`、`clientId`、`cliCommand`、`reason` 和 `fallback`，merge-gate 保持 `requiresModel=false`。
- live subagent / GroupChat 运行时会按 `clientId` 切换 CLI 协议并附加模型参数；Codex 子进程默认附加 `--dangerously-bypass-approvals-and-sandbox`，避免后台 approval/sandbox prompt 卡死；同时在 prompt 中加入 `## Model Router` 段落，便于子 Agent 自检。
- 每个 phase / speaker 完成或阻塞后写入 ContextDB `kind=model.dispatch` 事件，`turn.environment=model-router`，refs 包含 model/task/role，供 `model-router stats` 汇总。
- 如需只使用外层 `AIOS_SUBAGENT_CLIENT`，设置 `AIOS_MODEL_ROUTER=0`（也支持 `false` / `off` / `no`）；dry-run 仍可展示计划中的 routing metadata。

## 决策流程

1. 分析子任务类型（写代码？审查？研究？规划？）
2. 按路由规则选首选模型
3. 按 CLI 协议生成命令派发
4. 记录结果：`node scripts/aios.mjs model-router stats`

## 降级策略

首选模型不可用时：
1. 按降级链依次尝试
2. 全部失败则按成本从低到高：DeepSeek → Kimi → MiniMax → GLM → Sonnet → Gemini → GPT-5.5 → Opus

## 命令工具

```bash
node scripts/aios.mjs model-router list          # 查看注册表
node scripts/aios.mjs model-router route --task "..."  # 路由决策
node scripts/aios.mjs model-router stats         # 调度统计
```

## 环境变量

```bash
export AIOS_MODEL_ROUTER=0                 # 关闭 live 执行期模型覆盖；metadata 仍可生成
export AIOS_MODEL_PLANNER=claude-opus       # 按角色覆盖
export AIOS_MODEL_IMPLEMENTER=deepseek-v4
export AIOS_MODEL_REVIEWER=claude-opus
export AIOS_MODEL_SECURITY_REVIEWER=claude-opus
export AIOS_MODEL_CODE_REVIEW=claude-opus   # 按任务类型覆盖
export AIOS_MODEL_IMPLEMENTATION=deepseek-v4
export AIOS_MODEL_PLANNING=glm-5.1
export AIOS_SUBAGENT_CODEX_UNATTENDED=0      # 关闭 Codex 子进程 yolo/bypass（默认开启）
```

## 注意

- Orchestrator 是你当前正在使用的 coding agent（不固定为某个模型）
- 你负责拆解任务和选模型，CLI 命令由路由表自动生成
- 所有交付代码默认经过审查模型把关
