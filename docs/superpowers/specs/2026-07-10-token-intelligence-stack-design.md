# AIOS Token 与智能工作流栈设计

日期：2026-07-10
状态：已批准进入实施规划
范围：安装并组合 Headroom、RTK、Caveman、ContextDB 和受 Ponytail 启发的决策门禁，同时不恢复已经废弃的 AIOS 原生拦截运行时

## 目标

让 AIOS 管理的会话自动减少 token 消耗，同时提升实现判断质量，而不只是让回复变短。

整套工作流由五个职责互不重叠的层组成：

| 层 | 职责 |
| --- | --- |
| Ponytail Gate | 避免不必要的代码、依赖、抽象和文件。 |
| RTK | 在 shell 和工具输出进入 agent 上下文前压缩它们。 |
| Headroom | 压缩模型输入，尽可能保持服务商缓存稳定，并保留原文召回能力。 |
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

决策：**组合并扩展（Compose and Extend）**。

- 采用社区维护的 RTK、Caveman 和 Headroom 发行版，不重新实现它们的数据面。
- 用一层轻量、可测试的适配器扩展 AIOS 的安装和启动边界。
- 把 Ponytail 的决策阶梯改造成 AIOS 原生技能，不在每一轮对话中注入完整上游规则。
- 标注 Ponytail 来源并保留其安全例外；除非官方插件已经单独安装并通过 smoke 验证，否则不宣称安装了官方插件，也不宣称行为完全一致。

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
  -> Headroom 压缩模型输入并保留原文召回路径
  -> Caveman 压缩回复表达
  -> Ponytail diff review 删除可避免的实现
  -> verification 保留精确证据
```

控制面与数据面保持分离：

- 控制面：工作流路由、Ponytail Gate、ContextDB 内容选择规则、安全门禁、文档和能力状态报告。
- 数据面：RTK 命令输出过滤、Headroom 请求代理以及模型服务商的正常传输链路。

AIOS 不恢复 `scripts/aios-intercept.mjs` 或 `scripts/aios-mcp-proxy.mjs`。这些文件继续保留为已废弃的参考代码。

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
  headroom: 'installed|missing|unsupported|failed'
}
```

安装顺序：

1. 在不修改机器状态的前提下检测三个工具。
2. 显示一次统一授权提示，说明下载来源、本地处理、可选模型资源和网络端点。
3. 使用现有平台策略安装 RTK。
4. 使用现有平台策略安装 Caveman。
5. 在隔离的 Python 工具环境中安装 Headroom。
6. 验证三个工具的可用性和准确版本。
7. 为检测到的客户端初始化 RTK。
8. 分别报告每个工具的状态；任何一个可选层失败时，都不能把结果描述为完整工作流已经就绪。

Headroom 安装策略：

1. 要求 Python 3.10 或更高版本。
2. 优先执行 `uv tool install "headroom-ai[all]"`。
3. 当 `uv` 不可用时，回退到 `pipx install "headroom-ai[all]"`。
4. 禁止静默安装到当前系统 Python 环境。
5. 如果 `uv` 和 `pipx` 都不可用，则返回 `unsupported` 并给出准确的手动安装命令，而不是修改用户的 Python 环境。
6. 使用 `headroom --version` 验证；随后运行有明确超时限制、且不会修改服务商配置的 readiness/doctor 检查。

`--dry-run` 只报告将要安装的内容以及缺少的前置条件，不下载包、模型或二进制文件。

授权提示必须明确说明：

- RTK 和 Caveman 在本地运行。
- Headroom 默认以 loopback 本地代理形式运行。
- 安装过程可能访问 Headroom 文档中列出的包仓库、GitHub Release 和可选模型资源地址。
- 模型请求经过本地代理后，仍然会发送到用户配置的 LLM 服务商。
- `--yes-compression-tools` 表示对三个工具进行无人值守安装的明确授权。

## Headroom 运行时契约

