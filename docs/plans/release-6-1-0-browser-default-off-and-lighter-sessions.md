# Release Plan — v6.1.0

**主题**：浏览器 MCP 安装时二选一（Playwright / BSK，默认都不装）+ 分层加载扩列
**创建**：2026-09-22
**状态**：待开工（planning）
**版本决策**：minor → `6.1.0`（当前 `6.0.13` 先发，见下）

---

## 0. 背景与问题（来源：2026-09-21→22 内存排查）

排查结论（已记忆）：
- 真正的内存大头不是 ~75 个 agent 进程，而是 **7 个 `browser-mcp` 各自拉起的 Chrome**（每个数百 MB）。
- 交互式 `ctx-agent` 是 `spawnSync` 壳，死卡在客户端上，**自己无法释放**——当前架构没有空闲释放机制（已验证源码）。
- 现状：浏览器 MCP 在 materialize `.mcp.json` 时**默认启用**，而它不是每个会话都要。
- **关键约束**：真实用户不会手动清理，系统必须自动托管；同时**不能牺牲多窗口并发**（每个 agent 必须独立隔离，这是硬约束）。

---

## 1. 范围（Scope）

### ① feat(browser): 安装时浏览器二选一（默认都不装）—— 主杠杆

> 决策已固化记忆（2026-09-22 需求决策）。不是"默认关 + 单一 Playwright opt-in"，而是**安装时让用户在互斥二者间选一**：

| 选项 | 角色 | 引擎 | 典型场景 | 是否默认 |
|---|---|---|---|---|
| **Playwright** | 传统内置 | Playwright 新开受管浏览器 | 自动化测试 / 抓取 / headless / CI | 否 |
| **BSK / BrowserSkill** | 真人会话 | 复用已登录 Chrome + 扩展 + daemon | 替人操作真实网站、撞验证 HITL、不抢焦点 | 否 |

- 二者**互斥**：选 BSK → 不预装 Playwright MCP（反之亦然）。下发层做"当前启用哪个"的开关（见 §3）。
- 都不是默认：不装的用户零 Chrome、零额外 footprint。
- **差异不是"引擎谁强"，而是"两件不同的活"**（详见 §0.5）：Playwright 给确定性脚本/CI，BSK 给真人会话（登录态复用 + request-help）。
- **BSK 已在本机验证可用**（见 §0.5），不是纸面方案。
- **收益**：默认零 Chrome（数百 MB × N → 0）；用户按需用哪个，无上下文损失，不碰多窗口并发（硬约束）。

### ② feat(loading): 分层加载扩列（续 H1 AgentView T0-T3）
- H1 已 ship `AgentView` 四级加载（T0-T3，按 char budget + 连续性指针）。
- 本版扩列：把"按需加载"进一步应用到**无浏览器会话的轻量场景**（默认少加载 MCP / 缓存），进一步压低单会话 footprint。
- 具体扩列目标（待 ② 细化，见 §3）：
  - 为"纯 CLI、不碰浏览器"的会话启用更轻的 MCP 集（默认即轻量）。
  - 评估是否新增 / 收紧 `T3` 默认集，使无浏览器场景加载最少。

### 不做（out of scope，本期不碰）
- **空闲超时自动释放 agent 本身**（需 `spawnSync`→异步监控 的架构重构，且会丢上下文）——列为 **v6.2.0 候选**，本期只做"让它更轻"，不做"强制消失"。

---

## 2. 版本号与发布节奏

| 版本 | 内容 | 说明 |
|---|---|---|
| **6.0.13**（当前，未打 tag） | ZCode HTTP key 修复（A14 等） | CHANGELOG 已就绪，**先发这个** |
| **6.1.0**（minor） | ① 浏览器默认关闭 ② 分层加载扩列 | 默认行为变化 + 新增 opt-in，走 minor |

理由：`6.0.13` 已是完整的一批 bugfix，且语义化版本里"改变现有默认 + 新增 opt-in"属 minor，不宜塞进 patch。

---

## 3. 落地文件清单

### ① 二选一：下发层开关 + BSK 集成

