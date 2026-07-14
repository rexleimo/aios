---
title: "v1.50.1: All-Client Token Compression Compliance"
description: "Harness CLI v1.50.1 makes token savings measurable across every AIOS client with pre_send, post_receive, proof matrices, and no fake savings for direct host bypasses."
date: 2026-06-05
tags: ["release", "token-compression", "AIOS", "multi-client", "proof"]
---

# v1.50.1: All-Client Token Compression Compliance

Token savings are only useful when they are measurable. A short answer from an agent is not enough. A raw host output that bypasses AIOS is not savings. And a single harness proof does not prove every client follows the same contract.

Harness CLI v1.50.1 closes that gap with a shared metric for every AIOS-managed client: `bidirectional-turn-compression`.

## The Contract

Every AIOS-owned agent turn now has two required compression points:

- `pre_send`: compress prompt/input before it reaches the target client or model.
- `post_receive`: compress client/model output before AIOS accepts it.

The client capability report also requires:

- `requiredEntrypoint=aios-managed-runner`
- `directHostBypassAllowed=false`
- `uncontrolledHostOutput=policy-violation`

That applies to Codex, Claude, Gemini, Antigravity, OpenCode, Crush, Cursor, `aios-harness`, and `generic-mcp`.

## Proof, Not Prompts

Run the proof command:

```bash
node scripts/aios.mjs interception proof --json
```

The JSON output now includes `turn_compression_matrix`. Each row reports `pre_send` and `post_receive` metrics for a client/host, including `saved_bytes`, `saving_ratio`, and compliance status.

For rollout status, run:

```bash
node scripts/aios.mjs clients doctor --json
```

The text doctor also exposes the shared metric:

```text
compression=bidirectional-turn-compression entrypoint=aios-managed-runner pre_send=required post_receive=required bypass=policy-violation
```

## No Fake Savings

If output arrives outside an AIOS-managed turn boundary, v1.50.1 records it as uncontrolled host output:

- `policy_violation=true`
- `compliance_status=non_compliant`
- `saved_bytes=0`
- `saving_ratio=0`

That means reports cannot hide direct host bypasses inside aggregate savings numbers.

## Skill Training Evidence

The `aios-interception-runtime` skill was also trained with SkillOpt-Lite for this release. The accepted training patch added explicit skip discipline: platform-gated Windows-only skips must not be confused with token-compression gaps.

Training artifacts live in:

```text
.skillopt/aios-interception-runtime-2026-06-05
```

## Upgrade Checklist

After upgrading, verify the runtime:

```bash
node scripts/aios.mjs interception proof --json
node scripts/aios.mjs clients doctor --json
npm run test:scripts
```

Expected token-compression evidence:

- `turn_compression_matrix.ok=true`
- every client has non-zero `pre_send.saved_bytes`
- every client has non-zero `post_receive.saved_bytes`
- uncontrolled output is reported as a policy violation, not savings

Read the [Token Intelligence docs](https://cli.rexai.top/token-compression/#all-client-turn-compression-v1501) for the reference contract.
