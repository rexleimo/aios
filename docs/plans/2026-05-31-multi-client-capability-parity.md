# 多客户端能力对齐设计文档

**日期**: 2026-05-31
**状态**: 设计待审 (DRAFT — 等 review,未动代码)
**目标**: 让全部 4 个客户端 (codex / claude / gemini / opencode) 都能安装 AIOS 系统指令并执行对应功能。

---

## 0. 这份文档纠正了什么

本文档基于 **2026-05-31 的本机实证**(不是文档推测),推翻了几个长期存在的错误前提。先把结论摆前面,避免再走弯路:

| 旧前提(错误) | 实证结论(正确) | 证据 |
|---|---|---|
| gemini 只读 `.gemini/commands/*.toml`,不读 SKILL.md | **gemini 原生支持 Agent Skills**,`.gemini/skills/<name>/SKILL.md` 是官方路径 | 官方文档 `geminicli.com/docs/cli/{skills,using-agent-skills,creating-skills}`;全局 `~/.gemini/skills/`(别名 `~/.agents/skills/`),项目 `.gemini/skills/` |
| opencode 无 skills 概念,`.opencode/skills` 是死路径 | **opencode 1.15.12 原生支持 skills**,本机当场认到 AIOS 的 26 个 skill | `opencode debug skill` 直接列出 `.opencode/skills/search-first/SKILL.md` 等 |
| gemini/opencode 缺 agents/superpowers 是"宿主做不到" | 宿主**能读**物理存在的 skill;缺的是(a)superpowers 没装,(b)能力矩阵不下发指令文本 | 见 §2 |

> ⚠️ **历史教训**:`docs/plans/2026-05-30-...-implementation-plan.md` 的 Phase 5 曾基于"gemini 要 toml"这一错误前提,计划把 SKILL.md 转成 TOML、把 `projectSkillRoot` 从 `.gemini/skills` 改成 `.gemini/commands`。该方案被实现后又回退(git `605d421 fix(gemini): revert skill format from toml-command to markdown-directory`)。**不要重做 Phase 5。** 当前 4 客户端 `skillFormat` 已统一为 `markdown-directory`,是正确状态。

---

## 1. 宿主真实约定(实证确认)

### gemini-cli
- **指令上下文**: `GEMINI.md`(项目根 + `~/.gemini/GEMINI.md`,分层自动加载)。当前 `nativeProjectSourceFile` 已是 `GEMINI.md` ✅(Phase 6 已修)。
- **Skills**: 原生支持。全局 `~/.gemini/skills/`,别名 `~/.agents/skills/`;项目 `.gemini/skills/<name>/SKILL.md`。渐进式披露(body 触发后才加载,<5k 词)。
- **Commands**: `.gemini/commands/**/*.toml`(`prompt` 必填,`{{args}}`,子目录=命名空间)。与 skills 是两套东西,不互斥。
- **Extensions**: 可打包 commands + MCP + sub-agents + agent skills。

### opencode (本机 1.15.12,`opencode debug skill` / 内置 customize-opencode skill 实证)
- **指令上下文**: `AGENTS.md` + opencode.json 的 `instructions[]`。配置在 `~/.config/opencode/opencode.json`。
- **Skills**: 原生支持,`opencode debug skill` 可列出。落点:
  - 项目 `.opencode/skill(s)/<name>/SKILL.md`(单复数都认)
  - 全局 `~/.config/opencode/skill(s)/<name>/SKILL.md`
  - **外部自动扫描**: `~/.claude/skills/`、`~/.agents/skills/`(可用 `OPENCODE_DISABLE_EXTERNAL_SKILLS=1` 关闭)
  - 额外根: opencode.json 的 `skills: { paths:[], urls:[] }`
  - frontmatter: `name`(必填,小写连字符,≤64,匹配目录名)、`description`(实际必填,无则被过滤)
- **Agents**: `.opencode/agent(s)/<name>.md`,frontmatter `description`(必填)/`mode: primary|subagent|all`/`model`/`tools`/`permission`;body 即 prompt。内置 build/plan/general/explore。
- **Commands**: `.opencode/command/*.md` 或 opencode.json 的 `command:{}`。

<!-- __CONTINUE_HERE__ -->

---

## 2. 真实缺口分析

目标是"所有客户端都能装系统指令做对应功能"。实证后,真实缺口有两个,都**不是**"gemini/opencode 宿主做不到":

### 缺口 A:superpowers 在本机根本没安装(最高优先级,阻塞一切)
- `~/.agents/skills/` 目录不存在;`~/.claude/skills/` 为空。
- `Skill(superpowers:brainstorming)` 调用直接报 `Unknown skill`。
- `installSuperpowers()`(`scripts/lib/components/superpowers/install.mjs`)逻辑:clone 到 `~/.codex/superpowers`,再 link 到 `~/.agents/skills/superpowers`。**这个 link 当前不存在。**
- **影响**:不只是 gemini/opencode——**连 claude/codex 现在都没有可用的 superpowers**。CLAUDE.md 强制"实现前必须调 superpowers:*",但该前提在本机不成立。这是全局问题,不是某客户端问题。