**A. 互斥开关（替换原来"单一 opt-in off"）**
- **装配**：`scripts/lib/components/browser/mcp-config.mjs`（组装 browser MCP server 条目）
- **选择判定**：新建 `scripts/lib/components/browser/mode.mjs`（读取"当前启用哪个"：`playwright` | `bsk` | `none`，来自安装时选择 + 存储模式），替代旧的单一 `off` 开关
- **Playwright 分支**：`mcp-targets.mjs` / `mcp-server-builders.mjs`（未选 Playwright 时**不写** Playwright 条目）
- **触发**：`scripts/lib/cli/dispatch/internal.mjs`（load browser 组件处，读 mode）
- **下发**：`scripts/lib/clients/core/definitions.mjs`（JSON/TOML/opencode/YAML）必须尊重 mode——三者皆空时**不写**任何 browser 条目
- **互斥约束**：选了 BSK 就禁 Playwright 下发；选了 Playwright 就不落 BSK 引导；`none` 全不写
- **迁移/维护**：`mcp-migration.mjs`、`mcp-aliases.mjs`、`install.mjs` 适配"安装时三选一"与"默认缺失"
- **文档/help**：`scripts/lib/cli/help/` 补充安装时选型 + mode 切换

**B. BSK 集成（走 thin wrapper，复用我们的下发层）**
- 不直接改 BSK 本体；在 `components/browser` 下加 **`bsk-wrapper`**：把我们已知的 `browser_*`/`snapshot`/`screenshot`/`navigate`/`borrow`/`request-help` 工具包层成 thin wrapper，内部转发到 `bsk` CLI。
- 安装引导（**owner action，非 release 代码**）：`install.ps1`（装 CLI）+ 商店装扩展（人工）+ `bsk install-skill` + `bsk doctor`。
- 沙盒适配：Agent 在沙盒时 `BSK_AUTO_START=0` + 宿主机保活 daemon + 共享 `BSK_HOME`。

### ② 分层加载扩列
- 沿用 `scripts/lib/components/…` 的 AgentView 分级体系（T0-T3 现状）
- 扩列目标与新增指标待 ② 细化后在此补全（MCP 子集选择、缓存触发条件）

---

## 4. 验收（Verification）

### 自动（必须进 CI）
- **互斥单测（关键）**：断言 mode 三态下 materialize 出的 mcp 配置——`playwright` 含 Playwright 条目且**无** BSK 引导；`bsk` 含 BSK 引导且**无** Playwright 条目；`none` **全空`mcpServers`无 browser 相关**。
- 失败即红：`assert !hasPlaywright() && !hasBsk()` when mode=none；选 BSK 时 `assert !hasPlaywright()`。
- 各客户端格式（JSON/TOML/opencode/YAML）覆盖三态两侧。
- **BSK 端到端回归**（如有 CI 可跑 Chrome）：`session start → navigate example.com → screenshot` 断言抓到真实页面（已在本机验证可行）。

### 手工
- 新建 test workspace 跑 `aios install`（默认 → `none`）+ 显式选 Playwright / 选 BSK，`grep` `.mcp.json` 确认三态下发正确且互斥。
- **BSK 本机端到端**（已跑通，作为基线复现）：`bsk status --json` 见 `version_skew:false` + `browsers[]` 含 chrome → 开 session → `navigate` → `screenshot` 抓真实页面。
- **内存复核**：mode=`none` 起 N 个会话，`tasklist` 确认**默认无 Chrome 派生**（对比基线）。

### 回滚
- 默认即"可回退"：opt-in 即可恢复，无需热修。
- 为**已有安装**提供剥离命令（把历史 `.mcp.json` 里的 browser 条目移除），避免老用户仍挂着 Chrome。

---

## 5. 发版步骤（Release Steps）

1. **先发 6.0.13**（其 ZCode 工作已齐）：
   ```bash
   scripts/release-preflight.sh --tag v6.0.13   # 校验：tag格式/VERSION/CHANGELOG/测试/构建/skills-sync/native-sync/submodule
   scripts/release-stable.sh                     # 稳定发布
   git tag v6.0.13 && git push --tags
   ```
