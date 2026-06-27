# AIOS 客户端开发体验提升计划 — 对齐 Hermes/Claude Code/Codex/OpenCode

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** 借鉴 Hermes Agent 的成熟架构和竞品分析报告中的落地经验，为 harness-cli（AIOS）项目补齐对 Claude Code、Codex、OpenCode 三大客户端的开发体验支撑，让多客户端协作从"契约式占位符"升级为"实装可用的闭环"。

**Architecture:** 三层改造：(1) 基础层 — vendor superpowers skill 子集 + native-sync 配置标准化；(2) 闭环层 — 受控技能自生成 + 干运行预检 + 默认模式自动激活；(3) 运维层 — Usage/Audit 控制台 + 会话结束自动写记忆。每层独立交付、不互相阻塞。

**Tech Stack:** Node.js (ESM, >=24), Commander.js (CLI), SQLite (ContextDB + metrics), MCP SDK (@modelcontextprotocol/sdk >=1.25.4), FTS5 (检索降级), Ink (TUI)

---

## 背景与现状分析

### 项目现状

harness-cli 是一个 local-first AI agent workspace（AIOS），核心价值是跨客户端（Claude Code、Codex CLI、OpenCode）统一 skill/memory/interception/harness 体验。当前已有：

- **skills 系统**: `skill-sources/` 源 + `scripts/lib/skills/` 管理 + `.codex/skills/` / `.claude/skills/` / `.opencode/skills/` 三路同步（native-sync）
- **memo 系统**: `aios memo add/recall/search/pin` + git-friendly markdown + `project_shared` 跨客户端可见
- **interception**: MCP proxy (`aios-mcp-proxy.mjs`) + shell hook (`aios-rewrite.sh`) + compact packet + metrics sink
- **harness**: `aios harness run` 单进程迭代 + worktree + checkpoint + journal
- **team**: `aios team` ctx-agent 多角色 dispatch + model router
- **ContextDB**: SQLite + FTS5 + L0/L1/L2 分层 + lazy load

### 关键缺口（竞品分析已识别）

1. **superpowers:* 引用是 noop** — AGENTS.md 强制所有客户端走 `superpowers:brainstorming` 等流程，但 `.claude/skills/` 和 `.codex/skills/` 中没有 `superpowers/` 目录，`skills-lock.json` 只钉了 `find-skills` 一个外部源。用户不装 obra/superpowers 插件，所有引用全部空中楼阁。
2. **无干运行预检** — OpenHarness v0.1.8 已 ship `--dry-run` 6 维度检查，AIOS 的 `aios harness run` 没有任何启动前校验。
3. **无技能自生成闭环** — Hermes v0.14.0 已实装 background review fork + provenance + curator 1843 行；OpenClaw v2026.6.1 已实装 Skill Workshop 提案/审查/回滚。AIOS 仍只有手动 `aios memo add`。
4. **无 default_mode 自动激活** — oh-my-openagent v4.3.0 + OpenHarness v0.1.9 已实装零配置自动激活模式，AIOS 仍需手动 `/skill xxx` 加载。
5. **无质量门控结构化 verdict** — the-pair v2.0.2 已实装 4 段 verdict + 强制 reject 缺段；superpowers v5.1.0 已实装两阶段 subagent 审查。AIOS `verification-before-completion` 没有结构化 schema。
6. **无 Usage/Audit 报表** — OpenViking 已实装 7 张 SQLite 表 + UTC 持久化 + viewer-tz 分桶；AIOS interception metrics 只有 per-session JSONL，没有聚合查询。
7. **MCP SDK CVE 风险** — mem0 cli-node-v0.2.8 已修 8+ 高危 CVE，AIOS `aios-mcp-proxy.mjs` 依赖的 `@modelcontextprotocol/sdk` 版本需审计升级。

---

## Phase 1: 基础层（本周，紧急窗口）

### Task 1: Vendor superpowers 8 个核心 skill 子集

**Objective:** 把 obra/superpowers 的 8 个核心 skill 从契约式占位符变为实装可用，消除 P0-1/P0-5 的前置阻塞。

