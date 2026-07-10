# AIOS Token 与智能工作流栈设计

日期：2026-07-10
状态：已完成内部复核，等待用户确认
范围：安装并组合 Headroom、RTK、Caveman、ContextDB 和受 Ponytail 启发的决策门禁，同时不恢复已经废弃的 AIOS 原生拦截运行时

## 目标

让 AIOS 管理的会话自动减少 token 消耗，同时提升实现判断质量，而不只是让回复变短。

整套工作流由五个职责互不重叠的层组成：

| 层 | 职责 |
| --- | --- |
| Ponytail Gate | 避免不必要的代码、依赖、抽象和文件。 |
| RTK | 在 shell 和工具输出进入 agent 上下文前压缩它们。 |
| Headroom | 通过官方 `headroom wrap` 托管本地代理、客户端路由和 CCR 原文召回。 |
| Caveman | 在不删除技术事实的前提下减少 agent 回复的冗余表达。 |
| ContextDB | 让历史上下文保持按需拉取、受预算约束并且可以选择性召回。 |

Superpowers、TDD、CRG、隐私检查和验证流程继续作为这套工作流外围的质量与安全控制。任何压缩层都不能取代它们。

## 外部来源与采用决策

2026-07-10 调研的主要来源：

- Ponytail：<https://github.com/DietrichGebert/ponytail>
- Headroom：<https://github.com/headroomlabs-ai/headroom>
- RTK：<https://github.com/rtk-ai/rtk>
- Caveman：<https://github.com/JuliusBrussee/caveman>
- 用户提供的 Grok 讨论：<https://grok.com/share/bGVnYWN5LWNvcHk_b8994159-cbea-4fab-b42d-e41ad375f825>

决策：**采用并组合（Adopt and Compose）**。

- 采用社区维护的 RTK、Caveman 和 Headroom 官方发行版，不重新实现它们的数据面。
- Headroom 严格使用官方 Python CLI、`headroom wrap <client>` 和 `headroom unwrap <client>`；AIOS 不仿造 provider、MCP 注册、代理 supervisor 或端口生命周期。
- AIOS 只保留一层轻量、可测试的命令选择适配器，用于把 AIOS runtime ID 映射到官方 wrap target，并决定 `auto|on|off` 行为。
- 把 Ponytail 的决策阶梯改造成 AIOS 原生技能，不在每一轮对话中注入完整上游规则。
- 标注 Ponytail 来源并保留其安全例外；除非官方插件已经单独安装并通过 smoke 验证，否则不宣称安装了官方插件，也不宣称行为完全一致。

本次 Headroom 行为核对基于上游提交 `1d2b76e72e16eaf532326d9e75a481e18bde1ab7`、版本 `0.31.0`。官方当前提供 `claude`、`codex`、`copilot`、`aider`、`vibe`、`cursor`、`cline`、`continue`、`goose`、`openhands`、`openclaw` 和 `opencode` 共 12 个 wrap target；没有 `gemini` target。AIOS 只启用自己能够完成 live smoke 的映射，不把“上游存在子命令”等同于“AIOS 已验证支持”。

上游发布的节省比例只能作为参考，不能当作 AIOS 本地证据。在完成 AIOS 自己的对照测量之前，文档必须把这些数字标记为“上游基准结果”。

## 架构

```text
用户任务
  -> Superpowers 需求理解与规划
  -> CRG / 项目搜索 / search-first 证据
  -> pre-edit 上下文、影响范围、依赖、风格和测试检查
  -> AIOS Ponytail Gate 选择最早成立的解决方案阶梯
  -> TDD 实现
  -> RTK 压缩 shell / 工具输出
  -> AIOS 启动层选择官方 headroom wrap target
  -> Headroom 官方 wrapper 托管代理、客户端配置和 CCR MCP
  -> Headroom 压缩模型输入并保留原文召回路径
  -> Caveman 压缩回复表达
  -> Ponytail diff review 删除可避免的实现
  -> verification 保留精确证据
```

控制面与数据面保持分离：

