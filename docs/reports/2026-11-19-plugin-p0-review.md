# 2026-11-19 — 插件系统 P0 代码审查记录（rex-code-review）

- Command: `software.review.standards-spec` / `review`（activation `85dff17d-313e-4794-ac62-a3c57eddd0fe`）
- fixed-point: working-tree HEAD（本批为未跟踪新增文件；diff = `scripts/lib/clients/plugins/` 全部新增）
- 规格来源：`docs/plans/2026-11-19-plugin-p0-test-scope.md`（用户目标 + A1–A4 验收映射）

## Standards 轴

检查范围：`scripts/lib/clients/plugins/{manifest,registry,contributions}.mjs` + 两个测试文件（共 5 文件，297 行，单文件最大 77 行 < 400；目录 5 项 ≤ 8）。

- Mysterious Name：未见。`normalizePluginManifest` / `readPluginsRegistry` / `applyPanelContributions` / `projectIntegrationContributions` / `removeIntegrationContributions` 名实相符。
- Duplicated Code：未见。三模块职责分离（校验 / 读取 / 注入），`requireString` 仅 manifest 内部；registry 用独立校验路径，无重复逻辑。
- Feature Envy：未见。`contributions.mjs` 调用 integrations 的 `normalizeIntegrationEntry` 是边界复用（复用硬门），非嫉妒外部数据。
- Data Clumps：未见。`{rootDir, readFileImpl}` 是有意依赖注入缝，与现有 `integrations/registry.mjs` 同构，非偶然相似。
- Primitive Obsession：未见。manifest 用对象表达 contributes，未用裸字符串拼装领域概念。
- Repeated Switches：未见。
- Shotgun Surgery：未见。manifest schema 的知识集中在 manifest.mjs 一处。
- Divergent Change：未见。每文件单一职责。
- Speculative Generality：未见。`permissions`/`lifecycle`/`evidence` 是 ADR 0007 manifest 契约要求的字段，非预留。
- Message Chains：未见。
- Middle Man：未见。
- Refused Bequest：未见。
- 仓库标准：kebab-case 命名✓；单一职责✓；注入式 fs 与现有 registry 一致✓；无硬编码密钥/凭据✓；注释解释“为什么”✓。
- 硬违规（AGENTS.md / config/standards.json）：未见；`aios standards check` 口径下新文件均合规。

Standards 轴 finding 数：0。

## Spec 轴

对照 `docs/plans/2026-11-19-plugin-p0-test-scope.md` 的 A1–A4：

- A1（manifest 校验）：`manifest.mjs` 实现，`normalizePluginManifest` 对缺 id / 非法 schemaVersion / 非对象 contributes 抛 `PluginManifestError`；测试 4 项通过。✓
- A2（plugins.json 读取）：`registry.mjs` 实现，缺文件=空数组、disabled 过滤、顺序保留；测试 2 项通过。✓
- A3（panel 注入）：`contributions.mjs` 实现，启用注入、禁用不注入、id 冲突不覆盖系统 view；测试 1 项通过。✓
- A4（integration 投影 + 卸载移除）：`projectIntegrationContributions` 复用 `normalizeIntegrationEntry` 真实 sha256/commit 硬门，`removeIntegrationContributions` 按 `__origin` 精确移除、保留手工条目；测试 2 项通过。✓
- scope creep：未见（未实现 middleware/联网 provider/client bundle 等 P1–P3 内容）。

Spec 轴 finding 数：0。

> 复审说明：初版审查发现 A4「卸载移除」缺失（hard），已补 `removeIntegrationContributions` + 测试，现为 0 finding。

## 汇总

- Standards 轴：0 finding；最严重项：无。
- Spec 轴：0 finding；最严重项：无。
- verdict：approve（P0 范围内实现完整，两轴通过）。
- evidence refs：`scripts/lib/clients/plugins/*.mjs`（实现）、`scripts/lib/clients/plugins/*.test.mjs`（9 项测试，GREEN receipt `receipt:2e8aa5ca-3040-47fe-b218-edd52c5e6947`）、`docs/plans/2026-11-19-plugin-p0-test-scope.md`（规格）。