**Files:**
- Create: `skill-sources/superpowers/{brainstorming,using-superpowers,test-driven-development,systematic-debugging,writing-plans,subagent-driven-development,using-git-worktrees,verification-before-completion}/SKILL.md`
- Modify: `skills-lock.json` (添加 superpowers 8 个钉版本)
- Modify: `scripts/lib/native/sync/apply.mjs` (确保三路同步覆盖 superpowers/)
- Test: `scripts/tests/skills-source-tree.test.mjs`

**Step 1: 创建 superpowers skill 源目录**

```bash
mkdir -p skill-sources/superpowers/{brainstorming,using-superpowers,test-driven-development,systematic-debugging,writing-plans,subagent-driven-development,using-git-worktrees,verification-before-completion}
```

**Step 2: 从 obra/superpowers GitHub 拉取 8 个 SKILL.md**

每个 skill 目录下创建 SKILL.md，内容从 https://github.com/obra/superpowers/tree/main/skills/<name>/SKILL.md 拉取。关键修改：
- frontmatter 增加 `origin: "obra/superpowers"` + `vendored_at: "<YYYY-MM-DD>"` + `vendored_version: "5.1.0"`
- 保留原 MIT license 声明
- 按需裁剪过长内容（AIOS token discipline `minimal` profile）

**Step 3: 更新 skills-lock.json**

添加 8 个钉版本条目，确保 native-sync 三路（.claude/ .codex/ .opencode/）都会同步。

**Step 4: 跑 native-sync 测试**

```bash
node scripts/aios.mjs native sync --dry-run --json
node --test scripts/tests/skills-source-tree.test.mjs
```

**Step 5: Commit**

```bash
git add skill-sources/superpowers/ skills-lock.json
git commit -m "feat(skills): vendor superpowers 8 core skills from obra/superpowers v5.1.0"
```

---

### Task 2: 干运行预检层 (aios harness dry-run)

**Objective:** 参考 OpenHarness v0.1.8 的 6 维度检查，给 `aios harness run` 增加 `--dry-run` 预检，输出 `ready|warning|blocked`。

**Files:**
- Create: `scripts/lib/lifecycle/harness/dry-run-checks.mjs` (6 维度检查逻辑)
- Modify: `scripts/lib/lifecycle/harness/dry-run.mjs` (组装 + 报告输出)
- Modify: `scripts/lib/cli/commander-app.mjs` (注册 `--dry-run` flag)
- Test: `scripts/tests/harness-runtime.test.mjs`

**Step 1: 定义 6 维度检查**

维度：
1. **配置合并**: `.aios/config.json` + `config/settings.json` + `.env` 存在性 + schema 合规
2. **auth 状态**: provider API keys / OAuth tokens 是否缺失 → warning（不 blocked）
3. **prompt 装配**: AGENTS.md / .hermes.md / skills 能否加载
4. **命令解析**: `aios.mjs` CLI 能否 parse 给定参数
5. **工具列表**: MCP servers + native toolsets 能否 discover
6. **browser MCP 探针**: CDP 端口 / Playwright 安装 / profile 目录

**Step 2: 实现检查函数**

每个维度一个 async 函数，返回 `{level: "ready"|"warning"|"blocked", reasons: string[], next_actions: string[]}`。

**Step 3: 组装报告**

聚合 6 个维度结果，取最低 level 为总体裁定。输出 JSON + human-readable 格式。

**Step 4: 注册 CLI flag**

```bash
node scripts/aios.mjs harness run --dry-run --objective "test" --json
```

**Step 5: 跑测试**

```bash
node --test scripts/tests/harness-runtime.test.mjs
```

**Step 6: Commit**

```bash
git add scripts/lib/lifecycle/harness/dry-run-checks.mjs scripts/lib/lifecycle/harness/dry-run.mjs
git commit -m "feat(harness): add --dry-run readiness check with 6-dimension evaluation"
```

---

### Task 3: 升级 @modelcontextprotocol/sdk 依赖（CVE 修复）

**Objective:** 对齐 mem0 cli-node-v0.2.8 的安全修复，审计并升级 AIOS MCP proxy 的 MCP SDK 依赖。