- AIOS 控制面：工作流路由、Ponytail Gate、ContextDB 内容选择规则、安全门禁、runtime ID 映射、启用模式、文档和能力状态报告。
- Headroom 官方控制面：`wrap`/`unwrap`、客户端 provider/MCP 配置、代理复用、端口选择、client marker 和代理退出清理。
- 数据面：RTK 命令输出过滤、Headroom 官方本地代理以及模型服务商的正常传输链路。

AIOS 不恢复 `scripts/aios-intercept.mjs` 或 `scripts/aios-mcp-proxy.mjs`，也不新增自有 Headroom proxy supervisor。上述旧文件继续保留为已废弃的参考代码。

## 安装契约

`aios init` 是唯一的自动安装边界。

现有入口：

```bash
node scripts/aios.mjs init --all
```

无人值守入口：

```bash
node scripts/aios.mjs init --all --yes-compression-tools
```

现有 `ensureCompressionTools()` 流程扩展为三个工具的状态契约：

```js
{
  rtk: 'installed|missing|failed',
  caveman: 'installed|missing|failed',
  headroom: 'installed|missing|unsupported-platform|unsupported-version|failed'
}
```

安装顺序：

1. 在不修改机器状态的前提下检测三个工具。
2. 显示一次统一授权提示，说明下载来源、本地处理、可选模型资源和网络端点。
3. 使用现有平台策略安装 RTK。
4. 使用现有平台策略安装 Caveman。
5. 按 Headroom 官方 CLI 发行方式，在隔离的 Python 工具环境中安装 Headroom。
6. 验证三个工具的可用性和准确版本。
7. 为检测到的客户端初始化 RTK。
8. 分别报告每个工具的状态；任何一个可选层失败时，都不能把结果描述为完整工作流已经就绪。

Headroom 安装策略：

1. 要求 Python 3.10 或更高版本。
2. 首发支持范围固定为 `headroom-ai>=0.31.0,<0.32.0`。AIOS 只有在更新适配器契约并重新完成 smoke 后才能放宽到新的 minor 版本。
3. 优先执行官方工具安装方式 `uv tool install "headroom-ai[all]>=0.31.0,<0.32.0"`。
4. 当 `uv` 不可用时，回退到隔离环境形式 `pipx install "headroom-ai[all]>=0.31.0,<0.32.0"`；文档同时列出上游原始 `pip install` 命令，但 AIOS 自动安装器不静默写入系统 Python。
5. 禁止静默安装到当前系统 Python 环境。
6. 如果 `uv` 和 `pipx` 都不可用，则返回 `unsupported-platform` 并给出准确的手动安装命令，而不是修改用户的 Python 环境。
7. 检测到范围外的现有版本时返回 `unsupported-version`；`auto` 不得调用 wrapper，安装流程只能在统一授权后升级或降级到支持范围。
8. 安装验收使用 `headroom --version`、`headroom --help` 和 `headroom wrap --help`。`headroom doctor --json` 检查的是代理与客户端路由，没有运行中的代理时退出码 `2` 是正常的“未启动”状态，因此只作为运行时诊断，不作为 `aios init` 安装成功条件。
9. `aios init` 不运行 `headroom init`、`headroom install apply` 或 `headroom wrap`，因为这些命令会修改客户端配置或启动代理；配置动作只发生在用户实际启动受支持客户端时。

`--dry-run` 只报告将要安装的内容以及缺少的前置条件，不下载包、模型或二进制文件。

授权提示必须明确说明：

- RTK 和 Caveman 在本地运行。
- Headroom 官方 wrapper 会在受支持客户端启动时管理 loopback 本地代理，并可能按官方契约修改客户端配置。
- 安装过程可能访问 Headroom 文档中列出的包仓库、GitHub Release 和可选模型资源地址。
- 模型请求经过本地代理后，仍然会发送到用户配置的 LLM 服务商。
- `--yes-compression-tools` 表示对三个工具进行无人值守安装的明确授权。

## Headroom 官方运行时契约

