# Balanced Model Router v2 Design

Date: 2026-05-12
Status: Draft for user review
Approved direction: Balanced

## Problem

The current `model-router` often routes too many real tasks to one low-cost implementation path. In local evidence, `node scripts/aios.mjs model-router stats` reported 200 dispatches, all `deepseek-v4` for `implementation`. Representative route checks also showed obvious misses:

- Chinese browser publishing flow (`用浏览器打开小红书发布页面，上传图片并填写标题`) routed to `implementation -> DeepSeek-V4`, but should prefer `browser-automation -> GPT-5.5`.
- Frontend design work (`build a beautiful landing page component`) routed to `implementation -> DeepSeek-V4`, but should prefer `frontend -> Kimi K2.6` under the existing registry.
- Production incident wording (`修复线上登录故障并分析日志`) routed to `research -> Gemini-3-Pro`, but should prefer a self-healing/debug/log-analysis path.
- Compound work (`设计 model-router 的优化方案并更新 skill 文档和博客`) routed to one `research -> Gemini-3-Pro`, but it should be decomposed into planning, docs, implementation, and review phases.

The docs and blog also imply historical-success-aware routing, while the current implementation is mostly static rules plus keyword matching. That creates a gap between user expectation and actual behavior.

## Goals

1. Keep `balanced` as the default profile: use low-cost models for ordinary tasks, but upgrade to stronger subscribed models when strong signals justify it.
2. Replace first-match keyword classification with weighted signal scoring and priority rules.
3. Make routing explainable with `profile`, `confidence`, `matchedSignals`, and `why` fields.
4. Add profile support for `premium`, `balanced`, and `budget` without breaking existing env overrides.
5. Improve compound-task handling so multi-domain prompts can produce a phased recommendation instead of a single misleading model.
6. Update skill, docs, and blog content to explain practical tuning, dry-run diagnostics, overrides, stats interpretation, and common misroutes.

## Non-Goals

- Do not train model weights or build a full learning system in v2.
- Do not claim historical success rate affects routing until the router actually consumes that signal.
- Do not remove existing model IDs, task types, role defaults, or environment overrides.
- Do not force every task onto expensive subscribed models; `balanced` must remain cost-aware.

## Routing Profiles

### `balanced` default

Use the existing low-cost defaults for normal implementation, docs, and test tasks, but upgrade on strong signals:

- Browser / desktop / live web workflow -> `browser-automation -> GPT-5.5`
- Security, auth, permissions, compliance, vulnerability -> `security-review -> Claude Opus`
- Architecture, broad refactor, system design, technical decision -> `architecture -> Claude Opus`
- Long document, multimodal, video/audio/image research -> `research -> Gemini-3-Pro`
- Frontend UI, visual design, landing page, component polish -> `frontend -> Kimi K2.6`
- Production incident, outage, recovery, self-healing -> `self-healing -> MiniMax-M2.7`
- Ordinary implementation -> `implementation -> DeepSeek-V4`

### `premium`

Prefer stronger subscribed models when confidence is low, risk is high, or task scope is broad:

- Escalate ambiguous implementation with architecture/security/browser/frontend signals.
- Prefer GPT-5.5 as an all-round fallback earlier.
- Prefer Opus for high-risk planning and reviews.

### `budget`

Prefer low-cost models except when a task needs a capability that low-cost models are weak at:

- Keep DeepSeek/Sonnet for simple coding/docs/tests.
- Upgrade only for browser automation, security-critical review, very long context, or production recovery.

## Signal Scoring

The router should scan the task description and accumulate signal scores instead of returning on the first matching keyword.

Each signal has:

- `taskType`: target task type.
- `weight`: numeric strength.
- `keywords`: CJK and Latin phrases.
- `priority`: tie-breaker for strong capability requirements.
- `reason`: short human-readable explanation.

Example priority order for strong signals:

1. `security-review`
2. `browser-automation`
3. `self-healing`
4. `architecture`
5. `research`
6. `frontend`
7. `testing`
8. `docs`
9. `implementation`
10. `general`

Broad words such as `实现`, `build`, `分析`, `文档`, and `design` should have lower weight than capability-specific signals such as `浏览器`, `上传`, `权限`, `漏洞`, `线上故障`, `landing page`, or `multimodal`.

## Route Output

Existing route fields stay intact for compatibility:

```json
{
  "task": "...",
  "resolvedType": "browser-automation",
  "modelId": "gpt-5.5",
  "model": "GPT-5.5 (OpenAI)",
  "provider": "codex",
  "clientId": "codex-cli",
  "reason": "primary match for taskType=\"browser-automation\"",
  "cliCommand": "..."
}
```

V2 adds optional explain fields:

