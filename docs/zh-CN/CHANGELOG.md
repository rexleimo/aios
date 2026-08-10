# 更新日志

本文件记录本项目的所有重要变更。

格式基于 Keep a Changelog，遵循语义化版本规范。

## [3.2.0] - 2026-07-01
### 新增
- feat(harness): 新增 consecutiveFailures 双计数器，连续失败 5 次后自动 abort session，避免无限重试浪费 token
- feat(offload): 新增 emergency 压缩第三级（100+ 节点触发，保留 5 个最近节点），防止 context overflow
- feat(harness): 新增 dry-run readiness 预检（ContextDB/Git/Provider/Session 4 维度），blocked 级别阻止 harness 启动
- feat(runtime): 新增 directive injection，从 .aios/config.json 读取 default_mode 注入到每轮迭代 prompt
- feat(memo): 新增 auto-dream 手动 CLI（scripts/lib/memo/autodream.mjs），支持 --preview 和 --apply 模式
- feat(skills): 新增 skill workshop stale 检测（比对文件 hash vs lock hash）和文件级 rollback 快照（保存 previousContent）

## [1.52.0] - 2026-06-11

### 新增
- feat(shell): 新增 `aios_shell` MCP 工具（`scripts/shell-mcp-server.mjs`），通过 MCP 代理对所有客户端实现确定性 shell 输出压缩
- feat(shell): 通过 `doctor --fix` 将 `aios-shell` 别名注册到全部 9 个客户端配置（`.mcp.json`、`.codex/config.toml`、`.gemini/settings.json`、`opencode.json`、`crush.json` 等）
- feat(shim): 为原生 shim 添加自愈机制 — 探测常见 AIOS 安装路径，当 bridge 不可达时 fail-open 直接执行真实客户端
- feat(shell): 在命令重写中为敏感命令（`git push`、`npm publish`）添加宿主权限审查守卫

### 变更
- feat(strict): 增强原生严格模式，验证受管 shim 背后是否存在真实下游客户端
- feat(rewrite): 在命令重写中拦截危险 shell 结构（`\n`、`\r`、单 `&`）
- feat(hook): Claude PreToolUse hook 不再强制自动允许；改用 envelope 式命令包装
- chore(deps): 升级 `proxy-inspector.mjs`，检查受管 MCP 别名（`mcp-browser-use`、`aios-shell`）

### 修复
- fix(shim): 修复当 `AIOS_ROOT_DIR` 未设置时，原生 shim 回退到过期的临时目录（`/var/folders/...`）

## [1.40.0] - 2026-05-31

### 新增

- feat(clients): 添加 Antigravity CLI 支持（替代已弃用的 Gemini CLI）
- feat(clients): 添加 Crush (charmbracelet) 客户端支持，支持 `--yolo` 无人值守模式
- feat(clients): 为 opencode 添加 team/model-router/harness 指令注入
- feat(clients): 添加 opencode 团队能力支持
- feat(opencode): 添加 opencode agent 管理和 agent 生成器
- feat(clients): 将 superpowers 能力扩展到全部 6 个客户端（codex、claude、gemini、antigravity、opencode、crush）
- feat(clients): 将 skills/native/harness 能力扩展到全部 6 个客户端

### 修复

- fix(clients): 为 crush 添加 modelArgFlag（`--model`）
- fix(clients): 将 crush 添加到 team 能力
- fix(clients): 将 opencode 添加到 superpowers 能力顺序
- fix(skills): 移除 XHS 专属技能，核心 AIOS 技能扩展到全部 6 个客户端
- fix(gemini): 将技能格式从 toml-command 回退到 markdown-directory
- fix(tests): 修复 codemap 去重断言和发布流水线缺失的 crush agent 生成器

### 变更

- refactor: 完成 AIOS 适配层第 5-10 阶段
- chore: 将 experiments/ 移至 .aios/experiments/ 并添加 gitignore

## [1.30.9] - 2026-05-28

- fix(windows): 保留 AIOS PowerShell 包装器参数

## [1.30.8] - 2026-05-28

- fix(windows): 保留 AIOS PowerShell 包装器参数

## [1.30.7] - 2026-05-28

- fix(codex): 发布 TOML agent 角色并验证 skill frontmatter

## [1.30.6] - 2026-05-28

- fix(tui): 在 setup/update/uninstall 操作后刷新已安装技能状态，使选择器反映当前磁盘状态
- fix(skills): 用引号包裹包含中文标点的 YAML frontmatter description 字段，防止解析错误

