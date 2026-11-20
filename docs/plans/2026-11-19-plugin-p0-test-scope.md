# 2026-11-19 — 插件系统 P0 测试范围契约（rex-test-design 产物）

- 关联 Command：`software.testing.design` / `design-tests`（activation `e074f3a1-fc8d-46c5-b190-ec738e732f3e`）
- 关联实现 spec：`docs/plans/2026-11-19-plugin-ecosystem-implementation-spec.md` P0
- 性质：测试范围契约，只决定"测什么、从哪观察"，不执行实现

## 1. 测试范围契约（test-scope-contract）

- **用户目标**：插件是一份 manifest，声明 `contributes`；安装后注入 app 扩展点（panel→导航、integration→集成注册表），对全 app 生效；卸载后干净移除。
- **非目标（明确排除）**：
  - 进程内 middleware / strategies / onUsage（P1）
  - 联网 provider / 子进程隔离（P2）
  - client manifest / 双轨注册表 / 桌面壳打包（P3）
  - agent 内加载插件（P4，未决）
  - 真实外部安装（npm/git 拉取）、真实扣费、凭据处理
- **范围内行为**：
  1. manifest 结构校验（schemaVersion/id/version/permissions/lifecycle/evidence/contributes 字段形状）
  2. `plugins.json` 读取：启用/禁用/顺序，单一事实源
  3. `contributes.panels` 注入：新增 view 进入 `CONSOLE_VIEWS`，禁用/卸载后不出现
  4. `contributes.integrations` 投影：声明的集成写入 `config/integrations.json`，复用现有 registry 的 sha256/pinned-commit 硬门；卸载后移除
- **范围外行为**：插件注入后的 UI 实际渲染像素、网络请求、与运行中网关的交互。
- **允许修改的测试缝**：新增纯函数模块 `scripts/lib/clients/plugins/{manifest,registry,contributions}.mjs`，用注入的 fs/rootDir 参数测试（不碰真实 `~/.aios` 或真实 config）；测试文件落在 `scripts/tests/tooling/contracts/plugin-*.test.mjs`。
- **完成判据**：范围内 4 类行为各有可独立失败的自动化测试；不删断言/不跳过/不放宽/不只测 mock；`node --test` 聚焦命令通过。

## 2. 验收行为 → 可观察断言映射（acceptance-test-mapping）

| # | 用户可观察行为 | 稳定公共入口 | 可观察断言 | 最小纵向切片 |
|---|---|---|---|---|
| A1 | 非法 manifest 被拒绝 | `normalizePluginManifest(raw)` | 缺 id / 非法 schemaVersion / contributes 非对象 → 抛 `PluginManifestError`，错误信息含字段名 | 单个最小 manifest 变体 |
| A2 | 插件启用/禁用/顺序可读 | `readPluginsRegistry(rootDir)`（注入临时 rootDir + plugins.json fixture） | 返回按 `order` 排序的启用插件；disabled 项被过滤；文件缺失 = 空数组（非空错误） | 3 条条目的临时 fixtures |
| A3 | panel 贡献出现在导航 | `applyPanelContributions(views, contributions, enabled)`（纯函数） | 启用时新 view 进入结果；禁用/未声明时不出现；id 冲突不覆盖已有 view | 1 个已有 view + 1 个贡献 view |
| A4 | integration 贡献投影进注册表 | `projectIntegrationContributions(integrations, contributions)`（纯函数） | 合法声明合并进 integrations 对象；缺 commit/sha256 被现有 registry 校验拒绝；卸载时按插件 id 移除其投影条目 | 1 条合法 + 1 条非法声明 |

**为什么这些切片足够代表目标**：A1–A4 覆盖插件从"声明→读取→注入→卸载"的完整生命周期，且都在纯函数/注入 fs 的缝上，能独立失败、不依赖网络或真实用户数据。公共入口是新增模块的导出函数（稳定契约），不是内部调用计数。

## 3. 测试缝（test-seam）

- **主缝（纯函数）**：`normalizePluginManifest` / `readPluginsRegistry(rootDir, fsImpl)` / `applyPanelContributions` / `projectIntegrationContributions`——最小、稳定、可独立失败；优先使用。
- **为何不用更窄缝**：这些行为本就是纯数据变换/文件读取，公共入口即可完全隔离风险，无需 mock 内部函数。
- **复用既有硬门**：A4 不重写集成校验，直接调用 `scripts/lib/clients/integrations/registry.mjs` 的 `normalizeIntegrationRegistry`（真实 sha256/commit 校验），保证"插件投影的集成"与"手工集成"同一硬门。
- **禁止的假通过**：不为让测试变绿而删除 A1 的校验断言、跳过 A4 的非法声明用例、放宽 registry 的 commit/sha256 要求、或只 mock `normalizeIntegrationRegistry` 而不走真实校验。

## 4. 否定条款 / sediment

- 否定条款：若把 middleware/hooks 当 P0 架构中心，或与现有 integrations 注册表形成两套并行集成实现，本契约失效，须 replan。
- sediment：已有 `integration.test.mjs` 覆盖手工集成注册表，本契约与其互补（插件投影），不重复、不改写其断言。
- evidence refs：`scripts/lib/clients/integrations/registry.mjs`（现有硬门）；`scripts/tests/tooling/contracts/integration.test.mjs`（既有测试布局与 fs 注入先例）；`apps/shell/ui/src/lib/console-navigation.ts`（CONSOLE_VIEWS 注入点）；`config/integrations.json`（集成事实源）。
