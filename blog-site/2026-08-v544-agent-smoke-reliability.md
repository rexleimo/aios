---
title: "v5.4.4: Reliable Agent Smoke — Output-Contract Clients and Escalating Probe Timeouts"
description: "v5.4.4 fixes agents getting permanently stuck in 'command invalid / workflow stuck' states: live smoke now works with output-contract clients like Codex, the hardcoded 30s probe timeout is configurable (default 60s), and probes auto-retry at 2x/4x before an agent is ever blocked."
date: 2026-08-06
tags: ["AIOS", "agents", "smoke", "timeout", "reliability", "release"]
---

# v5.4.4: Reliable Agent Smoke — Output-Contract Clients and Escalating Probe Timeouts

> **Quick Answer:** v5.4.4 fixes the "command invalid / workflow stuck" failure mode. Agents were being permanently disabled when the live smoke probe failed for reasons that had nothing to do with the agent: clients like Codex wrap every reply in a JSON output contract (the probe couldn't see its own ACK), and a hardcoded 30s timeout turned one slow cold start into a permanent block. Smoke probes now override the output contract explicitly, tolerate JSON-wrapped replies, use a configurable timeout (default 60s via `AIOS_AGENT_SMOKE_TIMEOUT_MS` or `--timeout-ms`), and auto-retry at 2x/4x before ever blocking an agent.

## The failure mode: workflows that silently die

A workflow suddenly reports `overallstatus: "blocked"` and every command is judged "invalid". The root cause chain is longer than it looks:

1. The live smoke probe is the gatekeeper — an agent cannot participate in live orchestration until smoke evidence is recorded.
2. If the probe fails, no evidence is written, and the agent stays workflow-disabled.
3. Disabled agents → `strict.blocked` → every Command is rejected as invalid.

Two independent bugs made the probe fail for healthy agents:

**Bug 1 — the output contract trap.** Some clients (Codex being the most common) wrap *every* response in their JSON handoff contract, even a probe that says "reply with an ACK only". The probe looked for a plain ACK marker, never found it inside the JSON wrapper, and reported failure. Worse, the more correctly the client followed its own contract, the more reliably the probe failed — a protocol deadlock.

**Bug 2 — one slow response = permanent block.** The probe had a hardcoded 30s timeout with no retry. A slow client cold start or a model queue delay pushed one probe past 30s, the agent was blocked, and nothing retried — recovery required a human who knew about `--timeout-ms` to re-run the smoke manually.

## What changed in v5.4.4

### Smoke works with output-contract clients

- The probe prompt now explicitly declares "Do NOT return a JSON handoff object — reply with the ACK marker only", overriding the client's output contract for the probe.
- ACK detection tolerates JSON-wrapped replies: if the raw marker is not found, the reply is parsed as JSON and searched inside the wrapper.
- The post-receive compression proof is required only for outputs at or above `minRawBytes` (2048 bytes). Short outputs are inlined by design — they are legitimate boundary behavior, not a smoke failure.
- Empty compression refs no longer crash evidence recording (optional chaining on `refs[0]`).

### Escalating probe timeouts instead of one-shot death

- The hardcoded 30s timeout is replaced by `AIOS_AGENT_SMOKE_TIMEOUT_MS` (env) and `agents smoke --timeout-ms <ms>` (CLI), with the default raised to 60s.
- On a transient slow response the probe now auto-retries with escalated timeouts: **60s → 120s → 240s**. Only after all three attempts time out is the agent blocked.
- The final blocker message includes the exact recovery command, so a human never has to guess how to unblock.

### Why not let the agent decide its own timeout?

A natural question: why doesn't the agent "think harder" and give itself more time? Because it can't, and it shouldn't. The timeout is a host-side process parameter — the agent process never sees it, and letting the tested subject grade its own test is how you get self-certifying failures. The budget belongs to the operator, who knows the client's cold-start behavior; the *host* escalates automatically instead.

Real task execution is a separate budget entirely: subagent jobs use `SUBAGENT_TIMEOUT_MS` (default 10 minutes). The 30s/60s probe timeout never constrained real work — it only guarded the connectivity handshake.

## What you should do

- Existing installs: `aios update`.
- If you hit "command invalid / workflow stuck" before: re-run `aios agents smoke --live --client <name> --timeout-ms <ms>` to regenerate v2 smoke evidence, then `aios doctor --agents` to confirm the catalogue is green.
- If your client is unusually slow to cold-start, set `AIOS_AGENT_SMOKE_TIMEOUT_MS` in your environment instead of passing the flag each time.

## FAQ

### Will the probe now hide genuinely broken agents?

No. Long outputs that lack a compression ref still fail closed, and non-timeout errors (missing command, non-zero exit, missing managed-invocation proof) are never retried — they block immediately. Only *timeout-class* failures get the 2x/4x escalation, and even then only three attempts total.

### Is 60s × 3 attempts too long for a probe?

The escalation only kicks in after a real timeout. A healthy client answers in seconds — the first attempt succeeds and no retry happens. The 240s worst case is paid only by clients that genuinely cannot answer in 60–120s.

### Do I need to migrate anything?

No. This is a behavioral fix; evidence files keep the same schema. Just re-run the live smoke to regenerate v2 evidence if your agents are currently blocked.

The pattern here is worth keeping: a gatekeeper that punishes one slow response as if it were a failure is a clock, not a health check. Escalate, retry, and only then judge.