## [1.30.5] - 2026-05-27

- fix(superpowers): 按 catalog 客户端过滤 superpowers 技能

## [1.30.4] - 2026-05-27

- fix(skills): 整合压缩技能，添加 skill-opt-lite，修复 catalog 重复项

## [1.30.3] - 2026-05-26

- fix(team): 自动创建 plan artifact 并设置默认 ownedPathPrefixes 以解除 team 实时预检阻塞

## [1.30.2] - 2026-05-26

- fix(harness): 使 gate prompts 可恢复

## [1.30.1] - 2026-05-25

- fix(mcp): 处理 Windows shell 回退和 JSON-RPC 通知

## [1.30.0] - 2026-05-24

- refactor(aios): 拆分大型运行时模块，强制 generated/cache 忽略规则，保留多客户端 Windows 命令处理
- refactor(dispatch): 改进 CLI 退出码重置，将 refs/canvas 输出路由到注入的流
- ci: 为发布和性能烟雾测试工作流安装根脚本依赖

## [1.20.11] - 2026-05-23

- fix(windows): 直接启动 OpenCode 原生 npm 包装器，而非通过 cmd.exe shell 回退

## [1.20.10] - 2026-05-23

- fix(install): 避免将成功的原生 stderr 视为 PowerShell 一键安装期间的致命错误

## [1.20.9] - 2026-05-23

- fix(install): 在发布安装期间规范化 Windows PowerShell shell 包装器标志
- fix(install): 在发布安装期间规范化 Windows privacy-guard 包装器标志
- test(install): 为发布 PowerShell 安装器添加本地 Windows 安装烟雾测试覆盖

## [1.20.8] - 2026-05-23

- fix(install): 为 Windows 发布安装器下载和自更新引导强制 TLS 1.2
- fix(install): 当 Windows 安装器依赖设置命令非零退出时快速失败
- fix(tui): 通过本地 tsx 运行时启动 Ink TUI，清晰报告非交互终端限制

## [1.20.6] - 2026-05-22

- fix(memo): 在 Commander 边缘情况下优雅处理 -h/--help
- fix(cli): 放宽 node 版本检查到 >=24（原为 ==24），改进所有入口包装器中的 nvm 提示
- ci: 为 windows-shell-smoke 工作流添加根 npm install

## [1.20.5] - 2026-05-22

- feat(platform): 添加 Windows MCP 启动器 (run-browser-use-mcp.ps1)，跨平台浏览器可执行路径
- feat(platform): 添加 resolveVenvPythonPath、resolveShellCommand、resolvePythonCommand 跨平台辅助函数
- feat(platform): 添加 macOS/Windows/Linux 上的 Brave/Arc/Canary/Flatpak 浏览器候选路径
- fix(platform): 在 aios-cred.mjs 中用 uv run + 平台感知解析替换硬编码 python3
- fix(platform): 在 browser.mjs 和 self-update.mjs 中添加 HOME/USERPROFILE 回退
- fix(platform): 在 run-browser-use-mcp.sh 中为 macOS Keychain 安全 CLI 添加 uname 守卫
- fix(platform): 在 doctorBrowserMcp 中使用 resolveVenvPythonPath，resolveLauncherScript 用于平台感知脚本路径
- test(platform): 添加 platform-smoke.test.mjs（22 个断言覆盖 MCP 配置、启动器、浏览器路径、py/uv）
- docs: 添加平台审计报告

## [1.20.4] - 2026-05-22

- fix(install): 修复 PowerShell 5.1 兼容的 Join-Path 3 参数语法

## [1.20.3] - 2026-05-22

- fix(install): 处理带或不带 aios/ 前缀的归档（Windows + bash）
- fix(codemap): 修复多客户端 CRG 安装循环

## [1.20.2] - 2026-05-21

- fix(codemap): 修复 claude code MCP 配置路径和 codex createIfMissing 逻辑

## [1.20.1] - 2026-05-21

- feat(codemap): 将 code-review-graph 作为一等 AIOS 组件集成，附带文档、博客和国际化支持

## [1.19.0] - 2026-05-19

- feat: 添加 aios 版本和运行时更新

## [1.18.7] - 2026-05-19

- docs: 更新仓库 URL 到 aios

## [1.18.6] - 2026-05-19

- fix: 将发布归档重命名为 aios

## [1.18.5] - 2026-05-19

- docs: 将产品品牌重命名为 AIOS