**Files:**
- Modify: `mcp-server/package.json` (升级 `@modelcontextprotocol/sdk` 到 >=1.25.4)
- Modify: `package.json` (如果根也依赖)
- Test: `node --test scripts/tests/interception-mcp-proxy.test.mjs`

**Step 1: 审计当前版本**

```bash
cd mcp-server && npm ls @modelcontextprotocol/sdk
cd / && npm ls @modelcontextprotocol/sdk
```

**Step 2: 升级到 >=1.25.4**

```bash
cd mcp-server && npm install @modelcontextprotocol/sdk@^1.25.4
cd / && npm install @modelcontextprotocol/sdk@^1.25.4  # 如果根也依赖
```

**Step 3: 跑 interception 测试**

```bash
node --test scripts/tests/interception-mcp-proxy.test.mjs
cd mcp-server && npm run typecheck && npm run build
```

**Step 4: Commit**

```bash
git add mcp-server/package.json mcp-server/package-lock.json package.json package-lock.json
git commit -m "fix(deps): upgrade @modelcontextprotocol/sdk to >=1.25.4 (CVE fix aligned with mem0)"
```

---

## Phase 2: 闭环层（本月）

### Task 4: default_mode 自动激活

**Objective:** 参考 oh-my-openagent v4.3.0 的 `default_mode` config，给 AIOS 增加 `.aios/config.json` 中的 `default_mode` 字段，启动时自动 inject 对应 skills + system prompt。

**Files:**
- Create: `scripts/lib/lifecycle/options/default-mode.mjs` (读取 + inject)
- Modify: `scripts/aios.mjs` (bootstrap 时检测 default_mode)
- Modify: `client-sources/native-base/shared/partials/core-instructions.md` (文档化)
- Test: `scripts/tests/aios-components.test.mjs`

**Step 1: 定义 default_mode schema**

```json
{
  "default_mode": "strict-primary",  // 或 null
  "mode_presets": {
    "strict-primary": {
      "skills": ["superpowers:using-superpowers", "pre-edit-safety-gate", "verification-loop"],
      "system_prompt_additions": ["You must follow superpowers workflow before any implementation."]
    }
  }
}
```

**Step 2: 实现 inject 逻辑**

bootstrap 阶段读 `.aios/config.json.default_mode` → 查 mode_presets → 自动加载 skills + 补 system prompt 片段。

**Step 3: 注册 CLI flag**

```bash
node scripts/aios.mjs init --default-mode strict-primary
```

**Step 4: 跑测试**

```bash
node --test scripts/tests/aios-components.test.mjs
```

**Step 5: Commit**

```bash
git add scripts/lib/lifecycle/options/default-mode.mjs
git commit -m "feat(lifecycle): add default_mode auto-activation from .aios/config.json"
```

---

### Task 5: 受控技能自生成闭环 (skill propose/review/apply/rollback)

**Objective:** 参考 OpenClaw v2026.6.1 Skill Workshop + Hermes v0.14.0 background review，给 AIOS 增加 `aios skill propose/review/apply/rollback/index` 子命令族 + `.aios/skills/index.json` 中心化索引。

**Files:**
- Create: `scripts/lib/skills/skill-workshop.mjs` (提案 CRUD + provenance)
- Create: `scripts/lib/skills/skill-index.mjs` (中心化索引读写)
- Create: `.aios/skills/index.json` (初始 schema)
- Modify: `scripts/aios.mjs` (注册 skill 子命令族)
- Modify: `scripts/lib/skills/source-tree.mjs` (集成 index)
- Test: `scripts/tests/skills-component.test.mjs`

**Step 1: 定义 index.json schema**

```json
{
  "format_version": 1,
  "skills": [
    {
      "name": "verification-loop",
      "path": "skill-sources/verification-loop/SKILL.md",
      "version": "1.0.0",
      "sha256": "...",
      "origin": "vendored|agent-generated|hub-installed",
      "created_by": "agent|operator",
      "last_activity_at": "2026-06-27T12:00:00Z"
    }
  ]
}
```

**Step 2: 实现 propose**

`aios skill propose "<description>"` → 生成 SKILL.md draft → 写入 `.aios/skills/proposals/<id>/` → 状态 `pending`。

**Step 3: 实现 review**