安装 Headroom 本身不会改变流量路由。只有当 AIOS 通过 shell bridge、`ctx-agent`、team runtime 或 harness runtime 启动已验证客户端时，才把原客户端命令交给官方 wrapper：

```text
shell function
  -> AIOS shell bridge / ctx-agent / ContextDB
  -> headroom wrap <official-target> <AIOS-selected-official-flags> -- <client-args>
  -> Headroom 官方代理、客户端配置和 MCP 生命周期
  -> 真实客户端
```

AIOS 只实现一个纯命令选择适配器。建议接口接收 `{ runtimeId, command, args, env, launchKind, concurrency }`，返回 `{ command, args, env, wrapped, reason }`。`launchKind` 至少区分 `interactive|one-shot|team|harness`。适配器必须在每一次真正 spawn 客户端之前执行，而不是改写 client registry 的真实 `commandName`，也不能包装只负责启动 `ctx-agent` 的外层 Node 进程。

适配器不得自行执行以下行为：

- 启动或复用 `headroom proxy`；
- 探测或分配 Headroom 端口；
- 注入 `OPENAI_BASE_URL`、`ANTHROPIC_BASE_URL` 或 provider 配置；
- 生成、写入或删除 Headroom MCP 配置；
- 维护 Headroom PID、锁、端口或 readiness 状态文件；
- 仿造官方 wrap/unwrap 的备份与恢复协议。

适配器必须防止递归：调用 Headroom 前从 `PATH`/`Path` 中移除 `AIOS_NATIVE_SHIM_DIR`，设置 `AIOS_HEADROOM_WRAPPED=1`，检测到该标记时直接运行真实客户端，并且永不包装 `headroom` 自身。Headroom 官方 wrapper 会再次通过 PATH 查找真实客户端，仅把 AIOS 已解析出的绝对命令保存在 adapter 中不足以阻止它重新命中 shim。

这些行为全部由官方 `headroom wrap` 和 `headroom unwrap` 承担。AIOS 的 `compression status` 若继续存在，只能聚合 `command -v headroom`、版本兼容性、有界 `headroom doctor --json` 与当前能力矩阵，不能声称拥有代理进程。`doctor` 的 proxy-down 退出码必须显示为“当前未运行”，不能误报成安装损坏。

默认配置：

| 设置 | 默认值 | 含义 |
| --- | --- | --- |
| `AIOS_HEADROOM` | `auto` | Headroom 已安装且官方 target 已通过 AIOS smoke 时使用官方 wrapper。 |
| `HEADROOM_OUTPUT_SHAPER` | 未设置/关闭 | 默认由 Caveman 负责输出简化，避免重复塑形。 |

`AIOS_HEADROOM` 接受以下值：

- `auto`：在调用 wrapper 之前，若 Headroom 缺失、版本不兼容、客户端无官方 target 或 AIOS 尚未验证该映射，则先执行只读 durable-state guard。只有确认当前客户端配置中没有官方 Headroom provider/marker/backup 时，才最多警告一次并走原客户端路径；检测到 durable 状态时必须阻止裸启动并给出同配置上下文的官方 unwrap 命令。
- `on`：强制要求官方 wrapper；Headroom 缺失、target 不支持或映射未验证时，用可操作错误终止启动。
- `off`：不调用官方 wrapper，保留 RTK、Caveman 和 ContextDB。它仍须执行同一只读 durable-state guard；若官方此前留下 durable 配置，则阻止裸启动并提示对应的 `headroom unwrap <target>`，不能把“仅跳过 wrapper”错误描述为已经恢复原生 provider。

durable-state guard 只读取官方版本约束中已核对的 marker、backup 和配置位置，不写入或清理任何客户端文件。若状态无法确定，选择阻止启动而不是冒险连接已停止的 loopback provider。Gemini、Hermes、Grok 等没有官方 target 的 runtime 不存在本集成产生的 durable provider 状态，可按原路径启动。

一旦已经调用 `headroom wrap`，后续代理启动、端口回退、provider 冲突和客户端退出均由官方命令负责。若 wrapper 本身返回非零，AIOS 保留官方错误并终止本次启动，不再偷偷降级启动原客户端，因为官方命令可能已经写入可由 `headroom unwrap` 恢复的配置。

