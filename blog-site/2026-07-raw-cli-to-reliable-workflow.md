---
title: "From Raw CLI Commands to a Reliable AI Agent Workflow"
description: "Turn a collection of AI CLI commands into a repeatable workflow with routing, edit gates, checkpoints, and verification evidence."
date: 2026-07-14
tags: ["AI CLI", "reliable automation", "workflow design", "Harness CLI", "MCP"]
---

# From Raw CLI Commands to a Reliable AI Agent Workflow

> **Quick Answer:** Reliability comes from adding explicit boundaries around a command sequence: classify the request, select the smallest route, protect edits, persist only resumable work, and verify the result with evidence. Harness CLI provides these boundaries without forcing every read-only question through a heavyweight plan.

A shell alias can start an AI coding client. It cannot, by itself, explain whether the task was safe to edit, whether a previous attempt should be resumed, or whether a green command actually covered the changed surface. The difference between a raw CLI wrapper and a reliable workflow is the contract around execution.

## The five boundaries that matter

### 1. Input boundary

Turn the request into an explicit objective. Separate a question, an inspection, a small edit, and a multi-step objective. Empty or acknowledgement-only input should not create work.

### 2. Routing boundary

Choose `noop`, `direct`, `guarded`, or `planned` before selecting a client or playbook. This keeps the process proportional to risk.

### 3. Edit boundary

Before creating or changing a file, run the pre-edit safety gate. Check impact, dependencies, style, and test coverage. If the graph service is unavailable, use targeted repository search and existing tests as an explicit fallback rather than silently skipping the check.

### 4. State boundary

Persist a plan only when continuation has value. A project registry can describe available context without injecting the entire history into every prompt. On resume, load the selected task and handoff, not unrelated session noise.

### 5. Evidence boundary

Run the checks that match the changed surface and report what they prove. A build proves a build; it does not automatically prove an external browser session, model provider, or human approval.

## A concrete migration pattern

Suppose the old workflow is:

```bash
claude "update the docs"
git diff
```

It leaves too many questions unanswered. Replace it with a small contract:

1. State the public surfaces and languages that are in scope.
2. Classify the request as `planned` when it spans content, navigation, and tests.
3. Write a plan with file ownership and acceptance checks.
4. Run `pre-edit-safety-gate` before each edit batch.
5. Keep generated output out of the source change set.
6. Run content contracts, site synchronization, and strict builds.
7. Record the exact verification evidence and any untested external dependency.

The commands depend on the project, but the sequence is stable. That is what makes it portable across Codex CLI, Claude Code, Gemini CLI, OpenCode, Grok Build, and other clients.

## Make browser work explicit

Browser automation is another place where raw commands hide state. The reliable pattern is:

1. Launch a visible CDP browser with the intended profile.
2. Connect to it.
3. Read a semantic snapshot or extract text.
4. Perform one visible action.
5. Wait for the expected transition and read the page again.
6. Keep authentication walls and sensitive outbound actions human-controlled.

This makes the browser step auditable and avoids claiming that a configured MCP server is the same thing as a successful live session.

## Use content contracts for content work

Documentation changes deserve tests when they are part of the public product. Useful contracts include:

- every P0 page exists in every supported locale;
- localized navigation points to an existing file;
- promoted articles exist before an index links to them;
- legacy claims are either removed or clearly marked as compatibility behavior;
- strict MkDocs builds complete for docs and blog sites.

These checks are small, fast, and especially valuable for SEO/GEO work because they protect the crawlable structure while prose changes quickly.

## FAQ

### Is this just project management around a CLI?

No. The boundaries are executable checks and state rules: route classification, edit safety, context selection, and verification. They reduce ambiguity at the points where an agent can otherwise make an irreversible or hard-to-review choice.

### Should I persist every transcript?

No. Pull-based context is more predictable. Persist stable project facts, selected work items, and useful handoffs; load them when the next task requires them.

### What is the minimum useful upgrade?

Start with the route matrix, a pre-edit check, and a verification checklist. Add a solo harness or team dispatch only when the work demonstrates a real need for recovery or independent ownership.

Read [Architecture](https://cli.rexai.top/architecture/), [ContextDB](https://cli.rexai.top/contextdb/), and [Workflow Policy](https://cli.rexai.top/workflow-policy/) for the implementation contract.