## [1.18.4] - 2026-05-19

- ci: 为 Node 24 放宽 ContextDB 基准门控

## [1.18.3] - 2026-05-19

- fix: 对齐 mcp-server Node 运行时版本锁定

## [1.18.2] - 2026-05-19

- fix: 在 Node 24 上运行 GitHub 工作流

## [1.18.1] - 2026-05-19

- fix: 为 node:sqlite 对齐 Node 24 安装指南

## [1.18.0] - 2026-05-17

- feat(offload): 添加 canvas 回填和 Claude hook

## [1.17.1] - 2026-05-17

- fix: 为 shell 和 Stop hooks 固定 AIOS 根目录

## [1.17.0] - 2026-05-16

- feat(memo): 添加 git 友好的存储后端

## [1.16.0] - 2026-05-16

- feat(contextdb): 将运行时状态移入 .aios
- fix(contextdb): 在 .aios 运行时根目录下保持 workspace 元数据和 handoff 兼容性

## [1.15.1] - 2026-05-15

- fix: 恢复 aios init 发布入口

## [1.15.0] - 2026-05-14

- feat(contextdb): 添加项目本地 memo 谱系 GUI
- feat(contextdb): 添加关系优先 GUI 布局、双语标签和 tips 术语表
- fix(contextdb): 恢复 memo GUI 中的滚轮和按钮缩放交互

## [1.14.1] - 2026-05-14

- 修复 model-router 客户端启动标志

## [1.14.0] - 2026-05-14

- 添加 ContextDB 记忆谱系 TUI

## [1.13.1] - 2026-05-13

- 修复 shell 包装器 claude 打印提示路由

## [1.13.0] - 2026-05-13

- feat(native): 添加路由快捷方式

## [1.12.4] - 2026-05-13

- fix(shell): 为包装的 CLI 保留 PowerShell TTY

## [1.12.3] - 2026-05-12

- docs: 添加 token 压缩线框图和 X 草稿

## [1.12.2] - 2026-05-12

- docs: 添加 token 压缩网站和博客覆盖

## [1.12.1] - 2026-05-12

- fix(installer): 为发布安装运行首次设置

## [1.12.0] - 2026-05-11

- feat(harness): 持久化阶段检查点证据

## [1.11.2] - 2026-05-11

- fix: 以无人值守模式运行 Codex 子代理

## [1.11.1] - 2026-05-11

- 修复浏览器 MCP 安装器路径可移植性

## [1.11.0] - 2026-05-09

- feat(debug-hub): 添加插桩跟踪和自动清理 (v0.3.0)
  - 新 MCP 工具：`debug_hub.instrument`、`debug_hub.list_instruments`、`debug_hub.cleanup_instruments`
  - 标记约定 `DH:<sessionId>` 用于零依赖调试日志注入和清理
  - 双模式清理：显式（插桩记录）和发现（workspace grep 回退）
  - 干运行支持安全清理预览
- feat(debug-hub): 添加 debug-hub 技能替代上游 debug 技能
- feat(debug-hub): 通过 workspace memory 添加跨模型调试插桩协议

## [1.10.0] - 2026-05-09

- feat(debug-hub): 添加 agent 调试会话和 trace 物化
- fix(debug-hub): 去抖 trace 物化，强化路径安全，添加输入验证，改进搜索正确性

## [1.9.0] - 2026-05-08

- 启用 model-router 按阶段 team 调度

## [1.8.1] - 2026-05-08

- 修复本地化文档链接和站点验证
- feat(perception): 添加内容结果记录、洞察生成和感知摘要用于 agent 学习循环
- feat(debug-hub): 添加 MCP 原生调试日志服务，支持 Node.js/Browser/Go SDK、嵌入式 Web UI 和文件存储

## [1.8.0] - 2026-05-08

- feat(model-router): 为多模型 Agent Team 添加智能模型调度
  - 模型能力注册表（`memory/specs/model-registry.json`），包含 8 个模型和结构化优势/成本/CLI 协议
  - 任务类型到模型路由：code-review→Opus，implementation→DeepSeek，research→Gemini，browser→GPT-5.5 等
  - 三种 CLI 协议适配器：claude (--model)、codex (-m)、gemini (-m)
  - 所有任务类型的成本升序回退链
  - agent 可调用的 `model-router` 技能用于自助路由
  - `model-router list|route|stats` CLI 命令
  - 编排器 agent 卡片带 `preferredModel` 字段（env var → preferredModel → model 回退）
  - `AIOS_MODEL_{ROLE}` 环境变量覆盖
  - 感知集成：模型调度事件记录到 ContextDB 用于历史成功率学习
  - 注入 AIOS Task Router 指南以自动 agent 感知