```json
{
  "profile": "balanced",
  "confidence": 0.86,
  "matchedSignals": [
    { "taskType": "browser-automation", "signal": "浏览器", "weight": 6 },
    { "taskType": "browser-automation", "signal": "上传", "weight": 4 }
  ],
  "why": [
    "Detected live browser workflow signals: 浏览器, 上传, 填写",
    "Balanced profile upgrades browser automation to GPT-5.5",
    "Implementation signal exists but has lower priority than browser automation"
  ]
}
```

CLI additions:

- `--profile premium|balanced|budget`
- `--explain` to include `confidence`, `matchedSignals`, and `why` in human output.
- `--json` includes explain fields by default when available.

Environment variable:

- `AIOS_MODEL_ROUTER_PROFILE=premium|balanced|budget`

Resolution priority:

1. Role env override, e.g. `AIOS_MODEL_PLANNER`
2. Task-type env override, e.g. `AIOS_MODEL_BROWSER_AUTOMATION`
3. Explicit CLI `--profile`
4. `AIOS_MODEL_ROUTER_PROFILE`
5. Default `balanced`
6. Routing rule primary and fallback chain

## Compound Task Handling

V2 should detect compound prompts when multiple high-confidence task types appear. It should not replace the orchestrator, but it can return a recommended phase list.

Example:

```json
{
  "resolvedType": "compound",
  "modelId": "glm-5.1",
  "profile": "balanced",
  "recommendedPhases": [
    { "taskType": "planning", "modelId": "glm-5.1" },
    { "taskType": "docs", "modelId": "claude-sonnet" },
    { "taskType": "implementation", "modelId": "deepseek-v4" },
    { "taskType": "code-review", "modelId": "claude-opus" }
  ],
  "why": [
    "Detected compound task: design + docs/blog + implementation/review",
    "Balanced profile recommends phase-specific routing instead of one model"
  ]
}
```

Initial scope can keep actual `aios team` dispatch unchanged and expose the phase list in `model-router route --explain`. Later implementation can wire compound recommendations into team planning.

## Docs, Skill, And Blog Updates

### Skill

Update `skill-sources/model-router/SKILL.md` and synced client skills to include:

- Profile selection rules.
- How to read `confidence`, `matchedSignals`, and `why`.
- Examples of strong signals and the expected model.
- When to override with env vars.
- A warning that historical success-rate routing is future-facing unless implemented.

### Docs

Update `docs-site/model-router.md` for the first implementation. Localized docs should be updated only when the normal docs sync workflow requires it; otherwise they remain out of v2 scope:

- Add `--profile` and `--explain` examples.
- Add a “Why was this model selected?” section.
- Add a “Why are my subscribed models not used?” troubleshooting section.
- Clarify `model-router stats` interpretation.
- Correct any historical-success wording to match implementation.

### Blog

Update `blog-site/2026-05-model-router.md` and translations if in scope:

- Reframe the post around practical routing quality, not just feature announcement.
- Include before/after examples for browser, frontend, production incident, long docs, and compound work.
- Explain `balanced` as the default strategy.

## Acceptance Criteria

Routing behavior:

- `用浏览器打开小红书发布页面，上传图片并填写标题` routes to `browser-automation -> gpt-5.5` under `balanced`.
- `build a beautiful landing page component` routes to `frontend -> kimi-k2.6` under `balanced`.
- `修复线上登录故障并分析日志` does not route to plain `research -> gemini-3-pro`; v2 routes it to `self-healing -> minimax-m2.7`. A separate `debug-log-analysis` task type is deferred.
- `阅读一份很长的第三方 API 文档，整理迁移策略` still routes to `research -> gemini-3-pro`.
- Security/auth review prompts still route to `security-review -> claude-opus`.
- Ordinary implementation prompts can still route to `implementation -> deepseek-v4`.

Explainability:

- `model-router route --task "..." --explain` prints profile, confidence, matched signals, and why.
- `model-router route --task "..." --json` includes the same fields.
- `--profile premium|balanced|budget` changes routing decisions where policy differs.

Docs:

- Skill docs, main docs, and blog no longer overclaim historical-success-aware routing unless implemented.
- Docs include troubleshooting for all-DeepSeek stats and examples of profile/override usage.

Verification:

- Add focused tests for signal scoring and route outcomes.
- Add CLI parser tests for `--profile` and `--explain`.
- Run `npm run test:scripts` after implementation.
- Run docs/site sync checks if docs/blog translations are changed.

## Implementation Decisions

1. Compound route output is CLI/report-only in v2. It appears in `model-router route --explain` and JSON output, but it does not automatically change `aios team` phase generation until a later implementation plan explicitly wires it in.
2. Profile definitions live in `memory/specs/model-registry.json` for v2, next to existing routing rules. This keeps the first implementation small and keeps docs aligned with one registry file.
3. Stats distinguish route decisions from live execution in v2 docs and, if implementation touches stats storage, in event metadata. The UI/report must not imply that all route decisions were actually executed by a model.