### 官方 MCP 与重复组件边界

Headroom 代理压缩不依赖 MCP；MCP 的关键用途是提供 `headroom_retrieve`，让 agent 能够根据压缩标记中的 hash 找回原文。官方 `--no-mcp` 帮助明确说明压缩标记将不可操作。因此 AIOS 默认保留由官方 wrapper 管理的 Headroom MCP，不自行注册，也不传 `--no-mcp`。

为避免和 AIOS 已有能力重复，默认关闭 Headroom wrapper 附带的其他层：

- 传 `--no-context-tool`，避免 Headroom 再安装 RTK、写 hooks 或注入 RTK 指令；
- Claude/Codex 同时传 `--no-tokensave --no-serena`，避免 TokenSave 与 Serena 代码图重复；只传 `--no-tokensave` 会回退到 Serena，因此两个参数缺一不可；
- OpenCode 传 `--no-serena`；其官方 wrapper 当前没有 `--no-tokensave`；
- 不默认传 `--memory`、`--learn` 或 `--code-graph`，因为 ContextDB、AIOS 计划与 CRG 已承担对应职责；
- 不默认启用 Headroom output shaping，由 Caveman 负责输出表达压缩。

这些 flags 约束的是本次官方 wrap 行为，不等于清理历史状态。`--no-context-tool` 不会删除旧 Headroom wrap 留下的 RTK hooks 或 AGENTS 指令；`--no-tokensave`/`--no-serena` 只清理由 Headroom ledger 证明为 Headroom-owned 的 MCP 条目，用户自行管理的 Serena 必须保留。检测到旧默认 wrap 状态时，AIOS 只报告迁移步骤：先在相同配置上下文执行官方 `headroom unwrap <target>`，再由 AIOS 重新启动，不自行删除旧配置。

首批命令映射：

| AIOS runtime | 官方命令前缀 | 发布状态 |
| --- | --- | --- |
| `codex-cli` | `headroom wrap codex --no-context-tool --no-tokensave --no-serena --` | 第一批实现并进行 live smoke。 |
| `claude-code` | `headroom wrap claude --no-context-tool --no-tokensave --no-serena --` | 第一批实现并进行 live smoke。 |
| `opencode-cli` | `headroom wrap opencode --no-context-tool --no-serena --` | 在配置恢复 smoke 通过后启用。 |
| `gemini-cli`、`hermes-agent`、`grok-build` | 无官方 target，不包装。 | `auto` 降级；`on` 报错。 |

其他官方 wrap target 只有在 AIOS 新增对应 runtime、核对配置副作用并完成 live smoke 后才进入映射。Cursor 当前虽然有 wrap 子命令，但上游兼容矩阵仍标为手动配置，不能仅凭命令存在宣称完整兼容。

### 启动种类与隐私/并发门禁

官方 wrapper 会打印额外 argv。Codex 的 AIOS one-shot prompt 通过 stdin 传递，风险较低；Claude 和 OpenCode 的无人值守路径当前把 prompt 或 system prompt 放在 argv，若直接 wrap 会把内容写入 stdout 或日志。因此首发范围必须按 launch kind 门禁：

| 启动种类 | Codex | Claude | OpenCode |
| --- | --- | --- | --- |
| interactive shell | smoke 后启用 | smoke 后启用 | 配置恢复 smoke 后启用 |
| one-shot / solo harness | stdin 路径 smoke 后启用 | `auto` 绕过、`on` 报隐私错误 | `auto` 绕过、`on` 报隐私错误 |
| team / groupchat，concurrency=1 | 按 one-shot 规则 | 按 one-shot 规则 | 按 one-shot 规则 |
| team / groupchat，concurrency>1 | 并发配置 smoke 前 `auto` 绕过、`on` 报错 | 同左 | 同左 |

在上游提供 quiet/redaction，或 AIOS 把对应 prompt 安全迁移到 stdin 之前，不增加“允许 argv 泄漏”的默认开关。官方 wrapper 虽有代理 client marker，但尚不能据此证明 Codex/OpenCode 全局配置和 Claude 项目设置支持并发写入与恢复。

