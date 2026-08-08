---
title: "v5.5.0: Ask-First Requirements Alignment — Agents Stop Building the Wrong Thing"
description: "v5.5.0 makes the workflow agent actively detect vague requests (like 'optimize the landing page'), pause before planning, and align with the user first. A clarification budget with assumption fallback prevents infinite questioning, so the agent delivers what the user wants instead of what it guessed."
date: 2026-08-08
tags: ["Harness CLI", "workflow", "requirements", "Ask-First", "clarification", "alignment", "release"]
---

# v5.5.0: Ask-First Requirements Alignment — Agents Stop Building the Wrong Thing

> **Quick Answer:** Agents were executing autonomously but sometimes delivered the opposite of what users actually wanted. Root cause: requirements clarification only triggered when the user happened to say "acceptance criteria" or "requirements unclear" — a vague request like *"optimize the landing page"* skipped clarification entirely and went straight into planning, where the model guessed the goal. v5.5.0 fixes this at the workflow level: vague change requests now automatically enter requirements clarification before planning, agents follow a "look → infer → assume → ask" priority chain (asking is the last resort, not the first), every question carries a default answer, and a clarification budget (3 rounds) with assumption fallback gives the conversation a hard exit so it can never loop forever.

## The failure mode: capable agents, misaligned deliverables

The workflow could execute. Tests ran, diffs were produced, reviews happened. And yet, repeatedly, the thing that came back was not the thing the user wanted.

The chain of causes looks innocent from the outside:

1. A request arrives: *"优化一下前端页面"* / *"Improve the landing page."*
2. The requirements capability only activates when the message contains explicit keywords (`acceptance criteria`, `需求不清`, `clarify the requirements`, ...).
3. No keyword → no clarification → the model enters planning and makes its own assumptions about the goal.
4. The model executes its assumptions perfectly — which is exactly why the wrong thing gets built so reliably.

This is a classic **requirements validation gap**. Software engineering practice says: before design and implementation, validate that you are building the right thing ("Are we building the right product?"), not just build the thing right. Our evidence-driven capability chain guaranteed the second but never the first.

## What changed in v5.5.0

### 1. Structural detection of vague requests (no keywords needed)

`derive-facts` now treats a request as "requirements missing" based on structure, not wording:

- A **generic optimization goal** ("optimize", "improve", "优化一下前端页面")
- **without** observable acceptance/outcome language ("要求首屏加载时间降低到 2 秒以内")
- **and without** a specific functional target ("支付模块", "login", "checkout")

→ automatically produces `acceptance-criteria-missing` → the workflow routes into `rex-requirements` (Grilling mode) **before** planning.

False-positive guards are built in: completed statements ("我们把上次讨论的优化方案提交了") and noun phrases ("optimization plan") do not trigger clarification.

### 2. Ask-First priority chain — thinking before asking

`rex-requirements` and the build agent now follow a strict priority chain:

1. **Look** — check the environment (files, code, existing requirements decisions)
2. **Infer** — derive from context (prior decisions, repo constraints, domain conventions)
3. **Assume** — take a reasonable default and label it "this is an assumption"
4. **Ask** — only when the first three fail *and* the question changes implementation or acceptance

Every question must carry a hypothesis plus a default: *"I understand your goal is to improve conversion, right? If not, is it A or B? (If you don't answer, I'll continue with A.)"* If the user does not answer, the agent proceeds with the default — it never blocks on a missing answer.

### 3. Clarification budget — the anti-infinite-loop guarantee

The requirements evidence contract now supports `anyOf` convergence groups:

```json
{
  "expectedEvidence": [
    { "anyOf": ["acceptance-criteria-recorded", "assumptions-recorded"] },
    { "anyOf": ["non-goals-recorded", "assumptions-recorded"] },
    "first-slice-identified",
    "requirements-decision-recorded"
  ]
}
```

- Acceptance criteria **or** recorded assumptions satisfy the group.
- After 3 rounds without convergence, the agent stops asking, records remaining open items as an **assumption list** (`assumptions-recorded`), and unlocks implementation.
- The assumption list ships with the deliverable, so the user sees exactly what was assumed at acceptance time.

One clarification session per requirement, then a typed `requirements-decision` artifact records the alignment — repeat requests for the same requirement no longer re-trigger clarification.

## Old flow vs. new flow

**Before:** "优化一下前端页面" → planning → "refactor styles + performance + dark mode" → delivery → *"I wanted conversion, not this."*

**After:** "优化一下前端页面" → agent self-check: *ambiguous goal (what to optimize? for whom? how is success measured?)* → one question with a default: *"I understand your goal is to improve conversion on this page, right? If not, is it A or B?"* → user confirms → `requirements-decision` recorded → development unlocked → the deliverable is what the user asked for.

## Verification

- 200 rex-harness tests pass (199/200; the single failure is a pre-existing macOS `/private` path baseline unrelated to this change).
- 103/103 repo workflow tests pass, including new cases: vague Chinese request → requirements clarification; vague English request → requirements clarification; request with acceptance language → no clarification; specific functional target → no clarification; completed requirement → no re-trigger; assumption-based convergence → stage completes.
- New convergence contract tests: full acceptance evidence (compat path), assumption fallback (anti-loop exit), and missing-group blocked (contract not relaxed).
- `rex-harness doctor` reports `ready`.

## Upgrade notes

- This is a behavior change for agents: expect the workflow to pause and ask when a request is structurally vague. That pause is the feature.
- Existing typed requirements decisions are honored (`requirements-decision-recorded`); they suppress re-clarification.
- UI tasks get a direction-confirmation step: 1–2 style/layout directions are offered before implementation.

Try it with a deliberately vague request and watch the workflow align before it builds.
