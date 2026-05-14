# Balanced Model Router v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Implement Balanced Model Router v2 so routing uses weighted signals, profiles, explain output, and updated docs/skills/blog guidance.

**Architecture:** Keep `scripts/lib/model-router.mjs` as the routing core, add a small signal scoring layer inside it, and preserve existing route result fields for compatibility. Extend CLI parsing for `--profile` and `--explain`, then update docs and skill source files to match actual behavior.

**Tech Stack:** Node.js ESM, built-in `node:test`, JSON registry in `memory/specs/model-registry.json`, markdown docs/skills/blog.

---

## File Map

- Modify: `scripts/lib/model-router.mjs` — profile normalization, signal scoring, explain fields, route output, prompt metadata normalization.
- Modify: `scripts/lib/cli/parse-args.mjs` — parse `--profile` and `--explain` for `model-router route`.
- Modify: `memory/specs/model-registry.json` — store v2 routing profiles and signal rules next to existing routing rules.
- Create: `scripts/tests/model-router.test.mjs` — focused route/scoring/profile tests.
- Modify: `package.json` — include the new focused test in `npm run test:scripts`.
- Modify: `skill-sources/model-router/SKILL.md`, `.codex/skills/model-router/SKILL.md`, `.claude/skills/model-router/SKILL.md`, `.gemini/skills/model-router/SKILL.md`, `.opencode/skills/model-router/SKILL.md` — align agent-callable guidance.
- Modify: `docs-site/model-router.md` — profile/explain/troubleshooting docs.
- Modify: `blog-site/2026-05-model-router.md` — practical Balanced v2 guidance and before/after examples.

## Task 1: RED Tests For Balanced Routing

- [x] **Step 1: Create focused failing tests**

Create `scripts/tests/model-router.test.mjs` with tests for:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultModelRegistry,
  resolveModelRoutingForTask,
  scoreTaskSignals,
} from '../lib/model-router.mjs';

const registry = defaultModelRegistry();

function route(taskDescription, extra = {}) {
  return resolveModelRoutingForTask({ taskDescription, registry, env: {}, ...extra });
}

test('balanced routes Chinese browser publishing to GPT-5.5 browser automation', () => {
  const result = route('用浏览器打开小红书发布页面，上传图片并填写标题');
  assert.equal(result.profile, 'balanced');
  assert.equal(result.taskType, 'browser-automation');
  assert.equal(result.modelId, 'gpt-5.5');
  assert.equal(result.clientId, 'codex-cli');
  assert.equal(result.confidence > 0.7, true);
  assert.equal(result.matchedSignals.some((signal) => signal.taskType === 'browser-automation'), true);
  assert.equal(result.why.some((line) => line.includes('browser')), true);
});

test('balanced routes landing page UI work to Kimi frontend', () => {
  const result = route('build a beautiful landing page component');
  assert.equal(result.profile, 'balanced');
  assert.equal(result.taskType, 'frontend');
  assert.equal(result.modelId, 'kimi-k2.6');
});

test('balanced routes production incident logs to self-healing', () => {
  const result = route('修复线上登录故障并分析日志');
  assert.equal(result.profile, 'balanced');
  assert.equal(result.taskType, 'self-healing');
  assert.equal(result.modelId, 'minimax-m2.7');
});

test('balanced keeps long third-party API docs on Gemini research', () => {
  const result = route('阅读一份很长的第三方 API 文档，整理迁移策略');
  assert.equal(result.taskType, 'research');
  assert.equal(result.modelId, 'gemini-3-pro');
});

test('balanced keeps ordinary implementation on DeepSeek', () => {
  const result = route('实现一个新的登录接口，并补测试');
  assert.equal(result.taskType, 'implementation');
  assert.equal(result.modelId, 'deepseek-v4');
});

test('profile can be overridden by CLI-style option or env', () => {
  const premium = route('实现一个复杂的跨模块重构', { profile: 'premium' });
  assert.equal(premium.profile, 'premium');
  assert.equal(['gpt-5.5', 'claude-opus'].includes(premium.modelId), true);

  const budget = resolveModelRoutingForTask({
    taskDescription: 'build a beautiful landing page component',
    registry,
    env: { AIOS_MODEL_ROUTER_PROFILE: 'budget' },
  });
  assert.equal(budget.profile, 'budget');
  assert.equal(budget.taskType, 'frontend');
});