Codex structured-output retry 和 fallback 会重建真实 CLI 参数，因此必须在每次实际 spawn 前重新生成 launch plan。禁止只在外层把 `codex` 字符串替换成 `headroom`，否则 fallback 会错误形成 `headroom exec ...`，也可能绕过防递归和能力门禁。

### 官方配置副作用与恢复

官方 wrapper 并非对所有客户端都只设置临时环境变量，AIOS 文档和 smoke 必须如实覆盖：

- Claude：项目 `.claude/settings.local.json` 中的代理设置在正常退出时恢复；user-scope Headroom MCP 注册会保留。恢复时必须从原项目目录、保留相同 `CLAUDE_CONFIG_DIR` 执行 `headroom unwrap claude`。
- Codex：官方 wrapper 会备份并持久修改 `$CODEX_HOME/config.toml`；会话退出只清理代理，不还原配置。恢复时必须保留相同 `CODEX_HOME` 执行 `headroom unwrap codex`；官方 unwrap 还会把本地 thread 数据库中的 `model_provider` 标签重标回原生 provider，不能把它描述为只恢复 TOML。
- OpenCode：官方 wrapper 会备份并持久修改 `$OPENCODE_CONFIG` 或默认配置文件。恢复时必须保留相同 `OPENCODE_CONFIG`/`OPENCODE_HOME` 执行 `headroom unwrap opencode`。

AIOS 不在正常退出时自动调用 unwrap，以免破坏用户主动建立的官方持久配置或其他并发会话。禁用、回滚和故障排查必须显示准确的官方 unwrap 命令；任何自动清理功能若未来加入，必须先解决并发所有权并单独设计。

普通客户端退出码必须透传。Ctrl-C/SIGTERM 的 signal 语义需要单独的 PTY smoke；在现有 spawn 层仍把 `code === null` 折算为 `1` 时，不得宣称已经保留 `130/143` 或原始 signal 身份。

任何失败路径都不能在日志中暴露 API key、Authorization header、cookie 或完整服务商配置。

## Ponytail Gate 契约

新增一个 canonical skill：

```text
skill-sources/aios-ponytail-gate/SKILL.md
```

现有技能同步流程负责把它投影到受支持客户端目录。只在实现、重构和修复任务中按需加载，不在每次普通对话中加载。

该门禁只能在 agent 已经理解任务并检查相关执行链路后运行。决策阶梯如下：

1. 跳过：请求的产物或行为其实不需要存在。
2. 复用：仓库中已有 helper、模式或命令能够解决问题。
3. 标准库：语言运行时已经提供所需能力。
4. 平台原生能力：操作系统、浏览器、框架或协议已经提供所需能力。
5. 已安装依赖：现有依赖可以解决问题，不需要增加新包。
6. 直接表达：一个清晰的单行或小型直接表达已经足够。
7. 最小实现：只编写满足已批准设计和测试所需的最小新实现。

门禁输出一条紧凑决策记录：

```text
ponytail:rung=<1-7> choice=<skip|reuse|stdlib|native|dependency|direct|minimal> evidence=<path-or-symbol>
```

如果存在活动 AIOS 计划，该记录写入当前任务的决策备注或计划决策日志。禁止把它加入计划的 verification evidence 数组：解决方案选择记录不能证明实现或测试已经通过。该记录也不需要在每条面向用户的进度消息中重复。

### 安全例外

Ponytail Gate 不能删除或弱化：

- 信任边界输入校验；
- 身份认证、权限控制或 secret 处理；
- 防止数据丢失的错误处理；
- 可访问性要求；
- 保证正确性所需的并发与生命周期清理；
- 用户明确要求的兼容行为；
- 回归测试和完成证据。

最短代码不是目标。目标是在正确抽象边界上实现最小的正确改动。

### 工作流集成

先更新 canonical workflow skills，再同步生成目录：

