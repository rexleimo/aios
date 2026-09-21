# Work Item: AIOS 6.0.1 — Engineering Standards Move to rex-harness 0.7.0（v2 结构归位）

> Status: in progress (2026-09-21)
> 前置：v6.0.0（commit 5d20f59a + e857673a）已推送出版，技能以 `aios-engineering-standards` 落在宿主仓库。
> 本工作项把技能移入子模块，依赖方向归位。

## 决策依据（详见 v600 计划文档）

- 消费者（rex-implement / rex-refactor-hardening / rex-code-review / rex-design）全在 rex-harness；
- rex-harness 是独立 npm 发布物（files 含 skill-sources/），独立使用时质量基线不应消失；
- 标准与能力链共同演化，同仓一条 changelog。

## 执行清单

### A. rex-harness 子模块（release 0.7.0）
- [x] A1 新建 `skill-sources/rex-engineering-standards/SKILL.md`（rex 约定 frontmatter：name + description；内容自宿主版迁移，自引用改名）
- [x] A2 计算 `projectionPayloadDigest` 并登记进 `src/clients/projection-history.json`（install.mjs 强制：未登记 digest 投影直接抛错）
- [x] A3 `package.json` 0.6.2 → 0.7.0
- [x] A4 `CHANGELOG.md` [0.7.0] 条目
- [x] A5 子模块 commit + push（ssh://git@ssh.github.com:443/rexleimo/rex-harness.git）
- [x] A6 新增 `rexSharedSkills` 投影机制（共享技能不是 provider，原 skillIds() 只投影 provider 绑定——不补机制新技能永远投影不出去）；同步更新 `tests/contract/client-install.test.mjs` 与 `tests/skills/skill-sources.test.mjs` 的技能集合断言

### B. 宿主 harness-cli（release 6.0.1）
- [x] B1 删除 `skill-sources/aios-engineering-standards/`
- [x] B2 `aios-workflow-router` / `pre-edit-safety-gate` 引用改名为 `rex-engineering-standards`
- [x] B3 `scripts/tests/rex-client-projection.test.mjs`：adopted 13 → 14
- [x] B4 VERSION → 6.0.1；`CHANGELOG.md` [6.0.1]
- [x] B5 `docs-site/changelog.md`（+zh/ja/ko）v6.0.1 条目
- [x] B6 活文档 `docs-site/engineering-standards.md`（+zh/ja/ko）技能名更新
- [x] B7 四语发布博客 `2026-09-v601-engineering-standards-rex.md` + 各语言 index 登记
- [ ] B8 bump 子模块指针并提交
- [x] B9 `scripts/lib/skills/sync/run.mjs` 新增孤儿投影清理（源技能删除后托管投影自动移除；信任模型与 misprojection 一致：元数据 source 必须自洽）

### C. 验证
- [x] C1 `node scripts/sync-skills.mjs`（宿主 27→26 后回到 27；9 个客户端面旧投影全部按孤儿清理移除）
- [x] C2 `node scripts/install-rex-client-projections.mjs --scope project`（rex 13→14，9 面全部落地；rex-tdd 的 unmanaged-target-differs 为既有用户托管漂移，按设计保留）
- [x] C3 `node scripts/check-skills-sync.mjs`（仅既有 typesafe-ai 外部技能 drift）
- [x] C4 `node scripts/check-site-sync.mjs` OK
- [x] C5 mkdocs --strict 双构建通过（博客 URL 66→67）
- [x] C6 测试全过：宿主 skills-sync/skills-resolution/rex-client-projection/rex-release-gate/check-site-sync/public-content-contract/pages-workflow/release-pipeline/ecc-uplift（87 例）+ 子模块全量 214 例
- [ ] C7 宿主 commit + push

## 已知决策点

- **rex-release-gate 的 CHANGED_SKILLS 不回填新技能**：该测试要求清单内技能有 ≥2 个历史 digest（回滚演练）。新技能首个版本只有 1 个 digest、无回退目标，语义上不属于"changed"；待其首次内容变更（产生第二个 digest）后再加入清单。此决策记录在案。
- **训练认证（`aios skills certify`）**为按需流程，不是投影硬门；新技能可在发布后补认证。
