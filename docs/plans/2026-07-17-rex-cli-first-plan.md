# rex-harness CLI-first 优化计划

## 目标架构

`rex-harness` 继续作为独立可用的工作流内核，但不再在核心包中内置 MCP Server：

```text
Coding Agent -> rex-workflow Skill -> rex-harness CLI -> 当前 Provider Skill
AIOS / 宿主 -> rex-harness JS API
完整状态     -> .rex-harness/ 持久化，不默认进入模型上下文
```

CLI 是跨客户端的对外协议，JS API 是宿主集成协议，Skill 是 Agent 的操作说明。未来如果需要 MCP，应由独立可选包适配 CLI 或 JS API，而不是重新进入核心包。

## 测试范围契约

### 用户目标

1. 独立 Coding Agent 只安装 `rex-harness`，也能通过原生 Skill 发现和 Shell 完成工作流闭环。
2. `start`、`status`、`resume`、`evidence` 默认只返回执行当前阶段所需的 compact Command。
3. 诊断时可显式使用 `--full` 读取完整 Workflow、Evidence 缺口和操作说明。
4. 核心包不再发布、依赖或宣传 rex MCP Server。
5. AIOS 继续通过 JS API 使用完整工作流对象，不依赖 CLI 文本或 MCP。

### 明确非目标

- 不新增 Agent Runner、模型调用器、MCP Server 或外部运行时依赖。
- 不改变 Capability 选择、Evidence 校验、状态持久化和 token 失效语义。
- 不把所有 Provider Skill 一次性注入 Agent 上下文。
- 不修改浏览器 MCP、ContextDB、RTK、Caveman 或 `mcp-server/dist`。

### 范围内行为

- CLI compact 协议暴露工作流状态、当前 Command、Provider 类型/标识、`instructionsRef`、阶段目标、预期 Evidence 和一次性 `commandToken`。
- `--full` 保留现有 `rex.standalone.workflow-result.v1` 完整对象。
- `rex-workflow` 只加载当前 Command 指向的 Provider Skill，一次只执行一个阶段，并在 Evidence 被接受后读取下一 Command。
- `init` 把 `rex-workflow` 与内置 Skill Provider 一起投影到受支持客户端的原生 Skill 目录。
- npm 包不再包含 `src/mcp/`、`src/cli/mcp.mjs` 或 MCP SDK 依赖。

### 范围外行为

- 不保证任意 Coding Agent 会自动执行 Shell；Skill 只定义可移植协议和 fail-closed 行为。
- 不为不支持原生 Skill 的客户端实现额外注入层。
- 不改变专项 Reviewer 的执行模型；当前 Command 仍以 `instructionsRef` 为唯一入口。

### 允许修改的测试缝

- 公共 CLI：`bin/rex-harness.mjs` 的 JSON stdout 和 usage stderr。
- 公共 JS API：`src/index.mjs` 现有 standalone exports。
- 客户端安装入口：`installClientProjection()` 生成的目录和 manifest。
- 发布边界：`package.json` 与 `npm pack --dry-run` 文件清单。
- Skill 契约：`skill-sources/rex-workflow/SKILL.md` 及其 evals。

### 禁止的假通过方式

- 不删除或跳过现有 standalone、Capability、Evidence、AIOS Adapter 测试。
- 不放宽 Evidence 类型、引用协议或 command token 校验。
- 不通过 mock 掉 CLI 子进程来代替公共入口测试。
- 不保留隐藏的核心 MCP export、script 或依赖来绕过删除契约。

## 验收行为映射

| 验收行为 | 公共观察点 | 断言 |
| --- | --- | --- |
| 默认输出节省上下文 | CLI `start/status/resume/evidence` stdout | 不包含 `workflow`、`activationHistory`、完整 instructions；包含当前 compact Command |
| 完整诊断仍可用 | CLI 同命令加 `--full` | 返回完整 Workflow，且 Activation History 可读取 |
| Agent 能发现编排入口 | `init --client <client>` 的目标目录 | 安装 `rex-workflow/SKILL.md`，manifest 记录该 Skill |
| 核心不再提供 MCP | CLI usage、公共 exports、package manifest、打包清单 | 无 `mcp` 命令、MCP export/script/dependency/source 文件 |
| AIOS 不受 CLI 输出变化影响 | AIOS rex Adapter 集成测试 | 继续通过 JS API 获得完整 Workflow 并推进 Evidence |
| Skill 不扩大上下文 | Skill 文本契约 | 明确按 `instructionsRef` 延迟读取，禁止预载全部 Provider 和完整历史 |

## 最小纵向切片

先让 standalone CLI 的 `start -> evidence -> resume` 在默认 compact、显式 full 两种模式下通过真实子进程测试。这个切片同时覆盖外部协议、一次性 token、状态持久化和下一 Command，是本次目标的最小完整代表。随后再删除 MCP 和接入 `rex-workflow` 安装投影。

## 实现顺序

1. 添加失败的 CLI、客户端安装、Skill 与包边界契约测试。
2. 新增 CLI 专属 compact presenter；保持 standalone JS API 返回完整对象。
3. 为四个工作流 CLI 命令接入 `--full`，默认使用 compact presenter。
4. 新增 `rex-workflow` Skill 与 evals，并显式纳入客户端投影。
5. 删除核心 MCP 命令、源码、测试、export、script 和依赖。
6. 同步 README、架构文档和 Changelog。
7. 运行 rex-harness 全量、AIOS rex 集成、Skill、Doctor、打包和安全验证。

## 完成判据

- 新旧测试全部通过，且新增测试先观察到预期失败。
- 默认 CLI 输出不包含完整 Workflow；`--full` 保持诊断能力。
- `rex-workflow` 可被四类客户端原生发现，并能仅凭 CLI + Provider Skill 描述闭环工作流。
- rex 核心包不包含 MCP SDK 或 MCP Server 入口。
- AIOS Adapter 测试证明宿主仍走 JS API。
- `npm pack --dry-run`、Doctor、`git diff --check` 和安全扫描通过。