- `aios-workflow-router`：在问题理解之后，把实现、重构和 bug 修复任务路由到 Ponytail Gate。
- `pre-edit-safety-gate`：完成上下文、依赖、风格和测试检查后，在生产代码编辑前要求一条 Ponytail 决策记录。
- `search-first`：把可复用的本地实现视为阶梯 2，把生态依赖视为阶梯 5；选择任何一项前都必须保留搜索证据。
- `verification-loop`：增加修改后的最小 diff 复查，但不得放宽其证据结构。

不把整个 Ponytail 仓库复制进 AIOS，也不默认安装官方 Ponytail 插件。官方插件仍然是由用户自行管理的可选增强，因为它的生命周期 hooks 可能与 AIOS 管理的 hooks 重叠。

## 修改后的最小 Diff 复查

提交完成前检查实际 diff，并回答：

1. 是否增加了没有两个以上真实调用方需要的抽象？
2. 是否在更低阶梯已经可行时仍然增加了依赖？
3. 是否修改了与已批准行为无关的文件？
4. 重复逻辑是否可以替换为现有共享函数？
5. 简化是否删除了安全例外，或者破坏了条件分支语义？

只有当测试和验证证明被删除行为确实没有必要时，才接受删除。缺失行为的更小 diff 是回归，不是 Ponytail 成果。

## 指标与声明真实性

AIOS 必须分别展示三类指标：

- 实测输入节省：RTK 和 Headroom 对实际处理输入报告的数值。
- 估算输出节省：除非存在 holdout 或前后对照测量，否则 Headroom/Caveman 的估算必须标记为“估算”。
- 实现经济性：改动 LOC、涉及文件数和新增依赖数；只有在受控基准中才能进行对比。

不同层使用的分母不同，不能直接相加后声称总节省比例。也不能只根据 token 数量宣称安全性或推理质量提升。

第一阶段发布要求确定性测试和 smoke 证据，不设置节省百分比目标。

## 文档交付物

更新以下内容：

- `README.md`，以及仍然描述已废弃原生压缩方案的受维护本地化概览。
- `docs-site/token-compression.md` 及其受维护本地化版本。
- `docs-site/changelog.md` 及其受维护本地化版本。
- 一篇英文和一篇中文 blog，解释分层工作流、隐私边界、启动行为和回滚控制。
- canonical compression skill 文档，明确 RTK、Caveman、Headroom、ContextDB 和 Ponytail Gate 各自的职责。

文档必须包含：

- 自动安装和 dry-run 命令；
- 官方 CLI 只能由 Python 包提供、npm 包只是 TypeScript SDK 的说明；
- 首发兼容版本范围 `>=0.31.0,<0.32.0` 和版本外升级/降级提示；
- `AIOS_HEADROOM=auto|on|off` 示例；
- 受支持客户端矩阵；
- Headroom 代理压缩与 CCR MCP 原文召回的职责区别；
- 默认关闭 RTK/TokenSave/Serena 重复层的官方 flags；
- interactive、one-shot、team 和 harness 的能力门禁，以及 argv prompt 日志风险；
- 健康检查和失败排查；
- Claude、Codex 和 OpenCode 的官方 durable 配置副作用与准确 `headroom unwrap` 命令；
- `auto/off` 在 durable provider 状态下 fail closed 的原因与恢复上下文；
- 上游基准来源说明；
- 本地处理与上游模型服务商流量之间的明确区别；
- 不删除用户凭据或客户端 profile 的回滚说明。

## 测试策略

实现遵循 TDD。必须覆盖以下测试组。

### 安装器测试

- 检测已经存在的 Headroom 可执行文件。
- 按顺序选择 `uv tool`、`pipx`，安装约束始终为 `>=0.31.0,<0.32.0`，并且不会回退到系统 Python。
- Python 低于 3.10 或没有隔离安装器时返回 `unsupported-platform`。
- 现有版本低于 `0.31.0` 或达到 `0.32.0` 时返回 `unsupported-version`，不得进入 `auto` wrapper。
- `headroom --version`、`--help` 和 `wrap --help` 是安装 smoke；proxy-down 的 `headroom doctor --json` 退出码 `2` 不算安装失败。
- 保证 `--dry-run` 无副作用。
- 在授权提示和汇总输出中包含 Headroom。
- 保留现有 RTK 客户端初始化映射。

