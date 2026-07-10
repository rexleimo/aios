# AIOS Token 与智能工作流栈设计

日期：2026-07-10
状态：MCP 混合接入方案已获用户确认，等待书面规格复核
范围：安装并组合 Headroom、RTK、Caveman、ContextDB 和受 Ponytail 启发的决策门禁，同时不恢复已经废弃的 AIOS 原生拦截运行时

## 目标

让 AIOS 管理的会话自动减少 token 消耗，同时提升实现判断质量，而不只是让回复变短。

整套工作流由五个职责互不重叠的层组成：

| 层 | 职责 |
| --- | --- |
| Ponytail Gate | 避免不必要的代码、依赖、抽象和文件。 |
| RTK | 在 shell 和工具输出进入 agent 上下文前压缩它们。 |
| Headroom | 对官方支持的客户端使用 `headroom wrap` 自动压缩；对不支持 wrap 的客户端注册官方 `headroom mcp serve`，提供显式按需压缩、原文召回和统计。 |
| Caveman | 在不删除技术事实的前提下减少 agent 回复的冗余表达。 |
| ContextDB | 让历史上下文保持按需拉取、受预算约束并且可以选择性召回。 |

Superpowers、TDD、CRG、隐私检查和验证流程继续作为这套工作流外围的质量与安全控制。任何压缩层都不能取代它们。

## 外部来源与采用决策

2026-07-10 调研的主要来源：

- Ponytail：<https://github.com/DietrichGebert/ponytail>
- Headroom：<https://github.com/chopratejas/headroom>
- RTK：<https://github.com/rtk-ai/rtk>
- Caveman：<https://github.com/JuliusBrussee/caveman>
- 用户提供的 Grok 讨论：<https://grok.com/share/bGVnYWN5LWNvcHk_b8994159-cbea-4fab-b42d-e41ad375f825>

决策：**采用并组合（Adopt and Compose）**。

- 采用社区维护的 RTK、Caveman 和 Headroom 官方发行版，不重新实现它们的数据面。
- Headroom 严格使用官方 Python CLI：Codex、Claude 和 OpenCode 走官方 `headroom wrap <client>` / `headroom unwrap <client>`；Gemini、Hermes 和 Grok 通过各客户端官方 MCP 命令注册同一个官方 `headroom mcp serve`。
- AIOS 不仿造 Headroom provider、代理、MCP server 或压缩算法。AIOS 只实现轻量、可测试的 wrap 命令选择适配器，以及客户端原生 MCP 注册适配器。
- 不把 MCP-only 描述成透明压缩。MCP 工具由模型显式调用，不能自动拦截模型 API 请求；对官方支持的客户端继续保留 wrap，避免为了统一表面形式而丢失自动压缩能力。
- 把 Ponytail 的决策阶梯改造成 AIOS 原生技能，不在每一轮对话中注入完整上游规则。
- 标注 Ponytail 来源并保留其安全例外；除非官方插件已经单独安装并通过 smoke 验证，否则不宣称安装了官方插件，也不宣称行为完全一致。

本次 Headroom MCP 行为核对基于上游提交 `7dbb9c3810618641e0707172d1dc61bce7614f41`、版本 `0.31.0`。官方 MCP server 暴露 `headroom_compress`、`headroom_retrieve` 和 `headroom_stats`；实验性的 `headroom_read` 只有在 `HEADROOM_MCP_READ=on` 时出现。官方 `headroom mcp install` 当前只内建 Claude、Codex 和 OpenCode registrar，因此 Gemini、Hermes 和 Grok 必须由 AIOS 调用对应客户端的官方 MCP 注册命令。

官方当前提供 `claude`、`codex`、`copilot`、`aider`、`vibe`、`cursor`、`cline`、`continue`、`goose`、`openhands`、`openclaw` 和 `opencode` 共 12 个 wrap target；没有 `gemini`、`hermes` 或 `grok` target。AIOS 只启用自己能够完成 live smoke 的映射，不把“上游存在子命令”或“MCP 配置已写入”等同于“AIOS 已验证支持”。

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
  -> AIOS 根据客户端能力选择 Headroom 路径
       -> Codex / Claude / OpenCode：官方 headroom wrap
       -> Gemini / Hermes / Grok：原生客户端 + 官方 headroom mcp serve
  -> wrap 路径在模型看到内容前自动压缩
  -> MCP 路径由模型显式压缩将跨步骤保留的大内容，并按 hash 召回
  -> Caveman 压缩回复表达
  -> Ponytail diff review 删除可避免的实现
  -> verification 保留精确证据