安装 Headroom 本身不会改变流量路由。只有当 AIOS 通过 shell bridge、`ctx-agent`、team runtime 或 harness runtime 启动受支持客户端时，才会启用代理路由。

由一个职责单一的运行时适配层管理这些行为：

```text
scripts/lib/headroom/
  config.mjs       # 解析环境变量、配置和默认值
  runtime.mjs      # 健康检查、启动/复用和有界 readiness 等待
  providers.mjs    # 每个客户端的环境变量映射和能力矩阵
```

共享运行时状态保存在仓库外的 `~/.aios/runtime/headroom.json`。其中只记录非敏感生命周期数据：PID、端口、可执行文件路径、模式、启动时间和日志路径。启动时使用用户级锁，避免多个 AIOS 会话并发启动重复代理。单个 agent 退出后，代理继续保留以供其他会话复用。

生命周期命令必须明确且幂等：

```bash
node scripts/aios.mjs compression status
node scripts/aios.mjs compression start
node scripts/aios.mjs compression stop
```

`stop` 只能终止状态文件中记录的 AIOS 自有 PID，并且终止前必须验证该进程和 readiness 端点仍然属于受管 Headroom 代理。不能因为外部 Headroom 实例占用了同一个端口，就终止它。

默认配置：

| 设置 | 默认值 | 含义 |
| --- | --- | --- |
| `AIOS_HEADROOM` | `auto` | Headroom 已安装且客户端适配器通过验证时自动使用。 |
| `AIOS_HEADROOM_PORT` | `8787` | 首先探测的 loopback 端口。 |
| `AIOS_HEADROOM_MODE` | `token` | 优先减少实际输入 token。 |
| `AIOS_HEADROOM_START_TIMEOUT_MS` | `45000` | 限制冷启动和模型初始化等待时间。 |
| `HEADROOM_OUTPUT_SHAPER` | 未设置/关闭 | 默认由 Caveman 负责输出简化，避免重复塑形。 |

`AIOS_HEADROOM` 接受以下值：

- `auto`：对已经验证的客户端适配器启动或复用 Headroom；缺失或失败时安全降级。
- `on`：强制要求 Headroom；如果无法恢复健康状态，则用可操作错误终止受管客户端启动。
- `off`：绕过 Headroom，保留 RTK、Caveman 和 ContextDB 的现有行为。

运行时顺序：

1. 判断当前客户端是否存在已验证适配器。
2. 使用短超时探测 `http://127.0.0.1:<port>/readyz`。
3. 如果已有健康 Headroom 代理，则直接复用。
4. 如果端口被非 Headroom 服务占用，则在有界端口范围内选择其他端口，不接管现有进程。
5. 如果没有健康代理，则在仓库外记录日志，并以独立本地进程启动 `headroom proxy --host 127.0.0.1 --port <port> --mode <mode>`。
6. 最多等待 `AIOS_HEADROOM_START_TIMEOUT_MS`。
7. 只向将要启动的子进程注入代理环境变量。
8. 正常 AIOS 启动过程绝不改写用户的全局模型服务商配置。

AIOS 不能在现有包装器内部再次调用 `headroom wrap <client>`。这种嵌套会产生两层生命周期所有权，还可能修改 AIOS 不拥有的全局客户端配置。

首批适配器矩阵：

| AIOS runtime | 子进程配置 | 发布状态 |
| --- | --- | --- |
| `codex-cli` | `OPENAI_BASE_URL=http://127.0.0.1:<port>/v1` | 第一批实现并进行 smoke 验证。 |
| `claude-code` | `ANTHROPIC_BASE_URL=http://127.0.0.1:<port>` 和 `ENABLE_TOOL_SEARCH=true` | 第一批实现并进行 smoke 验证。 |
| `opencode-cli` | 在验证“不修改全局配置”的启动契约前不默认路由。 | 能力门禁。 |
| Gemini、Hermes、Grok | 不假设任何代理环境变量。 | 在获得 smoke 证据前只使用 RTK/Caveman/ContextDB。 |