### 运行时适配器测试

- `codex-cli` 精确生成 `headroom wrap codex --no-context-tool --no-tokensave --no-serena -- <args>`。
- `claude-code` 精确生成 `headroom wrap claude --no-context-tool --no-tokensave --no-serena -- <args>`。
- `opencode-cli` 精确生成 `headroom wrap opencode --no-context-tool --no-serena -- <args>`，且在 smoke 前保持能力门禁。
- 默认命令不包含 `--no-mcp`、`--memory`、`--learn` 或 `--code-graph`。
- `--` 后的参数逐项原样保留，包括空字符串、空格、引号和以 `-` 开头的值。
- 从 macOS/Linux `PATH` 和 Windows 大小写不敏感的 `Path` 中移除 native shim 目录，并用 `AIOS_HEADROOM_WRAPPED=1` 阻止递归。
- 保持 client registry 的真实 `commandName` 不变，且不包装 `headroom` 或外层 Node/`ctx-agent` 进程。
- Gemini、Hermes 和 Grok 在 `auto` 下走原客户端，在 `on` 下给出不支持错误。
- Headroom 缺失时，`auto` 只在调用官方 wrapper 前降级；wrapper 已经启动后返回非零时不得二次启动原客户端。
- `auto`/`off` 在官方 durable marker、backup 或 provider 存在时阻止裸启动；状态无法确定时同样 fail closed，并输出保留原 cwd/配置环境的 unwrap 命令。
- Claude/OpenCode 的 argv prompt 路径在 `auto` 下绕过，在 `on` 下报隐私错误；Codex stdin prompt 不得出现在 wrapper argv。
- Codex initial、retry 和 structured-output fallback 的每次实际 spawn 都重新生成完整 launch plan。
- team concurrency 大于 1 时，在共享配置并发 smoke 前遵守能力门禁。
- 遵守 `auto`、`on` 和 `off` 的失败语义。
- 不创建 Headroom PID/端口状态文件，不探测 readiness，不注入 provider base URL。
- 从日志和错误中移除敏感环境变量值。

### 官方 wrapper smoke

- 在隔离的临时 HOME/客户端配置目录中验证官方 Codex、Claude 和 OpenCode wrap 命令能够启动目标客户端。
- 验证 Headroom MCP 可提供 `headroom_retrieve`，本次 wrap 不新增 RTK context tool，且 Headroom-owned TokenSave/Serena 被跳过或移除；用户自行管理的 Serena 保持不变。
- 验证 Codex/OpenCode 的备份与 `headroom unwrap` 恢复，验证 Claude 项目代理设置正常退出后恢复；恢复命令保留原 cwd、`CLAUDE_CONFIG_DIR`、`CODEX_HOME`、`OPENCODE_CONFIG`/`OPENCODE_HOME`。
- 验证 Codex unwrap 后 config 字节恢复和 thread `model_provider` 重标行为。
- 从旧版默认 wrap 状态迁移时，验证 AIOS 只给出同上下文官方 unwrap 指引，不直接清理 RTK hooks、AGENTS 指令或用户管理的 MCP。
- 验证 interactive Ctrl-C、SIGTERM、普通退出码和无孤儿客户端/代理；无法保留 signal 身份时如实记录当前限制。
- 在至少两个并发 worker 下验证配置写入、恢复和代理 client marker 后，才允许 team concurrency 大于 1。
- 验证 smoke 不接触真实凭据、cookie、浏览器 profile 或用户生产配置。

### Ponytail Gate 测试

- skill frontmatter 和 catalog metadata 校验通过。
- canonical skill 同步后，各生成目录内容一致。
- workflow router 和 pre-edit gate 引用同一个 canonical skill 名称。
- 训练/评估用例能够区分安全简化与缺少校验、分支退化或删除测试。

### 仓库验证

至少运行：

