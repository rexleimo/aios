---
title: "Browser MCP Weak-Model Upgrade: Semantic Snapshot + Text Click"
description: "Weak-model browser execution improves with compact page understanding primitives, text-first click actions, and real-CDP compatibility hardening."
date: 2026-04-18
tags: [Browser MCP, Weak Models, Agent Runtime, AIOS, Reliability]
---

# Browser MCP Weak-Model Upgrade: Semantic Snapshot + Text Click

In this iteration, we focused on one practical goal: **make weaker coding/planning models complete browser tasks more reliably**, without degrading the strong-model path.

The target models include lower-capability planners (for example some GLM/minmax/Ollama setups) that often fail on dense pages, strict locator rules, or long action chains.

## Problem Summary

Before this update, weak models usually failed in three places:

- They overfit to noisy page text/HTML and could not pick the next action reliably.
- They struggled with low-level locator construction and uniqueness disambiguation.
- They were brittle to runtime `evaluate` differences between unit tests and real CDP sessions.

## What Shipped

### 1) Stronger browser operating pattern in native prompts

We hardened the default browser SOP toward:

- `read -> act -> verify` short loops
- one-step execution (no blind multi-action chaining)
- `semantic_snapshot` before action on dense/dynamic pages
- `click_text` preference when visible labels are clear

This improves planning stability for weaker models at the prompt/process layer.

### 2) New weak-model-friendly MCP primitives

We added two higher-level tools in the browser-use runtime:

- `page.semantic_snapshot`
  - returns compact page semantics (`title`, `url`, headings, actions, truncation state)
  - reduces entropy compared with full-page HTML parsing
- `page.click_text`
  - text-first click with `exact`, `nth`, and `timeout_ms`
  - removes most low-level selector-writing burden

### 3) Runtime hardening after real CDP smoke failures

Initial real-browser smoke exposed compatibility issues that unit tests did not catch. We fixed:

- locator evaluate contract (`arguments[0]` -> explicit function arg)
- semantic snapshot payload normalization (stringified object compatibility)
- URL readback fallback (`get_url` -> `location.href`) for `page.goto`
- text-click candidate narrowing (interactive-first + selector dedupe)

## Verification

### Automated

- `pytest -q` in `mcp-browser-use`: **15 passed**

### Real CDP smoke (post-fix)

Flow:

1. `browser.connect_cdp`
2. `page.goto("https://example.com")`
3. `page.wait(text="Example Domain")`
4. `page.semantic_snapshot(max_items=8)`
5. `page.click_text("Learn more")`
6. `browser.close`

Result: all steps succeeded in live runtime.

## Why This Helps Weak Models

This update improves weak-model success mostly by **shrinking decision complexity**:

- compact semantic input instead of raw noisy DOM
- text-based interaction instead of brittle selector synthesis
- deterministic readback and better ambiguity handling

Strong models keep full capability and are not blocked by these additions.

## Next Iteration

Planned follow-ups:

- richer `NOT_UNIQUE` hints for faster disambiguation
- model-tier prompt presets (weak/medium/strong)
- browser benchmark set for weak-model regression gates