```

控制面与数据面保持分离：

- AIOS 控制面：工作流路由、Ponytail Gate、ContextDB 内容选择规则、安全门禁、runtime ID 映射、wrap 选择、MCP 注册所有权、文档和能力状态报告。
- Headroom 官方控制面：`wrap`/`unwrap`、客户端 provider/MCP 配置、代理复用、端口选择、client marker 和代理退出清理。
- 客户端官方控制面：Gemini、Hermes 和 Grok 的 `mcp add/remove/list/test|doctor` 命令及其用户级配置。
- 数据面：RTK 命令输出过滤、Headroom 官方本地代理、Headroom 官方 stdio MCP 进程以及模型服务商的正常传输链路。

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

无人值守安装并注册无需宿主交互确认的 MCP 客户端：

```bash
node scripts/aios.mjs init --all --yes-compression-tools --yes-headroom-mcp
```

第二条命令可以为 Gemini 和 Grok 提供无人值守的 AIOS 配置授权，但不能绕过 Hermes 官方 CLI 的工具启用提示。检测到 Hermes 且当前没有 TTY 时，必须保留为 `pending-interactive`，由用户稍后在交互终端完成。

现有 `ensureCompressionTools()` 流程扩展为三个工具的状态契约：

```js
{
  rtk: 'installed|missing|failed',
  caveman: 'installed|missing|failed',
  headroom: 'installed|missing|unsupported-platform|unsupported-version|failed',
  headroomMcp: {
    'gemini-cli': 'not-detected|pending-consent|registered|external|conflict|pending-smoke|verified|failed',
    'hermes-agent': 'not-detected|pending-consent|pending-interactive|registered|external|conflict|pending-smoke|verified|failed',
    'grok-build': 'not-detected|pending-consent|registered|external|conflict|pending-smoke|verified|failed'
  }
}
```

`registered` 表示 AIOS 已重新读取客户端配置并确认 AIOS-owned 指纹完全匹配；`pending-smoke` 表示配置和 MCP 握手已通过，但尚未完成真实 `compress -> retrieve -> stats` 验收；`verified` 只在完整 smoke 通过且统计证据满足下文门禁后出现。`pending-consent` 表示尚未获得修改客户端配置的授权，`pending-interactive` 专指 Hermes 已获得 AIOS 授权但仍需要官方 CLI 的交互式工具确认。

安装顺序：

1. 在不修改机器状态的前提下检测三个工具。
2. 显示一次统一授权提示，说明下载来源、本地处理、可选模型资源和网络端点。
3. 使用现有平台策略安装 RTK。
4. 使用现有平台策略安装 Caveman。
5. 按 Headroom 官方 CLI 发行方式，在隔离的 Python 工具环境中安装 Headroom。
6. 验证三个工具的可用性和准确版本。
7. 为检测到的客户端初始化 RTK。
8. 经单独的客户端配置授权后，为已检测到的 Gemini 和 Grok 幂等注册官方 Headroom MCP；Hermes 只有在真实 TTY 中完成官方交互提示后才注册，非交互环境只报告 `pending-interactive`。
9. 分别报告每个工具和每个 MCP 客户端的状态；任何一个可选层失败时，都不能把结果描述为完整工作流已经就绪。

Headroom 安装策略：

1. 要求 Python 3.10 或更高版本。
2. 首发支持范围固定为 `headroom-ai>=0.31.0,<0.32.0`。AIOS 只有在更新适配器契约并重新完成 smoke 后才能放宽到新的 minor 版本。
3. 优先执行官方工具安装方式 `uv tool install "headroom-ai[all]>=0.31.0,<0.32.0"`。
4. 当 `uv` 不可用时，回退到隔离环境形式 `pipx install "headroom-ai[all]>=0.31.0,<0.32.0"`；文档同时列出上游原始 `pip install` 命令，但 AIOS 自动安装器不静默写入系统 Python。
5. 禁止静默安装到当前系统 Python 环境。
6. 如果 `uv` 和 `pipx` 都不可用，则返回 `unsupported-platform` 并给出准确的手动安装命令，而不是修改用户的 Python 环境。
7. 检测到范围外的现有版本时返回 `unsupported-version`；`auto` 不得调用 wrapper，安装流程只能在统一授权后升级或降级到支持范围。
8. 安装验收使用 `headroom --version`、`headroom --help`、`headroom wrap --help` 和 `headroom mcp serve --help`。`headroom doctor --json` 检查的是代理与客户端路由，没有运行中的代理时退出码 `2` 是正常的“未启动”状态，因此只作为运行时诊断，不作为 `aios init` 安装成功条件。
9. `aios init` 不运行 `headroom init`、`headroom install apply`、`headroom wrap` 或 `headroom proxy`。它只在得到客户端配置授权后注册官方 stdio MCP；受支持客户端的 provider/代理修改仍只发生在实际调用官方 wrapper 时。
10. 不对 Gemini、Hermes 或 Grok 调用 `headroom mcp install --force`。该官方命令没有这些 registrar，且 `--force` 可能覆盖同名用户配置。

`--dry-run` 只报告将要安装的内容以及缺少的前置条件，不下载包、模型或二进制文件。

授权提示必须明确说明：

- RTK 和 Caveman 在本地运行。
- Headroom 官方 wrapper 会在受支持客户端启动时管理 loopback 本地代理，并可能按官方契约修改客户端配置。
- 对不支持 wrap 的客户端，`aios init` 会调用客户端自己的官方 MCP 命令，在用户级配置中加入指向绝对 Headroom 可执行文件的 `headroom mcp serve`。
- MCP-only 是显式按需压缩：模型通常已经看过原文后才能把它传给 `headroom_compress`，因此当前 turn 可能不省 token，甚至会增加一次工具调用；收益主要来自后续步骤只保留压缩结果和 hash。
- 安装过程可能访问 Headroom 文档中列出的包仓库、GitHub Release 和可选模型资源地址。
- 模型请求经过本地代理后，仍然会发送到用户配置的 LLM 服务商。
- `--yes-compression-tools` 只表示对三个工具进行无人值守安装的明确授权。无人值守修改客户端用户配置必须另外传 `--yes-headroom-mcp`；不能把已有安装授权静默扩大为配置覆盖授权。
- `--yes-headroom-mcp` 只跳过 AIOS 对 Gemini/Grok 新注册的确认，不是宿主 CLI 的全局自动批准开关。它不能替 Hermes 回答 `Enable all ... tools?` 或覆盖确认，也不能授权 AIOS 直接写 Hermes 配置。

## Headroom 官方运行时契约

安装 Headroom 本身不会改变流量路由。只有当 AIOS 通过 shell bridge、`ctx-agent`、team runtime 或 harness runtime 启动具备官方 wrap target 且已通过 AIOS 验证的客户端时，才把原客户端命令交给官方 wrapper：

```text
shell function
  -> AIOS shell bridge / ctx-agent / ContextDB
  -> headroom wrap <official-target> <AIOS-selected-official-flags> -- <client-args>
  -> Headroom 官方代理、客户端配置和 MCP 生命周期
  -> 真实客户端
