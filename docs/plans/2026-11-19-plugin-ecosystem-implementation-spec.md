# 2026-11-19 — 插件生态实施 spec（ADR 0012 落地路线图）

- 状态： Proposed（架构已定 ADR 0012，本 spec 待评审后拆 tickets）
- 关联：`docs/adr/0012-magpie-style-plugin-ecosystem.md`（决策来源）、`docs/reports/2026-11-19-plugin-system-three-way-comparison.md`（事实来源）
- 范围：把 ADR 0012 的分层插件架构分阶段落地；**本文件是路线图与边界，不是逐行实施**

## 0. 指导原则（来自 ADR 0012 + rex-engineering-standards）

- 依赖方向：插件运行时/宿主不得被网关核心 import；网关通过最小接口依赖插件能力（依赖倒置，§1）。
- 深层模块：每个隔离域一个深模块，小接口隐藏实现；禁止浅转发 wrapper（§2）。
- 文件粒度：单文件 ≤400 行；新模块单一职责、kebab-case（§4）。
- 测试担保：每个域的核心路径有自动化测试，断言不得弱化（§5）。
- 诚实数据：无数据显示"未记录"，不伪造额度/用量/时间（对标报告纪律）。

## 1. 目录落位（先解决预算门）

现状实测：`scripts/lib/tooling/model-router/` 已 **9 项**（8 子目录 + tui.mjs），超目录预算 8；`gateway/`、`routing/` 均已 8 项满。
- **前置门（用户裁定：重组抽象，不走豁免/baseline）**：新增插件模块前，先处理 model-router 根目录预算——把 `tui.mjs` 归入 `tui/` 子目录或按职责重划，再由 `aios standards check` 确认。
- 落位方案（合规后）：新建 `scripts/lib/tooling/model-router/plugins/` 作为插件生态根，其下按三域分子目录，`plugins/` 自身 ≤8 项。
- **注册表**：magpie 式 `plugins.json`（用户裁定），作为启用/顺序/开关的单一事实源，不复用 ADR 0007 注册表。

## 2. 阶段划分（每阶段独立可验收）

> 顺序原则(用户裁定 D0):**声明式 contribution 优先**(融入 app、最快形成生态),再进程内 middleware,最后需隔离的联网插件。

### P0 — manifest 契约 + plugins.json + 声明式 panel/integration 注入（首个交付薄片）
- 目标:插件是一份 manifest,声明 contributions;安装后注入 app 各扩展点,对全 app 生效。
- 模块边界:
  - `scripts/lib/clients/plugins/manifest.mjs`:manifest schema 校验(schemaVersion/id/version/permissions/lifecycle/evidence/contributes)。
  - `scripts/lib/clients/plugins/registry.mjs`:读 magpie 式 `plugins.json`(安装/启用/顺序/开关单一事实源)。
  - `scripts/lib/clients/plugins/contributions.mjs`:把 `contributes` 分发到各注入器。
  - 注入器:panel → `CONSOLE_VIEWS` + 渲染组件;integration → 投影进 `config/integrations.json`(复用其 registry/ledger/sha256 硬门);action → mcp action-service/providers/actions;provider → model-router provider registry。
  - 落位注意:`scripts/lib/clients/integrations/` 已有完整注册系统,插件注入**复用**它而非另起。
- 验收:一个示例插件 manifest 能贡献 1 个 panel(出现在导航)+1 个 integration(出现在资源库);卸载后干净移除;复用现有 sha256/pinned-commit 硬门。

### P1 — 进程内 contribution:middleware / strategies / onUsage
- 目标:高频请求面 contribution 融入网关,失败不阻断请求;打通额度/用量数据源。
- 模块:`plugins/g1/runtime.mjs`(Node 原生 `vm`/`worker_threads`,D6)、`plugins/g1/middleware-chain.mjs`(超时/回滚/fail-open)、`plugins/g1/strategies.mjs`、`plugins/g1/on-usage.mjs`;网关接线点 `gateway/router.mjs` 路由前后插钩(不改核心)。
- 验收:改模型名/拒请求/改响应三类测试;超时/抛错时请求原样放行;strategies 20ms / onUsage 250ms 预算;UI 从 onUsage 读额度/缓存命中,无数据显示"未记录"。

### P2 — 宿主进程 contribution:联网 provider / async hooks（需进程隔离）
- 目标:需联网 I/O 的插件(登录/额度/签名)在独立子进程跑,stdio JSON-RPC。
- 模块:`plugins/g2/host.mjs`、`plugins/g2/rpc.mjs`、`plugins/g2/provider-plugin.mjs`。
- 安全门:**不可信来源(npm/git)必须在 P2 的进程隔离就位后才开放**(ADR 0007 §9)。
- 验收:插件宿主崩溃不影响网关;RPC 有总超时;账号用不透明 ref 不泄漏 PII。

### P3 — client kind + 双轨注册表（ADR 0007 落地）
- 目标:client manifest(把 AIOS 装进客户端)+ 官方轨/本地轨双轨硬门,接桌面壳。
- 沿用 ADR 0007 §7/§9,不重新设计;claude+codex 先降 manifest,行为逐字节一致(diff 证据)。
- 验收:官方轨 PR 硬门 + 本地轨 untrusted 标记 + 显式确认。

### P4 — 空白层探索（agent 内加载插件，需先出设计）
- 目标:补 ADR 0012 D5 的未决层。
- 前置:先回答"AIOS 作为 agent 插件"vs"agent 内 AIOS 助手再加载第三方插件",再立设计 ADR。

## 3. 与四块 UI 的并行关系

- 四块 UI（`docs/plans/2026-11-19-magpie-console-four-panels.md`）按已确认 D1/D3/D4 默认值可**立即并行**落地，不等插件系统。
- D2(额度)/D4(上下文上限) 先"未记录"占位；P1 的 onUsage 落地后再接真实数据，UI 数据源设计成可替换（不写死）。

## 4. 每阶段 Definition of Done

1. 核心路径自动化测试通过；2. 依赖方向未被破坏（内层不依赖外层）；3. 无超 400 行文件、无职责堆积；4. 受限运行时/沙箱边界有明确测试；5. 无伪造数据；6. consequential 改动有 ADD/接口契约更新；7. focused evidence 引用真实文件/测试。

## 5. 全局验收门（全部阶段完成后）

- `npm run test:affected` + `npm run test:regression`（repo root）通过；
- `aios standards check` 无新增 violation；
- `cd apps/shell/ui && npm run typecheck && npm run build` 通过；
- 手动冒烟：装一个声明式插件(panel+integration) → 新屏出现在导航、集成出现在资源库 → 卸载干净移除 → 装一个 middleware 对全部 agent 生效、超时不阻断 → onUsage 有用量行。

## 6. 已拍板，P0 可开工

1. ~~插件架构中心~~ → **声明式 contributions 融入整个 app**（ADR 0012 D0,用户裁定"插件不是 hooks,要融入 app 逻辑"）。
2. ~~进程内受限运行时载体选型~~ → **Node 原生 `vm`/`worker_threads`**（ADR 0012 D6）。
3. ~~插件注册表单一事实源~~ → **magpie 式 `plugins.json`**（ADR 0012 D6;integrations 投影进现有注册表）。
4. ~~model-router 根目录预算超限处理~~ → **重组抽象，不走豁免**（ADR 0012 D6）。

剩余唯一全局未决（ADR 0012 Open Question 1）：空白层「agent 内加载插件」的边界，属 P4，不阻塞 P0–P3。