2. **开 6.1.0**（本计划）：
   ```bash
   # 改完 ① ② 后：
   scripts/release-version.sh minor "feat(browser): MCP disabled by default; opt-in via ..."
   # → 自动把 VERSION 6.0.13 → 6.1.0，并在 CHANGELOG 插入 ## [6.1.0] 条目
   scripts/release-preflight.sh --tag v6.1.0
   scripts/release-stable.sh
   git push --tags
   ```
3. 更新 `.codex/skills/*` / `.claude/skills/*` 里涉及 MCP 安装/默认值的文档，保持与行为一致（AGENTS.md 约定）。

---

## 6. 风险与注意
- **向后**：老用户的 `.mcp.json` 可能仍带 browser 条目（历史 materialize）→ 需 §4 剥离命令 + CHANGELOG 说明默认变更。
- **opt-in  discoverability**：没文档的话用户找不到开关 → help + changelog 必须写。
- **BSK 集成依赖 owner action**（CLI + 扩展安装、用户手点连接），release 代码只负责"下发 + 切换 + 默认 none"，不打包扩展——这是与 BSK 团队边界。
- **② 的扩列**依赖 §3 细化，是本期第二个不确定点，需先定义"轻量会话"的精确边界。

---

## 7. 里程碑（续）
- [ ] ① 互斥开关(mode.mjs) + Playwright 与 BSK 两条下发 + 各客户端下发 + 单测
- [ ] BSK thin-wrapper（转发到 bsk CLI，工具集 snapshot/navigate/screenshot/borrow/request-help）
- [ ] 安装时三选一引导（none/Playwright/BSK，owner action 部分写成引导文案）
- [ ] ② 分层加载扩列目标细化 + 实现 + 单测
- [ ] 6.0.13 先发
- [ ] 6.1.0 preflight + 发布

---

## 8. 实施工作项（Planned）

> 决策固化：安装问一次（持久化到工作区配置）+ 随时可改（切换命令 + 重新 materialize）。三态：`none | playwright | bsk`，默认 `none`，互斥。

**targets**（`scripts/lib` 内）
- `components/browser/mode.mjs`（**新建**）：`resolveBrowserMode(settings)` → `'none'|'playwright'|'bsk'`；默认 `none`；读取 `config/settings.json` 的 `browser` 键。
- `components/browser/state-store.mjs`（**新建，复用 codemap 既有模式**）：`.ai`os 本地状态读写（读写互斥模式，供安装时落盘 / 切换命令改写）。
- `components/browser/install.mjs`：`installLocalBrowserMcpRuntime` 加 mode 判定——mode≠playwright 时 `skipPlaywrightInstall=true`。
- `components/browser/mcp-config.mjs`：按 mode 组装 server 条目（playwright→Playwright server；bsk→BSK 引导条目；none→空）。复用已有每条目 `enabled` 形状。
- `components/browser/bsk-writer.mjs`（**新建**）：BSK 模式下发（BSK 安装/连接/运行 三段引导 + 工具集映射）。
- `clients/core/definitions.mjs` + `mcp-opencode.mjs`：尊重 mode（三态两侧都渲染/跳过）。
- 安装引导：install 目录交互目录里加"浏览器选型"提问（`none/playwright/bsk`），落盘 mode。
- 切换命令（新 action）：如 `aios install browser <playwright|bsk|none>`，写 settings → 触发 `mcp-migrate` 重新 materialize。

**allowedWrites**：仅 `scripts/lib/components/browser/`、`scripts/lib/cli/dispatch/internal.mjs`、`scripts/lib/cli/help/`、新增单测 `scripts/tests/browser-mode-*.test.mjs`、计划文档。不碰 `mcp-server/dist/`、不动 bsk 本体。

**failureClass**：选择互斥失效 / 某客户端 mode 下发遗漏 / 安装引导未落盘 均记失败，CI 单测覆盖三态 × 各格式必红必回。

**阶段（Phase A 优先，最小闭环）— 进行中**

