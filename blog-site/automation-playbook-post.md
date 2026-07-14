---
title: "Automation Playbook: Build a Reliable Browser Content Workflow"
description: "A practical, human-controlled playbook for browser content operations with queues, review gates, CDP sessions, ContextDB, and measurable outcomes."
date: 2026-07-14
tags: ["browser automation", "content operations", "MCP", "ContextDB", "workflow design"]
---

# Automation Playbook: Build a Reliable Browser Content Workflow

> **Quick Answer:** The reliable way to automate browser-based content work is to separate planning, drafting, human review, publishing, and measurement. Use a visible CDP browser and explicit MCP actions, keep credentials in the browser profile, respect platform rules and rate limits, and record outcomes in a searchable project context. Automation should remove repetitive steps, not remove accountability.

Browser automation is often described as a macro: open a page, click a button, paste text, repeat. That model hides the important parts of the workflow: which content is approved, which account is active, what happened after publishing, and how to recover after a browser or network failure.

This playbook turns the macro into a small operating system for repeatable content work.

## The workflow in one page

| Stage | System responsibility | Human responsibility |
| --- | --- | --- |
| Plan | Maintain an idea queue and status fields | Set goals, audience, and publishing constraints |
| Draft | Generate variants and attach source references | Edit for accuracy, tone, and originality |
| Review | Block unapproved items from the publish queue | Approve the final copy and media |
| Publish | Navigate the visible browser and report the result | Handle authentication walls and sensitive actions |
| Measure | Record outcome metrics and timestamps | Interpret results and choose the next experiment |

The status model should be explicit: `idea -> draft -> review -> approved -> published -> measured`. A failed browser action is not the same as a rejected draft, so keep operational outcomes separate from content outcomes.

## 1. Start with a queue, not a prompt

Store one content item per record with:

- a stable content ID;
- target platform and account label;
- topic, audience, and intended action;
- draft text and media references;
- approval status and reviewer;
- publish window and actual timestamp;
- result metrics and follow-up note.

The queue makes work resumable. If the browser closes after item 12, the next run can query `approved` items rather than asking an agent to infer state from a transcript.

## 2. Use a visible, bounded browser loop

For browser work, use the repo's preferred browser-use CDP path:

1. Launch a visible browser with the intended profile.
2. Connect through CDP.
3. Read a semantic snapshot or extract the relevant text.
4. Perform one visible action.
5. Wait for the expected state transition.
6. Re-read the page and record the outcome.

Keep authentication and sensitive outbound actions human-controlled. Do not build a stealth system, rotate identities, bypass platform controls, or claim that random delays make an automation flow compliant. Use official APIs or platform-approved automation where available, and keep a person in the loop for account, policy, and publication decisions.

## 3. Make review a real gate

An approval checkbox is not enough if the publisher ignores it. The publish step should require:

```text
status == approved
reviewer != empty
media references resolve
target account matches the selected profile
```

If any condition fails, stop and report `blocked`. Do not silently downgrade the check to a warning. This is the same principle as the Harness CLI edit gate: a safety boundary must be observable and enforceable.

## 4. Store useful context, not every transcript

ContextDB is useful for durable facts, queue state, references, and handoff notes. A pull-based workflow can retrieve the item needed for the next action without injecting the entire historical conversation.

For search and maintenance, see the [ContextDB documentation](https://cli.rexai.top/contextdb/) and the [ContextDB Search article](contextdb-fts-bm25-search.md). Keep personal data, credentials, cookies, and unredacted authorization logs out of public artifacts.

## 5. Measure outcomes with a stable definition

Record the same fields for each item and platform. Useful measures include exposure, reads, saves, comments, follows, click-throughs, and time from approval to publication. Do not compare a post published for two hours with one measured for seven days without recording the observation window.

Perception can summarize outcomes, but it does not decide what is true or automatically publish a new variant. The next experiment should state one hypothesis, one changed variable, and one observation window.

## Recovery checklist

When a run stops, classify the outcome before retrying:

- `blocked`: human approval, login, or policy decision is required;
- `failed`: the content or requested operation is invalid;
- `infra-retry`: browser, tool, or network may recover;
- `published`: publication was verified;
- `measured`: the observation was recorded.

Attach the last page state, account label, content ID, and next safe action. A good handoff lets another operator continue without guessing.

## FAQ

### Can this workflow publish without human review?

Only when the platform, account owner, and project policy explicitly allow that level of automation. The default playbook keeps approval and sensitive outbound actions human-controlled.

### Should I automate several accounts at once?

First prove the queue, review, and recovery model with one account. Add isolated profiles and explicit ownership only after the single-account flow is observable and compliant.

### What is the smallest useful setup?

Use a content queue, one visible CDP browser profile, an approval gate, and an outcome record. Add ContextDB search and Perception summaries when the volume justifies them.

## Canonical Docs

Start with [Getting Started](https://cli.rexai.top/getting-started/), [Browser Auth-Wall Case](https://cli.rexai.top/case-auth-wall-browser/), [ContextDB](https://cli.rexai.top/contextdb/), and [Troubleshooting](https://cli.rexai.top/troubleshooting/).