test('signal scoring exposes multiple matched signals', () => {
  const scored = scoreTaskSignals('设计 model-router 的优化方案并更新 skill 文档和博客', registry, { profile: 'balanced' });
  assert.equal(scored.profile, 'balanced');
  assert.equal(scored.recommendedPhases.length >= 2, true);
  assert.equal(scored.matchedSignals.some((signal) => signal.taskType === 'planning'), true);
  assert.equal(scored.matchedSignals.some((signal) => signal.taskType === 'docs'), true);
});
```

- [x] **Step 2: Run focused tests and confirm RED**

Run: `node --test scripts/tests/model-router.test.mjs`

Expected: FAIL because `scoreTaskSignals` is not exported and current routing misclassifies the listed prompts.

## Task 2: RED Tests For CLI Flags

- [x] **Step 1: Add parser tests**

Modify `scripts/tests/aios-cli.test.mjs` to assert:

```js
test('parseArgs parses model-router profile and explain flags', () => {
  const parsed = parseArgs(['node', 'aios', 'model-router', 'route', '--task', 'build ui', '--profile', 'premium', '--explain']);
  assert.equal(parsed.command, 'model-router');
  assert.equal(parsed.options.subcommand, 'route');
  assert.equal(parsed.options.task, 'build ui');
  assert.equal(parsed.options.profile, 'premium');
  assert.equal(parsed.options.explain, true);
});
```

If the file uses helper wrappers, match its existing parse invocation style.

- [x] **Step 2: Run parser test and confirm RED**

Run: `node --test scripts/tests/aios-cli.test.mjs --test-name-pattern "model-router profile"`

Expected: FAIL with `Unknown option: --profile`.

## Task 3: Implement Signal Scoring And Profiles

- [x] **Step 1: Update registry**

Modify `memory/specs/model-registry.json` to add:

```json
"defaultProfile": "balanced",
"routingProfiles": {
  "balanced": { "description": "Cost-aware default; upgrade on strong signals." },
  "premium": { "description": "Prefer stronger subscribed models for complex or low-confidence work." },
  "budget": { "description": "Prefer low-cost models except for hard capability requirements." }
},
"signalRules": [
  { "taskType": "security-review", "priority": 100, "weight": 8, "keywords": { "cjk": ["安全", "漏洞", "注入", "权限", "合规"], "en": ["security", "vulnerability", "injection", "permission", "compliance", "auth"] }, "reason": "security or auth risk" },
  { "taskType": "browser-automation", "priority": 95, "weight": 8, "keywords": { "cjk": ["浏览器", "打开", "上传", "填写", "截图", "网页抓取", "发布页面"], "en": ["browser", "upload", "screenshot", "scrape", "crawl", "automation", "computer use"] }, "reason": "live browser or desktop workflow" },
  { "taskType": "self-healing", "priority": 90, "weight": 8, "keywords": { "cjk": ["线上", "故障", "恢复", "自愈", "事故", "日志"], "en": ["incident", "outage", "recover", "self-healing", "production", "logs"] }, "reason": "production recovery or incident signal" },
  { "taskType": "architecture", "priority": 80, "weight": 7, "keywords": { "cjk": ["架构", "技术选型", "系统设计", "跨模块", "重构方案"], "en": ["architecture", "system design", "tech stack", "cross-module", "refactor plan"] }, "reason": "architecture or system design" },
  { "taskType": "research", "priority": 70, "weight": 7, "keywords": { "cjk": ["很长", "长文档", "第三方 API", "调研", "研究", "视频", "图像", "多模态"], "en": ["long document", "research", "migration strategy", "video", "image", "multimodal"] }, "reason": "long-context or multimodal research" },
  { "taskType": "frontend", "priority": 65, "weight": 7, "keywords": { "cjk": ["前端", "页面", "组件", "样式", "界面", "落地页"], "en": ["frontend", "front-end", "ui", "landing page", "component", "css", "style", "beautiful"] }, "reason": "frontend UI or visual design" },
  { "taskType": "testing", "priority": 50, "weight": 5, "keywords": { "cjk": ["测试", "验证", "QA"], "en": ["test", "testing", "verify", "qa"] }, "reason": "testing or QA" },
  { "taskType": "docs", "priority": 45, "weight": 5, "keywords": { "cjk": ["文档", "博客", "README", "指南", "说明", "skill"], "en": ["docs", "blog", "readme", "guide", "manual", "skill"] }, "reason": "documentation work" },
  { "taskType": "planning", "priority": 40, "weight": 5, "keywords": { "cjk": ["设计", "方案", "规划", "拆解", "计划"], "en": ["design", "planning", "plan", "blueprint", "roadmap"] }, "reason": "planning or decomposition" },
  { "taskType": "implementation", "priority": 20, "weight": 3, "keywords": { "cjk": ["实现", "写", "编写", "开发", "构建"], "en": ["implement", "build", "coding", "develop"] }, "reason": "implementation work" }
]
```

- [x] **Step 2: Implement helper exports**

In `scripts/lib/model-router.mjs`, implement and export:

```js
export function normalizeModelRouterProfile(profile, registry = defaultModelRegistry(), env = process.env) { ... }
export function scoreTaskSignals(taskDescription, registry = defaultModelRegistry(), { profile, env = process.env } = {}) { ... }
```

`scoreTaskSignals` must return `{ profile, primaryType, confidence, matchedSignals, why, recommendedPhases }`.

- [x] **Step 3: Wire task resolution**

Update `resolveModelRoutingForTask` and `runModelRouterCommand route` to use `scoreTaskSignals` when `taskType` is not explicit.

- [x] **Step 4: Keep compatibility**

Ensure existing fields (`taskType`, `modelId`, `provider`, `clientId`, `reason`, `cliCommand`, `fallback`) still exist and `normalizeModelRouting` preserves new optional fields.

- [x] **Step 5: Run focused test**

Run: `node --test scripts/tests/model-router.test.mjs`

Expected: PASS.

## Task 4: Implement CLI Flags

- [x] **Step 1: Parse `--profile` and `--explain`**

Modify `scripts/lib/cli/parse-args.mjs` inside `parseModelRouterArgs`:

```js
case '--profile':
  options.profile = takeValue(rest, index, '--profile');
  index += 1;
  break;
