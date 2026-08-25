---
title: AIOS 架构
description: 了解客户端指引、ContextDB、工作流策略、Team、Harness、browser-use CDP 和 RL 研究层如何连接。
---

# 架构

## 一句话回答

AIOS 是围绕现有编码客户端建立的本地边界集合。客户端指引确定项目，ContextDB 保存和召回项目证据，Workflow Policy 选择最小路径，Team、Solo Harness 或 Orchestrate 在任务需要时执行工作。browser-use CDP 是默认浏览器路径；旧版 Playwright MCP 保留为兼容路径。

## 组件

| 层 | 主要入口 | 职责 |
| --- | --- | --- |
| 客户端入口 | scripts/contextdb-shell.zsh、client-sources/、原生指引 | 提供项目说明和路由提示 |
| 启动桥 | scripts/contextdb-shell-bridge.mjs、scripts/ctx-agent.mjs | 决定包装或透传并启动客户端 |
| ContextDB | mcp-server/src/contextdb/、.aios/context-db/ | 保存会话、memo、检查点、搜索数据和上下文包 |
| Workflow Policy | scripts/lib/planning/workflow-policy.mjs、auto-gate.mjs、cli.mjs | 分类 noop、direct、guarded、planned |
| 运行操作 | scripts/aios.mjs、team、harness、orchestrate、HUD | 分发工作、记录状态和呈现证据 |
| 浏览器 | scripts/run-browser-use-mcp.sh、chrome.*、browser.*、page.* | 通过 CDP 运行 browser-use MCP |
| 研究层 | scripts/lib/rl-core/、rl-* 适配器 | 隔离 RL 实验和评估 |

## 运行链路

~~~text
用户命令
  -> 受支持客户端和原生项目指引
  -> 可选 shell bridge / ctx-agent 兼容路径
  -> .aios/context-db/index.json 注册表
  -> ContextDB 搜索、memo、checkpoint 或 context pack
  -> Workflow Policy 路由决策
  -> direct 工作、Team、Solo Harness 或 Orchestrate
  -> 诊断、测试和验证证据
~~~

路由决策不等于实现完成。修改文件仍需经过编辑前安全门禁和最终验证门禁。

## ContextDB 和存储边界

项目注册表指向本地来源：

~~~text
.aios/
  context-db/
    index.json
    sessions/
    index/
    exports/
  memo/
    file/events.jsonl
    split/
~~~

当前公开模型是 pull-based。Agent 按需搜索或召回相关来源，不会自动收到全部历史。旧包装模式和 .contextdb-enable 仍是兼容行为，不是首选安装路径。

## Workflow Policy 边界

Workflow Policy 按风险选择：

| disposition | 用途 |
| --- | --- |
| noop | 不需要动作 |
| direct | 只回答或检查，不创建持久计划 |
| guarded | 小而清晰的本地改动，仍需编辑和验证门禁 |
| planned | 多步骤、高风险、委派、可恢复或不明确工作 |

计划可能是 none、reuse 或 create。同会话确认和跨客户端 explicit resume 不是同一件事。详见[工作流策略](workflow-policy.md)。

## Team、Solo Harness 和 Orchestrate

- Agent Team 用于可以分别负责的独立工作包，HUD、状态、历史和质量类别提供运行证据。
- Solo Harness 用于一个明确的长任务目标，支持检查点、阶段日志、worktree 和 resume 状态。
- Orchestrate 用于阶段性 dispatch DAG 和质量门禁。
- dry-run 是本地模拟，只能证明解析和计划状态，不能证明实时模型供应商或客户端路由可用。
- live 子代理执行需要显式启用，并受当前配置的 runtime 边界限制。启用前先检查 doctor 和命令帮助。

相关命令：

~~~bash
aios team status --watch
aios harness status --session <session-name> --json
aios orchestrate --help
aios doctor --native --verbose
~~~

## 浏览器运行时

默认文档路径是 browser-use MCP over CDP：

- 启动：scripts/run-browser-use-mcp.sh
- 启动浏览器：chrome.launch_cdp
- 连接：browser.connect_cdp
- 页面操作：page.semantic_snapshot、page.extract_text、page.goto、page.screenshot
- profile 配置：config/browser-profiles.json