- feat: 为包装的 agent 添加自触发 harness 路由

## [1.7.1] - 2026-04-26

- docs(blog): 添加 solo harness 发布文章
- docs(memo): 澄清现有 persona 和用户配置文件记忆

## [1.7.0] - 2026-04-26

- feat(harness): 添加 solo 通宵 harness 和官方文档

## [1.6.3] - 2026-04-25

- docs(site): 跨语言环境同步视觉引导

## [1.6.2] - 2026-04-25

- docs(site): 为中文文档添加视觉引导

## [1.6.1] - 2026-04-25

- fix(release): 恢复 GitHub 发布流水线，简化中文引导文档

## [1.6.0] - 2026-04-25

- feat(aios): 整合合并的功能工作
- feat(competitors): 添加 watchlist 路线图和更新脚本
- feat(team): 添加 watchdog 恢复命令和状态集成
- feat(contextdb): 添加搜索解释和卫生干运行工具
- fix(contextdb): 在 context packet 刷新期间忽略过时的生成 ContextDB CLI

## [1.5.0] - 2026-04-25

- feat(orchestrate): 添加 plan 所有权预检门控

## [1.4.0] - 2026-04-25

- feat(contextdb): 添加紧凑连续性摘要

## [1.3.1] - 2026-04-24

- fix(release): 引导直接安装器依赖

## [1.3.0] - 2026-04-24

- feat(harness): 在 team HUD 中展示调度洞察

## [1.2.0] - 2026-04-24

- feat: 为包装的 coding agent 会话添加 Privacy Shield

## [1.1.0] - 2026-04-02

- feat(tui): 切换到 React Ink + Ink UI 组件架构重构 TUI 安装器
- feat(tui-ink): 添加基于 MemoryRouter 的屏幕导航（MainScreen、SetupScreen、UpdateScreen、UninstallScreen、DoctorScreen、SkillPickerScreen、ConfirmScreen）
- feat(tui-ink): 添加 useSetupOptions hook 共享选项状态
- feat(tui-ink): 添加自定义 ScrollableSelect 组件实现技能选择器滚动窗口
- feat(tui-ink): 添加 Header、Footer、Checkbox 组件
- refactor(tui): 移除旧的字符串渲染 TUI 实现
- fix(tui-ink): 补充 React 导入并修复 tsx 执行
- docs: 添加 Ink TUI 重构设计与实现计划文档

## [1.0.0] - 2026-03-17

- feat(skills): 采用规范化的技能源码树，统一使用 Node 22
- feat(aios): 将编排器 agent 接入生命周期组件
- feat(orchestrate): 从编排器蓝图派生各阶段
- feat(harness): 通过 CLI 子代理实现 `subagent-runtime` 实时执行（`AIOS_SUBAGENT_CLIENT=codex-cli|claude-code|gemini-cli`）
- feat(harness): 优先使用 codex-cli v0.114+ 的结构化输出（`--output-schema`、`--output-last-message`、stdin）实现稳定的 JSON 交接（对旧版本做降级处理）
- feat(skills): 添加作用域感知的目录驱动安装流程，支持 `global` 和 `project` 作用域
- feat(skills): 在两个作用域选择器中暴露项目级技能，不做默认选中
- feat(skills): 默认核心技能集包含 `skill-constraints`、`aios-project-system`、`aios-long-running-harness` 和 `contextdb-autopilot`
- feat(tui): 显示技能描述，将技能分组为 `Core` / `Optional`，卸载时仅显示已安装技能
- fix(skills): doctor 检查时警告项目安装覆盖全局安装的情况
- fix(learn-eval): 将 ContextDB 质量失败路由到具体门控目标
- fix(ctx-agent): context:pack 失败时默认开放（设置 `CTXDB_PACK_STRICT=1` 使其致命）
- fix(ctx-agent): 通过 shell 感知的 spawn 规范支持 cmd 封装的 CLI 包装器（防止 Windows 包装器回归）
- fix(contextdb): 容错旧版 context 记录（缺失 text/refs/actions）于 context pack 中
- test(contextdb): 添加 ContextDB 质量门控，防止 context:pack 回归
- docs: 记录 orchestrate 实时执行与子代理运行时环境控制
- docs(blog): 添加子代理运行时发布说明
- docs(blog): 添加作用域感知技能安装体验发布说明