该矩阵有意采用保守策略。上游文档声称支持某个 agent，并不能证明 AIOS 的非持久化启动适配器已经正确。

### 失败行为

在 `auto` 模式下：

- Headroom 未安装：每次启动最多警告一次，然后不使用 Headroom 继续执行。
- 代理不健康：保留第一条可操作错误，然后不使用 Headroom 继续执行。
- 端口冲突：选择有界范围内的备用端口。
- readiness 超时：只终止由本次 AIOS 启动的代理进程，然后继续执行。
- 已有自定义服务商 base URL：不得静默覆盖；报告冲突并绕过 Headroom。

在 `on` 模式下，同样的条件会用非零退出码终止受管客户端启动，并提供准确的修复方式。

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
- `AIOS_HEADROOM=auto|on|off` 示例；
- 受支持客户端矩阵；
- 健康检查和失败排查；
- 上游基准来源说明；
- 本地处理与上游模型服务商流量之间的明确区别；
- 不删除用户凭据或客户端 profile 的回滚说明。

## 测试策略

实现遵循 TDD。必须覆盖以下测试组。

### 安装器测试

- 检测已经存在的 Headroom 可执行文件。
- 按顺序选择 `uv tool`、`pipx`，并且不会回退到系统 Python。
- Python 低于 3.10 或没有隔离安装器时返回 `unsupported`。
- 保证 `--dry-run` 无副作用。
- 在授权提示和汇总输出中包含 Headroom。
- 保留现有 RTK 客户端初始化映射。

### 运行时适配器测试

- 复用健康的 loopback 代理。
- 在可用端口启动 Headroom 并等待 readiness。
- 避开占用端口的非 Headroom 服务。
- 确定性超时，并且只清理由 AIOS 启动的进程。
- 串行化并发启动，只持久化非敏感生命周期状态。
- 只停止经过验证的 AIOS 自有代理 PID，保留外部管理实例。
- 保留已有的自定义服务商 base URL。
- 为 Codex 和 Claude 注入正确的子进程环境变量。
- 遵守 `auto`、`on` 和 `off` 的失败语义。
- 从日志和错误中移除敏感环境变量值。

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
2. 添加 runtime supervisor 和 Codex 适配器，并先放在 `AIOS_HEADROOM=on` 后面。
3. Codex live smoke 通过后，对已验证安装把 `auto` 设为默认值。
4. 为 Claude 重复相同步骤，并保留 tool-search 行为。
5. 添加并训练 Ponytail Gate，然后接入 canonical workflow skills。
6. 同步各客户端 skill 目录，并运行客户端能力与 agent smoke 检查。
7. 只按照已经验证的支持矩阵发布文档、blog 和 changelog。

## 非目标

- 不重新实现 Headroom、RTK 或 Caveman 的内部逻辑。
- 不恢复已废弃的 AIOS 原生拦截代理。
- 正常启动时不修改用户全局服务商配置。
- 不因为上游宣传支持就启用未经验证的客户端。
- Caveman 已经负责回复简化时，不默认启用 Headroom output shaping。
- 不把更少 token、更少行或更少文件当作正确性证据。
- 不自动安装 Ponytail 官方插件或它的生命周期 hooks。

## 验收标准

只有满足以下条件，才可以认为实现已经就绪：

- `aios init` 能检测、授权、安装并分别报告 RTK、Caveman 和 Headroom。
- shell 或客户端启动期间绝不安装 Headroom。
- AIOS 管理的 Codex 和 Claude 能在不持久化修改服务商配置的前提下启动或复用健康 loopback 代理。
- `AIOS_HEADROOM=off` 能让启动流程恢复为现有 RTK/Caveman/ContextDB 路径。
- Ponytail Gate 是 canonical、已同步、已训练，并在正确的工作流阶段调用。
- 安全例外和完成证据保持完整。
- 文档、blog、changelog 和能力声明与最新测试、smoke 证据一致。