### 缺口 B:能力矩阵只卡"指令文本",不卡"宿主能力"
- `scripts/lib/clients/core/definitions.mjs` 的 `CAPABILITY_CLIENT_ORDER`:`superpowers=[codex,claude]`、`agents=[codex,claude]`。
- 效果:`compose.mjs` 生成 GEMINI.md/AGENTS.md 时**跳过** `superpowers.md` 和 `agent-routing.md` 两段(capability-gated)。gemini/opencode 的指令文件里没有"去用 superpowers / 去用子 agent"的引导。
- 但宿主**照样能读物理存在的 skill 文件**(opencode 已证认到 26 个)。所以是"没告诉它去用",不是"它用不了"。
- 附带:`scripts/lib/agents/emitters/` 只有 `claude.mjs`/`codex.mjs`,无 gemini/opencode 的 agent 文件生成器(opencode 有原生 `.opencode/agent/*.md` 约定可补;gemini 走 skills/extensions)。

---

## 3. 方案(三步,按依赖排序)

### 步骤 1 — 安装并验证 superpowers(前提,先做)
没有它,后两步无意义。
- 运行 superpowers 安装(`aios internal superpowers install --client all` 或等价命令,触发 `installSuperpowers()`)。
- 验证 `~/.agents/skills/superpowers` link 存在,且 `Skill(superpowers:brainstorming)` 可调用。
- **风险**:低。clone + symlink,可逆。会动 `~/.codex/superpowers` 和 `~/.agents/skills/`,属用户级目录,需说明。

### 步骤 2 — 把 gemini/opencode 纳入 agents/superpowers 能力
既然宿主能读 skill,就让它俩拿到能力 + 指令引导。

**改动清单:**
1. `scripts/lib/clients/core/definitions.mjs`
   - `CAPABILITY_CLIENT_ORDER.superpowers`: 加 `gemini`、`opencode`
   - `CAPABILITY_CLIENT_ORDER.agents`: 加 `opencode`(原生 agent 约定);gemini 视 extensions 支持度决定
   - 给 opencode 补 `agentTargetRoot: '.opencode/agent'`
2. `installSuperpowers()`(`components/superpowers/install.mjs`):**关键简化**——opencode 自动扫 `~/.agents/skills/`,所以步骤 1 装好后 opencode 很可能**已能看到 superpowers**,无需额外链接(需实测)。gemini 同理(`~/.gemini/skills` 或 `~/.agents/skills` 别名)。仅在实测发现看不到时才补 per-client 链接分支。
3. `scripts/lib/agents/emitters/`:新增 `opencode.mjs`(生成 `.opencode/agent/<name>.md`,`mode: subagent`);gemini 待定。
4. `scripts/lib/agents/sync.mjs`:emitter map 注册新客户端。
5. 能力门控生效后 `compose.mjs` 自动把 `superpowers.md`/`agent-routing.md` 写入 GEMINI.md/AGENTS.md——**无需改 compose.mjs**。

**风险**:中。改能力矩阵影响多处 `resolveClientsWithCapability` 调用方;需跑全测试套件验回归。

### 步骤 3 — 端到端验证(完成标准:宿主真实执行)
- **opencode**(本机有):`opencode debug skill | grep superpowers` 确认看到;`opencode debug agent <name>` 确认 agent 被识别。
- **gemini**(本机有):gemini skills 列表确认 `.gemini/skills` + `~/.gemini/skills` 被发现。
- claude/codex:回归确认未被破坏。

---

## 4. 验证策略
1. TDD:先扩 `scripts/tests/{client-registry,skills-sync,native-sync}.test.mjs`。
2. 跑 `npm run test:scripts`(node 经 `~/.nvm/versions/node/v24.15.0/bin`)。
3. 真实 CLI 冒烟:`node scripts/aios.mjs internal native install --client all`,再 `opencode debug skill` / gemini skills 列表。
4. 基线对比:`git stash; npm run test:scripts; git stash pop; npm run test:scripts; diff`。

## 5. 开放问题(待定,需 review 拍板)
- gemini 的 agents 能力:走原生 skills 足够,还是需要 extensions 打包 sub-agents?(gemini 无 opencode 那种 `mode: subagent` 文件约定)
- 是否把 superpowers 安装并入 `native install` 的标准流程,确保新机器开箱即用?
- opencode external-skill 自动扫描是否足以替代显式链接(步骤 2.2 待实测)。