case '--explain':
  options.explain = true;
  break;
```

- [x] **Step 2: Route options through command**

In `runModelRouterCommand`, read `rawOptions.profile` and `rawOptions.explain`, pass `profile` into `resolveModelRoutingForTask`, and include explain fields in JSON output.

- [x] **Step 3: Run parser test**

Run: `node --test scripts/tests/aios-cli.test.mjs --test-name-pattern "model-router profile"`

Expected: PASS.

## Task 5: Update Docs, Skills, And Blog

- [x] **Step 1: Update skills**

Modify `skill-sources/model-router/SKILL.md` and copy/sync equivalent content into `.codex/skills/model-router/SKILL.md`, `.claude/skills/model-router/SKILL.md`, `.gemini/skills/model-router/SKILL.md`, `.opencode/skills/model-router/SKILL.md`.

Include:

```md
## Balanced v2 Profiles
- `balanced` 默认：强信号升级，普通实现省成本。
- `premium`：复杂/低置信/高风险任务更积极使用订阅强模型。
- `budget`：优先低成本，仅能力强约束时升级。

Use `node scripts/aios.mjs model-router route --task "..." --profile balanced --explain` to inspect why a model was selected.
```

- [x] **Step 2: Update docs page**

Modify `docs-site/model-router.md` with profile/explain examples and remove overclaim that historical success rate already affects routing decisions.

- [x] **Step 3: Update blog**

Modify `blog-site/2026-05-model-router.md` with Balanced v2 before/after examples.

## Task 6: Full Verification

- [x] **Step 1: Run focused commands**

Run:

```bash
node --test scripts/tests/model-router.test.mjs
node --test scripts/tests/aios-cli.test.mjs --test-name-pattern "model-router profile"
node scripts/aios.mjs model-router route --task "用浏览器打开小红书发布页面，上传图片并填写标题" --profile balanced --explain
node scripts/aios.mjs model-router route --task "build a beautiful landing page component" --profile balanced --json
```

Expected: tests pass; route outputs show GPT-5.5/browser and Kimi/frontend.

- [x] **Step 2: Run full script test suite**

Run: `npm run test:scripts`

Expected: PASS.

- [x] **Step 3: Run site sync check if docs changed**

Run: `npm run check:site-sync`

Expected: PASS or report exact drift.


## Verification Evidence

- `node --test scripts/tests/model-router.test.mjs` -> PASS (10/10).
- `node --test scripts/tests/aios-cli.test.mjs --test-name-pattern "model-router profile"` -> PASS (55/55).
- `node scripts/aios.mjs model-router route --task "用浏览器打开小红书发布页面，上传图片并填写标题" --profile balanced --explain` -> `browser-automation`, `gpt-5.5`, profile `balanced`.
- `node scripts/aios.mjs model-router route --task "build a beautiful landing page component" --profile balanced --json` -> `frontend`, `kimi-k2.6`, profile `balanced`.
- `npm run test:scripts` -> PASS (428/428).
- `npm run check:site-sync` -> PASS.
- `scripts/release-version.sh --dry-run minor "feat(model-router): add balanced v2 signal routing profiles"` -> recommends `1.12.3` to `1.13.0` without changing files.