> **Phase A 核心 seam 已落地并通过全部受影响测试（2026-09-22）：**
> - 新增 `scripts/lib/components/browser/mcp-mode.mjs`（`BROWSER_MODES` / `DEFAULT_BROWSER_MODE='none'` / `normalizeMode` / `validateBrowserMode` / `browserModeAppliesPlaywright` / `resolveBrowserMode` / `setBrowserModeInSettings` / `browserManagedServer`）。
> - `browserManagedServer`：mode 未注入 Playwright（none/bsk）→ 返回 `null`；writer 据此不写入/清除 browser alias 与 legacy 条目。默认行为（mode undefined）沿用旧注入，保持既有直接调用/测试不变。
> - Writer 改接 mode：`mcp-toml.mjs`、`mcp-opencode.mjs`、`mcp-hermes-yaml.mjs`、`mcp-zcode.mjs`、`mcp-gemini.mjs` 增加 `{ mode }` 参数；`mcp-migration.mjs` 透传到各 writer，并对 `install`/`migrate` 运行时存在性检查做 mode 门控（仅 Playwright 要求仓库内 Node/Playwright 运行期）。核心注入点 `buildPreferredMcpServer` 不变。
> - **易踩坑**：`resolveBrowserMode(x,{rootDir})` 第一参数=模式字符串，读 settings 必须用 `resolveBrowserMode(null,{rootDir})` / `resolveBrowserMode({rootDir})`；`setBrowserModeInSettings` 先校验原始输入再 `normalizeMode`（非法抛错，而非隐式归一为 none）。注意 `--mode` CLI 选项已被 wrapMode 占用，`--install-mode` 另有用途，安装提问/切换命令的 CLI 接入为 step 3。
> - 旧测试适配：`tests/aios-components.test.mjs` 的 2 个 install + 3 个 `migrateBrowserMcpConfig` 用例显式传 `mode:'playwright'`；`tests/browser-local-mcp.test.mjs` install 用例加 `mode:'playwright'`（原默认注入行为现在需显式请求）。默认行为降级为 none。
> - 新增 `scripts/tests/browser-mode.test.mjs`（10 用例）：三态归一/校验、`browserManagedServer` 三态 null/注入、各格式按 mode 门控（JSON/TOML/opencode/YAML 均断言 none→无 browser 段、playwright→有）、顶层 `migrateBrowserMcpConfig` 从 settings 解析并互斥下发。
> - **验证**：`tests/mcp-migration.test.mjs`（2✓）、`tests/mcp-toml.test.mjs`（6✓）、`tests/browser-local-mcp.test.mjs`（7✓）、`tests/aios-components.test.mjs`（40✓）、新 `tests/browser-mode.test.mjs`（10✓）全绿。
> - 待办：step 1 剩余 install 门控已随 install.mjs 完成；step 2 各格式 respect-mode 已随 writer 完成；待 step 3 安装提问 + 切换命令 CLI、step 4 BSK 分支、step 5 CI。

**非目标（owner action，非本工作项代码）**：`install.ps1` 装 CLI、商店装扩展、`bsk install-skill`、`bsk doctor`、用户手点扩展"连接"。release 只负责下发 + 切换 + 默认 none。

---

## 0.5 BSK 验证结果（2026-09-22，已记忆）

**结论：BSK 在本机端到端可用，不是纸面方案。**

- 环境：node v24.16.0、Chrome 153 在 `/c/Program Files/Google/Chrome`、端口 52800 空闲、安装源可达。
- `install.ps1` **只装 `bsk` CLI/daemon 二进制**（`%USERPROFILE%\.local\bin\bsk.exe`，带 SHA256 校验），**不装浏览器扩展**——扩展必须用户从 Chrome 网上商店手动装（安全限制，本地进程无权装扩展）。
- daemon 启动用 `bsk daemon start`（裸 `bsk daemon` 只打印帮助）。
- `bsk status --json`：daemon 0.3.0、协议 1.3、`browsers[]` 含 `chrome 153.0.0.0`，**`version_skew:false`**（CLI/daemon/扩展三者 0.3.0 严格对齐）。
- 链路：`session start`（自动建 Agent Window）→ `navigate example.com`（`tab=... reached=load`）→ `screenshot --full-page`（抓真实 Example Domain 页面，41833 字节 PNG）。全程实锤在操作浏览器。
- 差异本质：BSK 给的是"真人会话"（登录态复用 + request-help 找人接管），不是引擎更强；Playwright 给确定性脚本/CI。二者互斥而非替代。