`aios skill review <id> --approve|reject|quarantine` → 更新 proposal 状态。

**Step 4: 实现 apply**

`aios skill apply <id>` → approved proposal 写入 `skill-sources/<name>/` → 更新 `index.json` → native-sync 分发。

**Step 5: 实现 rollback**

`aios skill rollback <name>` → 从 index.json 读 sha256 → 恢复上一版本 → 更新 index.json。

**Step 6: 实现 index**

`aios skill index --scan` → 遍历 `skill-sources/` → 重新计算 sha256 → 更新 index.json。

**Step 7: 跑测试**

```bash
node --test scripts/tests/skills-component.test.mjs
```

**Step 8: Commit**

```bash
git add scripts/lib/skills/skill-workshop.mjs scripts/lib/skills/skill-index.mjs .aios/skills/
git commit -m "feat(skills): add skill propose/review/apply/rollback workshop + centralized index"
```

---

### Task 6: 结构化 4 段 Mentor Verdict (quality-gate)

**Objective:** 参考 the-pair v2.0.2 的 4 段 verdict + superpowers 两阶段审查，给 `verification-before-completion` skill 增加结构化 verdict schema：FILES_REVIEWED / CHECKS / CODE / VALIDATION。

**Files:**
- Modify: `skill-sources/verification-loop/SKILL.md` (增加 verdict schema 定义)
- Create: `scripts/lib/skills/verdict-schema.mjs` (验证 + 提取)
- Test: `scripts/tests/skills-component.test.mjs`

**Step 1: 定义 verdict schema**

```
VERDICT:
FILES_REVIEWED:
  - path/to/file1.ts: lines 45-67 (changed)
  - path/to/file2.ts: full review
CHECKS:
  - ✅ typecheck passes
  - ✅ test suite passes (8/8)
  - ❌ no unused imports in file1.ts
CODE:
  > // specific code snippet referenced
  ```ts
  // the problematic line
  ```
VALIDATION:
  - All checks pass → APPROVED
  - Any check fails → REJECTED with specific next_actions
```

**Step 2: 实现 verdict 验证**

`verdict-schema.mjs` 解析 verdict 文本 → 检查 4 段完整性 → 缺段自动 reject → 返回 `{approved: boolean, missing_sections: string[], next_actions: string[]}`。

**Step 3: 跑测试**

```bash
node --test scripts/tests/skills-component.test.mjs
```

**Step 4: Commit**

```bash
git add skill-sources/verification-loop/ scripts/lib/skills/verdict-schema.mjs
git commit -m "feat(skills): add structured 4-section verdict schema to verification-before-completion"
```

---

### Task 7: Sleep-Time Memory / Auto-Dream (preview + apply)

**Objective:** 参考 OpenHarness autodream + TencentDB L0→L3，给 AIOS 增加 `aios dream --preview|--apply` CLI，对 memo/ContextDB 做定时反思合并。

**Files:**
- Create: `scripts/lib/lifecycle/dream/index.mjs` (主入口)
- Create: `scripts/lib/lifecycle/dream/taxonomy.mjs` (5 类分类：Stable Preference / Durable Context / Recent Snapshot / Sensitive / Operational)
- Create: `scripts/lib/lifecycle/dream/consolidate.mjs` (LLM 反思 + 合并)
- Modify: `scripts/aios.mjs` (注册 `dream` 子命令)
- Test: `scripts/tests/memo-storage.test.mjs` (扩展)

**Step 1: 定义 taxonomy**

5 类分类法映射 AIOS memo 现有 `pin` / `scope` 体系：

| Memo 类型 | Dream taxonomy | 行为 |
|-----------|---------------|------|
| pin + project_shared | Stable Preference | 永久保留 |
| scope=project_shared 非 pin | Durable Context | 90 天 TTL |
| 近 24h 新增 | Recent Snapshot | 7 天 TTL，可合并 |
| scope=agent_private | Sensitive | 不参与 dream |
| 运维提醒 | Operational | 3 天 TTL |

**Step 2: 实现 mtime 监听 + 变化检测**

扫描 `.aios/memo/` 所有 markdown 文件 mtime → 识别最近变更 → 按 taxonomy 分类。