使用可见 CDP 浏览器，先读 semantic 或定向文本，并保持 read -> act -> verify 短循环。mcp-server 中的 Playwright MCP 保留为兼容和低级检查路径，不是默认业务流程路径。

## RL 研究层 {#rl-training-layer-aios}

AIOS 还包含隔离的多环境 RL 研究表面，普通 AIOS 安装或文档工作不需要它。scripts/lib/rl-core/ 负责 campaign 状态、checkpoint 血统、比较结果、replay lane、teacher 信号和 trainer 入口；适配器覆盖 shell、browser、orchestrator 和 mixed 实验。

~~~bash
node scripts/rl-shell-v1.mjs benchmark-generate --count 20
node scripts/rl-shell-v1.mjs train --epochs 5
node scripts/rl-shell-v1.mjs eval
node scripts/rl-mixed-v1.mjs mixed --mixed
node scripts/rl-mixed-v1.mjs mixed-eval
~~~

RL 状态和 benchmark 只属于对应环境和版本范围内的研究证据，不能自动证明生产客户端可靠性或公开性能声明。

## Graph Engine 视图

AIOS 同样可视为一个**本地优先的 Graph Engine**：节点、边、共享状态、失败路由、扇出、隔离、模型分层——都被编排成可验证的 Agent 图，运行在你已有的 CLI 之下。关键词 "Graph Engine"、"Graph Engineering"、"agent graph"、"verifiable graph" 指向的都是下面这套能力。

Graph Engine 关键词的外部参考：[LangGraph](https://langchain-ai.github.io/langgraph/) 在 Python / LangChain 生态首创了 "graph of LLMs" 模式；[Rust-LangGraph](https://www.rust-langgraph.dev/) 将其移植到 Rust；[AWS Step Functions + Bedrock](https://aws.amazon.com/step-functions/) 与 [Google Vertex AI Workflows](https://cloud.google.com/vertex-ai) 提供云托管的图编排；[CrewAI](https://docs.crewai.com/)、[AutoGen](https://microsoft.github.io/autogen/stable/)、[PydanticAI](https://ai.pydantic.dev/) 补齐生态。AIOS 的差异点在于**本地优先**：图运行在你的机器上，共享状态存于本地 ContextDB，提示与代码数据不离开你的环境。

| Graph Engine 组件 | AIOS 实现 |
| --- | --- |
| 节点（每节点一个 loop，带契约） | `rex-harness` 能力节点：Fact → Capability → Evidence，契约有界 |
| 边（基于检查的路由） | Workflow Policy `direct` / `guarded` / `planned`；`aios plan auto-gate` 运行时路由 |
| 共享状态 | ContextDB 项目记忆（memo、检查点、可检索 pack），pull-based |
| 失败路由 | 证据门禁与终态 `blocked`：重新规划、升级、停止 |
| 扇出 / 扇入 | `aios team` 并行 Agent + 屏障 + 证据归约 |
| 隔离 | `aios harness run --worktree` git worktree 隔离 |
| 模型分层 | `model-router` 每节点模型选择 |
| 动态工作流 | `aios plan auto-gate --dry-run` 描述目标，运行时选择路径 |

先稳定一个 loop（`aios harness` + 验证门禁 + ContextDB 状态），再在工作真正拆成角色和并行子任务时把 loop 串成图（`aios team` + 工作流路由）。

## 常见边界和恢复

- 缺少注册表：在正确的项目根目录运行 aios init --all。
- 原生指引过期：运行 aios doctor --native --verbose，先检查 dry run，再使用 --fix。
- 浏览器需要登录：在认证墙处保留人工确认。
- live 路由失败：对比 dry-run 证据与实际供应商和客户端状态。
- 验证失败：保持计划开放，记录第一个失败命令。

## 下一步

- [快速开始](getting-started.md) - 安装和初始化。
- [工作流策略](workflow-policy.md) - 选择路径。
- [Agent Team](team-ops.md) - 协调独立工作。
- [Solo Harness](solo-harness.md) - 运行可恢复目标。
- [故障排查](troubleshooting.md) - 按症状恢复。