## [0.17.0] - 2026-03-17

- feat(tui): 添加卸载选择器滚动、底部锚定批量操作，以及安装/更新选择器中的已安装标记
- fix(tui): 保持卸载选择器光标选择与渲染分组顺序对齐
- docs: 更新 README 和文档站 onboarding 文案，适配改进后的技能选择器 UX
- docs(blog): 在技能安装体验文章中补充最新 TUI 卸载和已安装标记改进

## [0.16.0] - 2026-03-10

- feat(aios): 添加编排器 agent 目录和生成器

## [0.15.0] - 2026-03-10

- feat(aios): 将实时 orchestrate 执行门控在 `AIOS_EXECUTE_LIVE` 之后

## [0.14.0] - 2026-03-10

- feat(aios): 添加子代理运行时存根适配器

## [0.13.0] - 2026-03-10

- feat(aios): 外部化运行时清单规范

## [0.12.0] - 2026-03-10

- feat(aios): 添加运行时适配器边界

## [0.11.0] - 2026-03-10

- feat(aios): 扩展本地 orchestrate 预检覆盖

## [0.10.4] - 2026-03-08

- fix: 修复非 git 工作区上的 wrapper 回退逻辑并同步文档

## [0.10.3] - 2026-03-08

- fix(windows): 支持 cmd 封装的 CLI 启动

## [0.10.2] - 2026-03-08

- fix(windows): 将 contextdb npm 调用路由经 node cli

## [0.10.1] - 2026-03-08

- fix(windows): 解决 node 生命周期中的 npm cli 启动问题

## [0.10.0] - 2026-03-08

- feat(onboarding): 将生命周期流程整合到 node

## [0.9.0] - 2026-03-07

- feat: 添加混合浏览器快照和可见优先启动默认值

## [0.8.1] - 2026-03-05

- docs: 添加 contextdb Node ABI 不匹配排查指南

## [0.8.0] - 2026-03-05

- 添加基于 ollama 的隐私保护与脱敏功能

## [0.7.0] - 2026-03-05

- feat: 添加浏览器挑战检测和人工接管信号

## [0.6.2] - 2026-03-04

- fix: 为 opt-in 包装器模式自动创建 .contextdb-enable

## [0.6.1] - 2026-03-04

- fix(windows): 强化浏览器 doctor 并明确 Node 20+ 前置要求

## [0.6.0] - 2026-03-04

- feat: 添加跨 CLI doctor + 安全扫描技能包

## [0.5.3] - 2026-03-04

- docs(site): 双向连接 docs/blog 导航，简化博客首页 footer 区域

## [0.5.2] - 2026-03-03

- docs(site): 将 rexai 链接移至全局 footer 导航

## [0.5.1] - 2026-03-03

- docs: 对齐 superpowers 工作流路由并添加 RexAI 友链

## [0.5.0] - 2026-03-03

- feat(contextdb): 添加 SQLite 辅助索引（`memory/context-db/index/context.db`）及 `index:rebuild`
- feat(contextdb): 将 `search`/`timeline`/`event:get` 切换到 SQLite 检索，附带回退逻辑
- feat(contextdb): 添加可选的语义重排路径（`--semantic`、`CONTEXTDB_SEMANTIC=1`）
- refactor(scripts): 通过 `ctx-agent-core.mjs` 统一 `ctx-agent.sh` 和 `ctx-agent.mjs`

## [0.4.3] - 2026-03-03

- docs: 通过 AI 搜索答案和改进变更日志导航提升功能页面 SEO/GEO

## [0.4.2] - 2026-03-03

- docs: 将 Windows 指南合并到快速入门并添加 OS 选项卡

## [0.4.1] - 2026-03-03

- docs: 添加独立的 Windows 指南页面和快速入门交叉链接

## [0.4.0] - 2026-03-03

- feat: 添加 Windows PowerShell 浏览器/contextdb 设置支持

## [0.3.1] - 2026-03-03

- chore: 浏览器 MCP 上线后提升版本

## [0.3.0] - 2026-03-03

- feat: 添加一键命令安装/诊断浏览器 MCP 及默认 cdp 回退

## [0.2.0] - 2026-03-03

- feat: 添加语义版本治理和 versioning-by-impact 技能

## [0.1.0] - 2026-03-03

- 初始化项目版本管理（`VERSION`、`CHANGELOG.md`）和发布工具基线。