**Step 3: 实现 consolidate**

对 Recent Snapshot 类 memo 调 LLM 做：去重 + 合成摘要 + 标记 dedup。PREVIEW 模式只输出计划，APPLY 模式写回。

**Step 4: 注册 CLI**

```bash
node scripts/aios.mjs dream --preview  # 看计划
node scripts/aios.mjs dream --apply     # 执行合并
```

**Step 5: 跑测试**

```bash
node --test scripts/tests/memo-storage.test.mjs
```

**Step 6: Commit**

```bash
git add scripts/lib/lifecycle/dream/
git commit -m "feat(memo): add sleep-time memory consolidation (aios dream --preview/--apply)"
```

---

### Task 8: Per-Agent Memo 命名空间隔离

**Objective:** 参考 OpenViking v0.3.23 per-agent_id 命名空间，给 `aios memo` 增加 `--agent <id>` namespace 隔离，防止 `aios team` 多 agent 并行时 experience 串扰。

**Files:**
- Modify: `scripts/lib/memo/storage/events-write.mjs` (增加 agent_id 列)
- Modify: `scripts/lib/memo/cli/commands/events.mjs` (增加 --agent flag)
- Modify: `scripts/lib/memo/workspace-memory.mjs` (查询时按 agent_id 过滤)
- Test: `scripts/tests/memo-scope.test.mjs`

**Step 1: 扩展 ContextDB memo schema**

memo SQLite 表新增 `agent_id TEXT DEFAULT 'default'` 列。查询时默认 `WHERE agent_id = 'default'`，`--agent <id>` 时 `WHERE agent_id = '<id>'`。

**Step 2: 实现 CLI flag**

```bash
node scripts/aios.mjs memo add "team-worker finding" --agent codex-cli
node scripts/aios.mjs memo recall --agent codex-cli --limit 5
```

**Step 3: team/harness 自动注入**

`aios team` dispatch 子 agent 时自动设 `AIOS_AGENT_ID=<role>` env var，memo 命令默认读此 env。

**Step 4: 跑测试**

```bash
node --test scripts/tests/memo-scope.test.mjs
```

**Step 5: Commit**

```bash
git add scripts/lib/memo/
git commit -m "feat(memo): add per-agent namespace isolation (--agent <id> flag)"
```

---

### Task 9: 会话结束自动写记忆 + Activity Timeline

**Objective:** 参考 mem0 plugin v0.2.6 Stop hook，给 AIOS 增加 session close 钩子自动摘要 + session start 输出 10 条最近关键事件。

**Files:**
- Create: `scripts/lib/lifecycle/session-hooks/close.mjs` (session close → memo 自动摘要)
- Create: `scripts/lib/lifecycle/session-hooks/start-timeline.mjs` (session start → 10 条 timeline)
- Modify: `scripts/aios.mjs` (注册 session close/start 子命令)
- Test: `scripts/tests/memo-cli-integration.test.mjs`

**Step 1: 实现 close hook**

解析当前 session 的 ContextDB events → 提取 last assistant message + touched files → 结构化 prompt → `aios memo add` 自动写入（scope=project_shared, 90 天 expiry 标记）。

**Step 2: 实现 start timeline**

`aios memo recall --limit 10` → 按类型图标渲染 + 相对时间 → 输出到 session start 上下文。

**Step 3: 注册 CLI**

```bash
node scripts/aios.mjs session close   # 触发自动摘要
node scripts/aios.mjs session start   # 输出 timeline
```

**Step 4: 跑测试**

```bash
node --test scripts/tests/memo-cli-integration.test.mjs
```

**Step 5: Commit**

```bash
git add scripts/lib/lifecycle/session-hooks/
git commit -m "feat(session): add auto-memo on session close + activity timeline on session start"
```

---

## Phase 3: 运维层（下季度）

### Task 10: Usage/Audit 多时区控制台

**Objective:** 参考 OpenViking v0.3.19 `usage_audit/schema.py`，给 AIOS interception 增加 per-agent token/retrieval hourly SQLite 聚合表 + UTC 持久化 + viewer-tz 分桶查询命令。