```

AIOS 的 wrap 路径只实现一个纯命令选择适配器。建议接口接收 `{ runtimeId, command, args, env, launchKind, concurrency }`，返回 `{ command, args, env, wrapped, reason }`。`launchKind` 至少区分 `interactive|one-shot|team|harness`。适配器必须在每一次真正 spawn 客户端之前执行，而不是改写 client registry 的真实 `commandName`，也不能包装只负责启动 `ctx-agent` 的外层 Node 进程。

wrap 适配器不得自行执行以下行为：

- 启动或复用 `headroom proxy`；
- 探测或分配 Headroom 端口；
- 注入 `OPENAI_BASE_URL`、`ANTHROPIC_BASE_URL` 或 provider 配置；
- 生成、写入或删除 Headroom MCP 配置；MCP-only 注册只允许发生在 `aios init` 的独立注册适配器中；
- 维护 Headroom PID、锁、端口或 readiness 状态文件；
- 仿造官方 wrap/unwrap 的备份与恢复协议。

适配器必须防止递归：调用 Headroom 前从 `PATH`/`Path` 中移除 `AIOS_NATIVE_SHIM_DIR`，设置 `AIOS_HEADROOM_WRAPPED=1`，检测到该标记时直接运行真实客户端，并且永不包装 `headroom` 自身。Headroom 官方 wrapper 会再次通过 PATH 查找真实客户端，仅把 AIOS 已解析出的绝对命令保存在 adapter 中不足以阻止它重新命中 shim。

这些行为全部由官方 `headroom wrap` 和 `headroom unwrap` 承担。AIOS 的 `compression status` 若继续存在，只能聚合 `command -v headroom`、版本兼容性、有界 `headroom doctor --json` 与当前能力矩阵，不能声称拥有代理进程。`doctor` 的 proxy-down 退出码必须显示为“当前未运行”，不能误报成安装损坏。

默认配置：

| 设置 | 默认值 | 含义 |
| --- | --- | --- |
| `AIOS_HEADROOM` | `auto` | Headroom 已安装且官方 target 已通过 AIOS smoke 时使用官方 wrapper。 |
| `AIOS_HEADROOM_MCP` | `auto` | `aios init` 经授权后为检测到的 MCP-only 客户端注册官方 server；`on` 要求成功，`off` 跳过新注册。 |
| `HEADROOM_OUTPUT_SHAPER` | 未设置/关闭 | 默认由 Caveman 负责输出简化，避免重复塑形。 |

`AIOS_HEADROOM` 接受以下值：

- `auto`：在调用 wrapper 之前，若 Headroom 缺失、版本不兼容、客户端无官方 target 或 AIOS 尚未验证该映射，则先执行只读 durable-state guard。只有确认当前客户端配置中没有官方 Headroom provider/marker/backup 时，才最多警告一次并走原客户端路径；检测到 durable 状态时必须阻止裸启动并给出同配置上下文的官方 unwrap 命令。
- `on`：强制要求官方 wrapper；Headroom 缺失、target 不支持或映射未验证时，用可操作错误终止启动。
- `off`：不调用官方 wrapper，保留 RTK、Caveman 和 ContextDB。它仍须执行同一只读 durable-state guard；若官方此前留下 durable 配置，则阻止裸启动并提示对应的 `headroom unwrap <target>`，不能把“仅跳过 wrapper”错误描述为已经恢复原生 provider。

`AIOS_HEADROOM` 只控制 wrap 路径，不控制 MCP 注册。对 Gemini、Hermes 和 Grok，`auto|off` 始终运行原客户端；`on` 因没有官方 wrap target 而报错，并明确提示改用 `AIOS_HEADROOM_MCP=on` 完成 init 注册。AIOS 不把 MCP-only 偷换成 wrapper 成功。

`AIOS_HEADROOM_MCP` 接受以下值：

- `auto`：检测到 MCP-only 客户端时，在交互式 init 中显示将修改的 user-scope 配置并请求确认；非交互环境没有 `--yes-headroom-mcp` 时跳过并报告 `pending-consent`。带该 flag 时可以继续 Gemini/Grok 注册；检测到 Hermes 但没有 TTY 时跳过 Hermes、报告 `pending-interactive`，且不能把整体结果描述为完整就绪。
- `on`：要求所有检测到的 MCP-only 客户端完成注册和握手；非交互环境缺少 `--yes-headroom-mcp`、发生冲突或握手失败时，以可操作错误结束 init。即使存在该 flag，只要检测到尚未注册的 Hermes 且没有 TTY，也必须以 `pending-interactive` 的可操作错误结束，不能伪造成功。
- `off`：跳过新注册，不删除现有条目；状态输出仍须区分 AIOS-owned、external 和 conflict。

`AIOS_HEADROOM_MCP` 只控制 `aios init` 是否创建新的 AIOS-managed MCP 注册，不会静默删除、禁用或覆盖已有客户端配置。`off` 遇到已有注册时只报告状态；移除必须走下文的所有权校验和客户端原生命令。

durable-state guard 只读取官方版本约束中已核对的 marker、backup 和配置位置，不写入或清理任何客户端文件。若状态无法确定，选择阻止启动而不是冒险连接已停止的 loopback provider。Gemini、Hermes、Grok 等没有官方 target 的 runtime 不存在本集成产生的 durable provider 状态；在 `AIOS_HEADROOM=auto|off` 时按原命令启动，并由客户端自己加载已经注册的 Headroom MCP。

一旦已经调用 `headroom wrap`，后续代理启动、端口回退、provider 冲突和客户端退出均由官方命令负责。若 wrapper 本身返回非零，AIOS 保留官方错误并终止本次启动，不再偷偷降级启动原客户端，因为官方命令可能已经写入可由 `headroom unwrap` 恢复的配置。

### 官方 MCP 与重复组件边界

Headroom 代理压缩不依赖 MCP；MCP-only 也不需要代理。两条路径职责不同：

- wrap 路径在模型看到内容前自动压缩，并保留由官方 wrapper 管理的 `headroom_retrieve`。官方 `--no-mcp` 帮助明确说明压缩标记将不可操作，因此 AIOS 不传 `--no-mcp`。
- MCP-only 路径由模型显式调用 `headroom_compress(content=...)`；原文在本地 store 保留 1 小时，可用 `headroom_retrieve(hash=...)` 召回；`headroom_stats` 汇总压缩次数、召回次数和 token 节省。
- MCP-only 不改写 Gemini、Hermes 或 Grok 的模型 endpoint，不代理 API 流量，也不自动压缩所有工具输出。模型通常必须先接收原文才能调用 `headroom_compress`，所以当前 turn 不保证节省，主要价值是减少后续步骤保留的上下文。
- 只有 `headroom_stats` 出现非零 `compressions` 和 `total_tokens_saved`，才可以把该客户端描述为“已产生实测节省”；配置存在、MCP 握手成功或工具列表出现都只能证明“可用”。
- 跨进程统计默认持久化在 `~/.headroom/session_stats.jsonl`。AIOS 可以读取聚合值，但不得把该文件中的历史值错误归因给当前客户端或当前 turn。

实验性的 `headroom_read` 默认禁用，并在 AIOS-managed 注册中显式设置 `HEADROOM_MCP_READ=off`。它第一次读取仍返回完整文件，只有重复读取未变化文件时才返回短 marker；同时接受绝对路径且当前没有 AIOS 路径 allowlist、敏感文件阻断和符号链接边界，因此不进入首发范围。

### MCP-only 注册契约

AIOS 先把 `headroom` 解析为可执行的绝对路径，再通过客户端官方 CLI 写用户级配置。若可执行文件缺失、不可执行或版本不兼容，必须在写任何客户端配置前失败。首发命令形状如下；参数必须以数组传给进程执行器，不能拼接成 shell 字符串：

| AIOS runtime | 官方注册命令形状 |
| --- | --- |
| `gemini-cli` | `gemini mcp add --scope user -e HEADROOM_MCP_CLIENT=gemini-cli -e HEADROOM_MCP_READ=off headroom <absolute-headroom> -- mcp serve` |
| `hermes-agent` | `hermes mcp add headroom --command <absolute-headroom> --env HEADROOM_MCP_CLIENT=hermes-agent HEADROOM_MCP_READ=off --args mcp serve` |
| `grok-build` | `grok mcp add --scope user -e HEADROOM_MCP_CLIENT=grok-build -e HEADROOM_MCP_READ=off headroom -- <absolute-headroom> mcp serve` |

Gemini 和 Grok 使用显式 user scope；Hermes 当前官方 CLI 没有 scope 选项，写入其用户配置。不得加入 Gemini `--trust`、Hermes `--accept-hooks`、Grok debug 选项或任何自动批准工具调用的设置。

Hermes 的官方 `mcp add` 不是纯配置写入：它会立即启动 stdio server、发现工具，并询问 `Enable all ... tools?`；同名条目存在时还会询问是否覆盖。该命令没有可依赖的非交互 `--force`，取消、连接失败和拒绝覆盖等路径仍可能返回退出码 `0`。因此 AIOS 只允许在 PTY 中调用它，不通过管道预填 `yes`，也不绕过官方命令直接写 YAML。无 TTY 时保持 `pending-interactive` 并打印可复制的官方命令。

注册必须遵守所有权和冲突规则：

1. 只读检查客户端配置中的 `headroom` 条目，不用可能启动 stdio server 的命令充当纯静态检查。Hermes 的 `mcp list` 会截断 command/args，必须结构化读取目标 profile 的 `config.yaml`，但只读验证不能变成 AIOS 直接写配置。
2. 条目不存在时才执行官方 `mcp add`，并通过 AIOS 用户状态解析器写入 `~/.aios/integrations/headroom-mcp.json`，记录客户端、scope、绝对命令、参数、环境变量和配置指纹；该 ledger 不得包含 secret。
3. 现有条目与目标完全一致但没有 AIOS ownership 记录时，标记为 `external` 并保留，不夺取所有权。
4. 同名条目不一致时标记为 `conflict`，不得调用会 upsert/覆盖的 `mcp add`，也不得自动换一个容易造成重复工具的别名。
5. 重复运行必须保持单一条目；绝对路径包含空格时仍按单个 argv 值保存。
6. 每次 `mcp add` 后都重新读取对应 scope/profile 的配置并验证完整指纹；不能只依赖命令退出码、`list` 的截断输出或一行成功文案。Hermes 还必须确认目标条目已保存、enabled/tool selection 与用户选择一致；退出码 `0` 本身不构成成功证据。
7. 注册后握手失败时，只回滚本次新建且当前指纹仍完全匹配的条目；任何用户随后修改过的配置都不得删除。
8. 自动移除同样只允许删除 AIOS-owned 且指纹匹配的条目。人工恢复命令分别为 `gemini mcp remove --scope user headroom`、`hermes mcp remove headroom` 和 `grok mcp remove --scope user headroom`，文档必须提醒这些原生命令会按名称删除，执行前先核对所有权。
9. Hermes 的 remove 同样需要官方交互命令并在执行后重新读取 profile 配置确认条目消失。非交互 stdin 的 EOF 可能接受其默认删除选项，因此 AIOS 在无 TTY 时不得调用 Hermes remove，只报告 `pending-interactive` 和人工命令。

MCP server 保持官方默认 WARNING 日志级别，不传 `--debug`。上游 info/debug 日志会记录工具参数和返回值，可能包含完整待压缩内容或召回原文。AIOS 工作流不得把 API key、cookie、Authorization header、`.env`、私钥、浏览器 profile、凭据配置或客户敏感数据传给 `headroom_compress`。

为避免和 AIOS 已有能力重复，默认关闭 Headroom wrapper 附带的其他层：

- 传 `--no-context-tool`，避免 Headroom 再安装 RTK、写 hooks 或注入 RTK 指令；
- Claude/Codex 同时传 `--no-tokensave --no-serena`，避免 TokenSave 与 Serena 代码图重复；只传 `--no-tokensave` 会回退到 Serena，因此两个参数缺一不可；
- OpenCode 传 `--no-serena`；其官方 wrapper 当前没有 `--no-tokensave`；
- 不默认传 `--memory`、`--learn` 或 `--code-graph`，因为 ContextDB、AIOS 计划与 CRG 已承担对应职责；
- 不默认启用 Headroom output shaping，由 Caveman 负责输出表达压缩。

这些 flags 约束的是本次官方 wrap 行为，不等于清理历史状态。`--no-context-tool` 不会删除旧 Headroom wrap 留下的 RTK hooks 或 AGENTS 指令；`--no-tokensave`/`--no-serena` 只清理由 Headroom ledger 证明为 Headroom-owned 的 MCP 条目，用户自行管理的 Serena 必须保留。检测到旧默认 wrap 状态时，AIOS 只报告迁移步骤：先在相同配置上下文执行官方 `headroom unwrap <target>`，再由 AIOS 重新启动，不自行删除旧配置。

首批能力映射：

| AIOS runtime | Headroom 路径 | 发布状态 |
| --- | --- | --- |
| `codex-cli` | `headroom wrap codex --no-context-tool --no-tokensave --no-serena --` | 第一批实现并进行 live smoke。 |
| `claude-code` | `headroom wrap claude --no-context-tool --no-tokensave --no-serena --` | 第一批实现并进行 live smoke。 |
| `opencode-cli` | `headroom wrap opencode --no-context-tool --no-serena --` | 在配置恢复 smoke 通过后启用。 |
| `gemini-cli` | 原生 `gemini` 启动 + 官方 Headroom MCP | 注册后仍标记 `pending-smoke`，真实工具调用和 stats 证据通过后升级。 |
| `hermes-agent` | 原生 `hermes` 启动 + 官方 Headroom MCP | 注册后仍标记 `pending-smoke`，真实工具调用和 stats 证据通过后升级。 |
| `grok-build` | 原生 `grok` 启动 + 官方 Headroom MCP | 注册后仍标记 `pending-smoke`，真实工具调用和 stats 证据通过后升级。 |

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
- Gemini MCP-only：用户级条目通常位于 `~/.gemini/settings.json`，并受 Gemini home 配置影响；项目级同名条目可能覆盖用户级可见行为。
- Hermes MCP-only：默认条目位于 `~/.hermes/config.yaml`；命名 profile 位于 `~/.hermes/profiles/<profile>/config.yaml`。`-p/--profile`、`--env` 等宿主参数必须出现在 `--args` 之前，因为 `--args` 后的所有 token 都会原样交给 Headroom。
- Grok MCP-only：用户级条目位于 `~/.grok/config.toml` 或对应 Grok home。`mcp add` 会更新同名条目，因此冲突检查必须发生在调用前。

AIOS 不在正常退出时自动调用 unwrap，以免破坏用户主动建立的官方持久配置或其他并发会话。禁用、回滚和故障排查必须显示准确的官方 unwrap 命令；任何自动清理功能若未来加入，必须先解决并发所有权并单独设计。

MCP-only 注册同样是持久客户端配置，但不涉及 provider 或代理。AIOS 不能把 `headroom mcp uninstall` 用在 Gemini、Hermes 或 Grok 上，因为上游 registrar 不拥有这些手工注册；必须使用客户端原生 remove 命令并先验证 AIOS ownership。

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

- 模型前实测输入节省：RTK 和 Headroom wrap/proxy 在模型看到内容前报告的数值。
- MCP 本地上下文压缩：`headroom_stats` 报告的压缩次数与 token 节省，必须明确标记为 MCP-local，不能冒充模型 API 的透明输入节省。
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
- `AIOS_HEADROOM_MCP=auto|on|off`、交互式配置授权和无人值守显式授权示例；
- 受支持客户端矩阵；
- Headroom wrap 的透明代理压缩，与 MCP-only 的显式 `compress/retrieve/stats` 职责区别；
- Gemini、Hermes 和 Grok 的官方 MCP 注册、状态检查、冲突处理和原生 remove 命令；
- MCP 当前 turn 不保证节省、`headroom_stats` 非零证据门禁，以及 `headroom_read` 默认关闭的原因；
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
- `headroom --version`、`--help`、`wrap --help` 和 `mcp serve --help` 是安装 smoke；proxy-down 的 `headroom doctor --json` 退出码 `2` 不算安装失败。
- 保证 `--dry-run` 无副作用。
- 在授权提示和汇总输出中包含 Headroom。
- 保留现有 RTK 客户端初始化映射。

### MCP 注册适配器测试

- Gemini 精确生成 user-scope `mcp add`，使用绝对 Headroom 路径、`--` 参数边界、`HEADROOM_MCP_CLIENT=gemini-cli` 和 `HEADROOM_MCP_READ=off`，且不包含 `--trust`。
- Hermes 精确生成 `--command <absolute-headroom>`，环境变量位于 `--args` 之前，`--args mcp serve` 保持最后。
- Grok 精确生成 user-scope `mcp add`，所有 server 命令位于 `--` 之后，不包含 debug 或自动批准选项。
- 非交互环境没有 `--yes-headroom-mcp` 时三个客户端都返回 `pending-consent`；带 flag 时 Gemini/Grok 可以继续，Hermes 必须返回 `pending-interactive`，且不启动 `hermes mcp add`。
- Hermes 只在 PTY 中运行官方 add/remove；测试覆盖工具启用提示、同名覆盖提示、取消路径和连接失败仍返回 `0` 的路径，成功判断始终来自配置重读和指纹校验。
- Headroom 可执行文件缺失、不可执行或版本不兼容时，不写入任何客户端配置。
- 绝对路径包含空格、引号或非默认 Python tool 目录时仍作为单个 argv 值传递。
- 重复运行不产生重复条目；同名同配置但非 AIOS-owned 的条目标记 `external`。
- 同名不同配置标记 `conflict`，Gemini/Grok 的 upsert 行为不能覆盖用户条目。
- 注册失败和握手失败只回滚本次新建且指纹未变化的条目；Hermes 无 TTY 时不尝试自动回滚或删除。
- 自动移除只删除 AIOS-owned 且当前指纹匹配的 user-scope/profile 条目；not-found 视为 no-op，项目级同名条目保持不变并显示遮蔽提示。
- `--dry-run` 显示将执行的客户端命令和冲突状态，但不运行 `mcp add/remove/list/test/doctor`。

### 运行时适配器测试

- `codex-cli` 精确生成 `headroom wrap codex --no-context-tool --no-tokensave --no-serena -- <args>`。
- `claude-code` 精确生成 `headroom wrap claude --no-context-tool --no-tokensave --no-serena -- <args>`。
- `opencode-cli` 精确生成 `headroom wrap opencode --no-context-tool --no-serena -- <args>`，且在 smoke 前保持能力门禁。
- 默认命令不包含 `--no-mcp`、`--memory`、`--learn` 或 `--code-graph`。
- `--` 后的参数逐项原样保留，包括空字符串、空格、引号和以 `-` 开头的值。
- 从 macOS/Linux `PATH` 和 Windows 大小写不敏感的 `Path` 中移除 native shim 目录，并用 `AIOS_HEADROOM_WRAPPED=1` 阻止递归。
- 保持 client registry 的真实 `commandName` 不变，且不包装 `headroom` 或外层 Node/`ctx-agent` 进程。
- Gemini、Hermes 和 Grok 在 `AIOS_HEADROOM=auto|off` 时走原客户端命令，在 `on` 时因无官方 wrap target 而给出指向 `AIOS_HEADROOM_MCP=on` 的错误；MCP 配置只由 init 注册语义决定，不能把 MCP-only 变成 wrap。
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

### 官方 MCP smoke

- 直接启动固定版本的 `headroom mcp serve`，完成 MCP initialize、`tools/list` 和 shutdown，工具列表必须包含 `headroom_compress`、`headroom_retrieve`、`headroom_stats`，且默认不包含 `headroom_read`。
- 对不含敏感信息的固定大文本调用 `headroom_compress`，再按 hash 调用 `headroom_retrieve`，验证原文一致且 1 小时 TTL 契约被保留。
- 调用 `headroom_stats`，只有 `compressions > 0` 且 `total_tokens_saved > 0` 时记录节省证据。
- 分别在隔离的 Gemini、Hermes 和 Grok home 中执行真实注册、客户端连接检查和原生 remove；Hermes smoke 必须使用 PTY 并真实处理工具启用/删除提示，不使用 `--trust`、管道自动应答、自动批准或生产用户配置。
- 验证项目级同名配置遮蔽、用户级冲突、绝对路径含空格、重复 init、失败回滚和 ownership 指纹变化。
- 默认日志级别不得输出完整压缩参数或召回原文；测试显式确认 AIOS 未传 `--debug`。
- 敏感输入门禁覆盖 API key、cookie、Authorization header、`.env`、私钥和凭据文件路径。

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
2. 添加 MCP 注册纯函数、ownership/冲突检测和固定版本 Headroom MCP 握手测试，但暂不写真实客户端配置。
3. 为 Gemini、Hermes 和 Grok 添加客户端官方命令适配器；Gemini/Grok 在隔离 home 完成 add/connect/stats/remove smoke，Hermes 另需 PTY 交互 smoke 和配置重读验证，之后才允许 `aios init` 注册。
4. 添加纯命令选择适配器和 Codex 官方 wrap 映射，并先放在 `AIOS_HEADROOM=on` 后面。
5. Codex live smoke 与官方 unwrap 恢复 smoke 通过后，对已验证安装把 `auto` 设为默认值。
6. 为 Claude 重复相同步骤，保留官方 tool-search 行为，并验证项目设置恢复。
7. 为 OpenCode 完成配置备份/恢复 smoke 后再启用 `auto`。
8. 添加并训练 Ponytail Gate，然后接入 canonical workflow skills。
9. 同步各客户端 skill 目录，并运行客户端能力与 agent smoke 检查。
10. 只按照已经验证的支持矩阵发布文档、blog 和 changelog。

## 非目标

- 不重新实现 Headroom、RTK 或 Caveman 的内部逻辑。
- 不恢复已废弃的 AIOS 原生拦截代理。
- 不由 AIOS 自己实现 Headroom MCP server、启动 Headroom proxy 或注入 provider base URL；AIOS 只在得到授权后调用客户端官方 MCP 注册命令。
- 不掩盖官方 wrapper 对客户端配置的持久修改；这些副作用和恢复命令属于公开契约。
- 不把 Gemini、Hermes 或 Grok 的 MCP 注册描述为透明代理、自动压缩全部流量或 wrap 等价支持。
- 不默认启用 `headroom_read`，也不自动批准任何 Headroom MCP 工具调用。
- 不在正常退出时自动运行 `headroom unwrap`，除非未来有单独设计解决配置所有权和并发会话问题。
- 不因为上游宣传支持就启用未经验证的客户端。
- Caveman 已经负责回复简化时，不默认启用 Headroom output shaping。
- 不把更少 token、更少行或更少文件当作正确性证据。
- 不自动安装 Ponytail 官方插件或它的生命周期 hooks。

## 验收标准

只有满足以下条件，才可以认为实现已经就绪：

- `aios init` 能检测、授权、安装并分别报告 RTK、Caveman、Headroom 以及 Gemini/Hermes/Grok 的 MCP 注册状态。
- Headroom 版本必须处于 `>=0.31.0,<0.32.0`；范围外版本不会进入自动 wrapper。
- shell 或客户端启动期间绝不安装 Headroom。
- AIOS 管理的 Codex 和 Claude 通过官方 `headroom wrap` 启动，AIOS 不拥有代理 supervisor 或 provider 注入。
- Gemini、Hermes 和 Grok 保持原生启动，只加载 AIOS 经授权、使用绝对路径注册的官方 `headroom mcp serve`。
- 同名用户 MCP 配置不会被覆盖；重复 init 幂等，失败回滚和移除只作用于指纹匹配的 AIOS-owned 条目。
- 无 TTY 的 Hermes 初始化不会调用官方 add/remove，也不会因退出码 `0` 伪装成功；状态明确停在 `pending-interactive` 并提供人工命令。
- 默认保留官方 Headroom MCP 的 CCR 召回能力，同时关闭重复的 context tool、TokenSave 和 Serena。
- MCP-only 客户端明确显示“显式按需压缩”；只有非零 `headroom_stats` 证据后才显示实测节省，`headroom_read` 默认不可见。
- interactive shell、one-shot、team 和 harness 均在每次真实客户端 spawn 前经过同一个 launch-plan adapter；client registry 和外层 Node harness 保持真实身份。
- native shim 防递归生效，Codex stdin prompt 不进入 argv，Claude/OpenCode 的 argv prompt 路径在消除日志风险前不会默认包装。
- OpenCode 只有在官方配置备份/恢复 smoke 通过后才进入 `auto` wrap 支持矩阵；Gemini、Hermes 和 Grok 只有完成各自真实 MCP smoke 后才从 `pending-smoke` 升级，且始终标记为 MCP-only。
- team concurrency 大于 1 只有在官方配置并发 smoke 通过后才启用。
- `AIOS_HEADROOM=auto|off` 只有在只读 guard 确认不存在官方 durable provider 状态时才允许裸启动；否则 fail closed，并输出保留原 cwd 和客户端配置环境的 `headroom unwrap <target>` 指引。
- Codex、Claude 和 OpenCode 的配置副作用、故障恢复和官方 unwrap 行为都有隔离 smoke 证据。
- Ponytail Gate 是 canonical、已同步、已训练，并在正确的工作流阶段调用。
- 安全例外和完成证据保持完整。
- 文档、blog、changelog 和能力声明与最新测试、smoke 证据一致。
