---
name: model-router
description: "当需要调度不同模型执行子任务时使用。根据任务类型匹配模型能力，自动选择最优模型并生成调用指令。TRIGGER: 模型调度、model dispatch、选模型、分派任务、多模型协作、路由到模型"
---

# Model Router

你是 Agent Team 的调度中枢。先识别任务信号，再按 profile、能力和成本选择模型；不要把所有任务都默认塞给实现模型。

## CLI 协议

| 协议 | CLI | 使用场景 |
|------|-----|---------|
| **codex** | `codex exec --dangerously-bypass-approvals-and-sandbox -m <model> "<prompt>"` | GPT-5.5 |
| **gemini** | `gemini -m gemini-3-pro -p "<prompt>"` | Gemini-3-Pro |
| **claude** | `claude --model <model> -p "<prompt>"` | 其余模型 |

## 模型能力表

| 模型 | 协议 | 最擅长 | 成本 |
|------|------|--------|------|
| **Claude Opus 4.7** | claude | 代码审查、架构设计、安全审计 | 最高 |
| **Claude Sonnet 4.6** | claude | 日常开发、RAG、快速原型、文档 | 中 |
| **GPT-5.5** | codex | 通用推理、浏览器自动化、代码执行、兜底复杂任务 | 最高 |
| **DeepSeek-V4-Pro** | claude | 普通实现、算法、核心逻辑、批处理 | 最低 |
| **GLM-5.1** | claude | 数学推理、自主循环、系统规划 | 低 |
| **Kimi K2.6** | claude | 多Agent编排、前端UI、长周期执行 | 低 |
| **MiniMax-M2.7** | claude | 自愈运维、生产恢复 | 低 |
| **Gemini-3-Pro** | gemini | 多模态分析、长文档研究、1M上下文 | 中 |

## Balanced v2 Profiles

- `balanced` 默认：强信号升级，普通实现省成本。
- `premium`：复杂、低置信、高风险任务更积极使用订阅强模型。
- `budget`：优先低成本，仅在浏览器、长上下文、安全、生产恢复等硬能力约束下升级。

使用 `--profile` 或环境变量切换：

```bash
node scripts/aios.mjs model-router route --task "..." --profile balanced --explain
export AIOS_MODEL_ROUTER_PROFILE=premium
```

## 强信号路由

| 信号 | 任务类型 | 首选模型 |
|------|----------|----------|
| 浏览器、打开、上传、填写、截图、网页抓取 | `browser-automation` | **GPT-5.5** |
| 安全、漏洞、注入、权限、合规、auth | `security-review` | **Claude Opus** |
| 代码审查、review、pull request、代码质量 | `code-review` | **Claude Opus** |
| 线上、故障、事故、日志、恢复、自愈 | `self-healing` | **MiniMax-M2.7** |
| 架构、技术选型、系统设计、跨模块 | `architecture` | **Claude Opus** |
| 很长、长文档、第三方 API、视频、图像、多模态 | `research` | **Gemini-3-Pro** |
| 前端、UI、组件、落地页、样式、beautiful | `frontend` | **Kimi K2.6** |
| 普通实现、写代码、开发、构建 | `implementation` | **DeepSeek-V4** |

## Explain 输出

用 `--explain` 查看为什么选中某个模型：

```bash
node scripts/aios.mjs model-router route \
  --task "用浏览器打开小红书发布页面，上传图片并填写标题" \
  --profile balanced \
  --explain
```

重点看这些字段：

- `profile`：实际使用的策略，默认 `balanced`。
- `confidence`：信号强度和胜出差距，低置信时可考虑拆任务或用 `premium`。
- `matchedSignals`：命中的关键词和权重。
- `why`：人类可读解释。
- `recommendedPhases`：复合任务的分阶段建议；v2 只报告建议，不自动改写 team plan。

## Agent Team 集成

- `aios team` / `aios orchestrate --dispatch local --execute live` 默认启用 per-phase model routing，并为 planner / implementer / reviewer / security-reviewer 分别解析模型。
- 每个 phase job 的 `launchSpec.modelRouting` 包含 `role`、`taskType`、`modelId`、`provider`、`clientId`、`cliCommand`、`reason`、`fallback`，v2 还会保留 `profile`、`confidence`、`matchedSignals`、`why`、`recommendedPhases`。
- live subagent / GroupChat 运行时会按 `clientId` 切换 CLI 协议并附加模型参数；Codex 子进程默认附加 `--dangerously-bypass-approvals-and-sandbox`，避免后台 approval/sandbox prompt 卡死。
- 每个 phase / speaker 完成或阻塞后写入 ContextDB `kind=model.dispatch` 事件，`turn.environment=model-router`，refs 包含 model/task/role，供 `model-router stats` 汇总。
- 如需只使用外层 `AIOS_SUBAGENT_CLIENT`，设置 `AIOS_MODEL_ROUTER=0`（也支持 `false` / `off` / `no`）；dry-run 仍可展示计划中的 routing metadata。

## 决策流程

1. 识别任务描述中的强信号，不要只看第一个动词。
2. 如果用户明确指定 task type 或角色 env override，优先尊重 override。
3. 按 profile 调整：`balanced` 成本感知、`premium` 更积极升级、`budget` 更保守。
4. 用 `--explain` 检查 `matchedSignals` 和 `why`。
5. 对复合任务按 `recommendedPhases` 拆成规划、实现、文档、审查等子任务。
6. 记录/查看结果：`node scripts/aios.mjs model-router stats`。

## 命令工具

```bash
node scripts/aios.mjs model-router list
node scripts/aios.mjs model-router route --task "build a beautiful landing page component" --profile balanced --explain
node scripts/aios.mjs model-router route --task "实现一个登录接口" --task-type implementation
node scripts/aios.mjs model-router stats
```

## 环境变量

```bash
export AIOS_MODEL_ROUTER=0                    # 关闭 live 执行期模型覆盖；metadata 仍可生成
export AIOS_MODEL_ROUTER_PROFILE=premium      # balanced | premium | budget
export AIOS_MODEL_PLANNER=claude-opus         # 按角色覆盖
export AIOS_MODEL_IMPLEMENTER=deepseek-v4
export AIOS_MODEL_REVIEWER=claude-opus
export AIOS_MODEL_SECURITY_REVIEWER=claude-opus
export AIOS_MODEL_BROWSER_AUTOMATION=gpt-5.5  # 按任务类型覆盖
export AIOS_MODEL_IMPLEMENTATION=deepseek-v4
export AIOS_MODEL_PLANNING=glm-5.1
export AIOS_SUBAGENT_CODEX_UNATTENDED=0       # 关闭 Codex 子进程 bypass（默认开启）
```

## Troubleshooting

- 如果 `model-router stats` 全是 `deepseek-v4 / implementation`，先用 `route --task "..." --profile balanced --explain` 检查新任务是否已命中强信号；stats 反映历史执行记录，不会自动证明当前路由仍然错误。
- 如果浏览器/上传/填写类任务没有到 GPT-5.5，确认 prompt 中包含真实操作信号，或显式加 `--task-type browser-automation`。
- 如果前端 UI 被当成普通实现，加入 `frontend`、`UI`、`landing page`、`component`、`style` 等信号，或使用 `--task-type frontend`。
- 如果任务很大且 `confidence` 低，优先拆分子任务；需要更强模型时用 `--profile premium`。
- 当前 v2 记录历史 dispatch 供诊断和统计；历史成功率尚未自动参与权重计算，不要把 stats 当成在线学习结果。