```bash
npm run test:scripts
node scripts/check-skills-sync.mjs
node scripts/aios.mjs skill verify-training --changed --base HEAD --json
node scripts/aios.mjs clients doctor --json
node scripts/aios.mjs init --all --dry-run
```

如果修改了 `mcp-server` 行为：

```bash
cd mcp-server
npm run typecheck
npm run test
npm run build
```

任何 live support 声明都必须有对应适配器的不含 secret 的 smoke 会话证据。只有文件存在或单元测试通过是不够的。

## 发布步骤

1. 添加 Headroom 安装检测和测试，但暂不启用运行时路由。
2. 添加纯命令选择适配器和 Codex 官方 wrap 映射，并先放在 `AIOS_HEADROOM=on` 后面。
3. Codex live smoke 与官方 unwrap 恢复 smoke 通过后，对已验证安装把 `auto` 设为默认值。
4. 为 Claude 重复相同步骤，保留官方 tool-search 行为，并验证项目设置恢复。
5. 为 OpenCode 完成配置备份/恢复 smoke 后再启用 `auto`；Gemini、Hermes 和 Grok 继续能力门禁。
6. 添加并训练 Ponytail Gate，然后接入 canonical workflow skills。
7. 同步各客户端 skill 目录，并运行客户端能力与 agent smoke 检查。
8. 只按照已经验证的支持矩阵发布文档、blog 和 changelog。

## 非目标

- 不重新实现 Headroom、RTK 或 Caveman 的内部逻辑。
- 不恢复已废弃的 AIOS 原生拦截代理。
- 不由 AIOS 自己启动 Headroom proxy、注入 provider base URL 或注册 MCP。
- 不掩盖官方 wrapper 对客户端配置的持久修改；这些副作用和恢复命令属于公开契约。
- 不在正常退出时自动运行 `headroom unwrap`，除非未来有单独设计解决配置所有权和并发会话问题。
- 不因为上游宣传支持就启用未经验证的客户端。
- Caveman 已经负责回复简化时，不默认启用 Headroom output shaping。
- 不把更少 token、更少行或更少文件当作正确性证据。
- 不自动安装 Ponytail 官方插件或它的生命周期 hooks。

## 验收标准

只有满足以下条件，才可以认为实现已经就绪：

- `aios init` 能检测、授权、安装并分别报告 RTK、Caveman 和 Headroom。
- Headroom 版本必须处于 `>=0.31.0,<0.32.0`；范围外版本不会进入自动 wrapper。
- shell 或客户端启动期间绝不安装 Headroom。
- AIOS 管理的 Codex 和 Claude 通过官方 `headroom wrap` 启动，AIOS 不拥有代理 supervisor、provider 注入或 Headroom MCP 配置。
- 默认保留官方 Headroom MCP 的 CCR 召回能力，同时关闭重复的 context tool、TokenSave 和 Serena。
- interactive shell、one-shot、team 和 harness 均在每次真实客户端 spawn 前经过同一个 launch-plan adapter；client registry 和外层 Node harness 保持真实身份。
- native shim 防递归生效，Codex stdin prompt 不进入 argv，Claude/OpenCode 的 argv prompt 路径在消除日志风险前不会默认包装。
- OpenCode 只有在官方配置备份/恢复 smoke 通过后才进入 `auto` 支持矩阵；Gemini、Hermes 和 Grok 不伪装成已支持。
- team concurrency 大于 1 只有在官方配置并发 smoke 通过后才启用。
- `AIOS_HEADROOM=auto|off` 只有在只读 guard 确认不存在官方 durable provider 状态时才允许裸启动；否则 fail closed，并输出保留原 cwd 和客户端配置环境的 `headroom unwrap <target>` 指引。
- Codex、Claude 和 OpenCode 的配置副作用、故障恢复和官方 unwrap 行为都有隔离 smoke 证据。
- Ponytail Gate 是 canonical、已同步、已训练，并在正确的工作流阶段调用。
- 安全例外和完成证据保持完整。
- 文档、blog、changelog 和能力声明与最新测试、smoke 证据一致。