**Files:**
- Create: `scripts/lib/interception/audit/schema.mjs` (SQLite 表定义)
- Create: `scripts/lib/interception/audit/query.mjs` (timezone 分桶查询)
- Create: `scripts/lib/interception/audit/sink-hourly.mjs` (metrics sink 写入聚合)
- Modify: `scripts/aios.mjs` (注册 `interception audit` 子命令)
- Test: `scripts/tests/interception-cli.test.mjs`

**Step 1: 定义 7 张表 schema**

参考 OpenViking `usage_audit/schema.py`，AIOS 精简版 3-4 张表即可：
- `usage_token_hourly` (agent_id, date_utc, hour_utc, model, input_tokens, output_tokens, total_tokens)
- `usage_agent_activity_daily` (agent_id, date_utc, tool_calls, skill_invocations, errors)
- `request_audit` (agent_id, timestamp_utc, tool_name, duration_ms, status)

**Step 2: 实现 hourly aggregation**

metrics sink 每小时聚合 `.aios/interception/metrics/<session>.jsonl` → 写入 audit SQLite。

**Step 3: 实现 timezone 分桶查询**

```bash
node scripts/aios.mjs interception audit --timezone Asia/Shanghai --date 2026-06-27 --json
```

UTC → viewer-tz 重分桶，处理 DST/UTC+8/半小时偏移。

**Step 4: 跑测试**

```bash
node --test scripts/tests/interception-cli.test.mjs
```

**Step 5: Commit**

```bash
git add scripts/lib/interception/audit/
git commit -m "feat(interception): add usage/audit SQLite hourly aggregation + timezone query"
```

---

### Task 11: Recall 上下文预算控制 + FTS-only 降级路径

**Objective:** 参考 TencentDB v0.3.6 Recall 预算裁剪 + OpenClaw vector-disabled FTS 检索降级，给 ContextDB 搜索增加 `maxChars` / `totalBudget` 裁剪 + `--mode fts-only|vector|hybrid` 显式降级。

**Files:**
- Modify: `scripts/lib/search/unified-search.mjs` (增加预算裁剪参数)
- Modify: `scripts/lib/memo/storage/query.mjs` (FTS-only 降级开关)
- Test: `scripts/tests/search.test.mjs`

**Step 1: 定义预算配置**

```json
{
  "recall": {
    "maxCharsPerMemory": 5000,
    "maxTotalRecallChars": 30000
  }
}
```

**Step 2: 实现 score 排序截断**

查询结果按 FTS5 score 排序 → per-memory `maxChars` 截断 → total `maxTotalRecallChars` 截断。

**Step 3: 实现 FTS-only 降级**

`--mode fts-only` 跳过所有 vector/embedding 逻辑，只用 FTS5 MATCH 查询。默认 `hybrid`（FTS + 可选 vector）。

**Step 4: 跑测试**

```bash
node --test scripts/tests/search.test.mjs
```

**Step 5: Commit**

```bash
git add scripts/lib/search/ scripts/lib/memo/storage/
git commit -m "feat(search): add recall budget control + FTS-only degradation path"
```

---

### Task 12: Operator Install Policy (skill-install-policy.json)

**Objective:** 参考 OpenClaw v2026.6.2-beta.1 operator install policy，给 AIOS skill 安装流程增加 policy file 白名单/黑名单检查，与 Skill Workshop 联动。

**Files:**
- Create: `.aios/skill-install-policy.json` (allow/deny schema)
- Modify: `scripts/lib/skills/skill-workshop.mjs` (install 时强制 policy check)
- Test: `scripts/tests/skills-component.test.mjs`

**Step 1: 定义 policy schema**

```json
{
  "allow": ["vendor.com/*", "skill-sources/*"],
  "deny": ["github.com/*/experimental-*"],
  "requireSignedSha": false,
  "requireProvenance": true
}
```

**Step 2: 实现 policy check**

`aios skill apply <id>` 和 `aios skill install <url>` 前强制检查 policy。deny 匹配 → 拒绝 + 提示走 `skill propose` 进入 review 流。

**Step 3: 跑测试**

```bash
node --test scripts/tests/skills-component.test.mjs
```

**Step 4: Commit**

```bash
git add .aios/skill-install-policy.json scripts/lib/skills/skill-workshop.mjs
git commit -m "feat(skills): add operator install policy + workshop integration"
```

---

## Phase 4:中长期（P2）

### Task 13: OVPack v2 manifest 借鉴（context:pack machine-readable sibling）

**Objective:** 给 AIOS `context:pack` Markdown 输出增加 sibling `{sessionId}-context.manifest.json` (format_version, content_sha256, sources) + `{sessionId}-context.index.jsonl` (事件索引)。

**Files:**
- Create: `scripts/lib/contextdb/pack-manifest.mjs`
- Modify: `scripts/lib/contextdb/pack-export.mjs` (增加 manifest 生成)
- Test: 待新建

暂不嵌入 vector，只做 machine-readable metadata。后续 sqlite-vec 就绪后再扩展。

---

### Task 14: worker_died 兜底协议（跨夜 agent 死亡恢复）

**Objective:** 参考 overstory `worker_died` 协议模式（不抄代码，项目已 archived），给 `aios team` 增加子 agent 异常时自动发结构化 death notice 给父 agent。

**Files:**
- Create: `scripts/lib/lifecycle/team/watchdog-death-notice.mjs`
- Modify: `scripts/lib/lifecycle/harness/execute-turn.mjs`

---

### Task 15: 截图隐私覆盖层（DOM PII Redaction）

**Objective:** 参考 vision-test-harness `privacy-overlay.ts` 的 DOM 文本节点替换模式，给 `mcp-server/src/browser/actions/screenshot.ts` 增加默认 privacy overlay。

**Files:**
- Create: `mcp-server/src/browser/privacy-overlay.ts`
- Modify: `mcp-server/src/browser/actions/screenshot.ts`

---

## 验证总览

| Phase | 关键验证命令 | 预期结果 |
|-------|-------------|---------|
| Phase 1 | `node --test scripts/tests/skills-source-tree.test.mjs` | superpowers 8 skills 在三路都有 |
| Phase 1 | `node scripts/aios.mjs harness run --dry-run --json` | 输出 `level: ready/warning/blocked` |
| Phase 1 | `cd mcp-server && npm run typecheck && npm run build` | MCP SDK >=1.25.4 无 CVE |
| Phase 2 | `node scripts/aios.mjs dream --preview` | 输出 taxonomy 分类 + 合并计划 |
| Phase 2 | `node scripts/aios.mjs skill propose "test skill" && skill review <id> --approve && skill apply <id>` | 全流程闭环 |
| Phase 2 | `node scripts/aios.mjs memo add "test" --agent codex-cli` | 写入 agent_id=codex-cli namespace |
| Phase 3 | `node scripts/aios.mjs interception audit --timezone Asia/Shanghai --date 2026-06-27` | 输出 hourly 聚合 |

---

## 风险与开放问题

1. **superpowers vendor 同步策略** — obra/superpowers 是 MIT 但持续更新，需要决定：一次性 vendor vs 定期自动同步。建议初期 vendor + 季度手动同步 + index.json 记录 vendored_version。
2. **LLM 调用预算** — Auto-Dream 和 skill review 需要调 LLM，预算控制机制缺失。建议 `dream --preview` 只输出计划不调 LLM，`--apply` 时用 `maxChars` 限制 LLM 输入。
3. **ContextDB schema 扩展** — agent_id 列 + audit 表是 breaking change，需要 schema version + migration 路径。建议 pre-GA 阶段直接加列（SQLite ALTER TABLE ADD COLUMN 是非破坏性的）。
4. **opencode.json 兼容性** — OpenCode 的 `skills.paths` 只认 `.opencode/skills/`，native-sync 必须确保三路同步完整覆盖所有新增 skill。
5. **harness 单进程限制** — background review fork 需要 `aios harness` 拆出异步线程，当前 ctx-agent 是单进程。Phase 2 Task 5 的 background review 可先做成 cron job 触发（用 `aios cron`），后续再改线程。

---

*计划生成时间: 2026-06-27 | 基于竞品分析报告 (docs/reports/2026-06-04-*) + Hermes Agent skill 参考 + 项目现有代码审计*
