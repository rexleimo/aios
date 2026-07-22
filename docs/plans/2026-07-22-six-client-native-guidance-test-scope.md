# Six-Client Native Guidance Test Scope

## User Goal

Project Codex, Claude Code, Gemini, OpenCode, Hermes, and Grok from one client-neutral workflow core without loading unrelated client manuals or route-specific operating details into ordinary startup context.

## Non-Goals

- Do not change Rex Capability selection, risk facts, stage order, or Evidence Contracts.
- Do not change skill discovery precedence or duplicate-skill resolution.
- Do not promote Gemini or another compatibility client to a live capability tier.
- Do not add prompt hooks outside Claude.
- Do not change Team, Harness, Browser MCP, ContextDB, CRG, Model Router, or interception runtime behavior; only remove their detailed manuals from always-loaded guidance.
- Do not modify `mcp-server` browser behavior.

## In-Scope Observable Behaviors

1. `composeNativeMarkdown()` returns the same client-neutral AGENTS content for Codex, OpenCode, Hermes, and Grok.
2. Claude and Gemini outputs begin with the same workflow core and may append only their verified native overlay.
3. Every client output retains these semantic invariants: `direct | guarded | planned`; current Rex Command owns Provider selection; pre-edit safety; verification before completion; local-safe versus external/destructive approval boundary; privacy/secrets red lines; route details load on demand.
4. Ordinary output omits full ContextDB/Memo, CRG, Browser MCP, Team/Harness, Model Router, deprecated interception history, and other-client manuals.
5. Only Claude claims verified prompt hooks. Gemini remains compatibility/static-safe. Hermes receives no agents or team instructions.
6. The shared AGENTS result is independent of which eligible emitter owns the write and of the selected-client set.
7. The generated ordinary guidance is no more than 40% of the previous always-loaded partial chain and remains within an 8,000-character proxy budget for approximately 1,500-2,000 tokens.
8. Native sync preserves user-authored text and managed-block markers while writing the new compact projection.

## Out-of-Scope Behaviors

- The detailed contents of on-demand skills are not rewritten in this batch.
- Live client CLI invocation and unattended Team/Harness execution are rollout work, not unit-test requirements for this composer change.
- Tokenization-provider exact counts are not a unit-test seam; character budget and relative source-size reduction are deterministic proxies, with client smoke reserved for rollout evidence.

## Acceptance Mapping

| Acceptance behavior | Public seam | Assertion |
| --- | --- | --- |
| One neutral shared AGENTS projection | `composeNativeMarkdown({ rootDir, client })` | Codex/OpenCode/Hermes/Grok results are byte-identical and contain no client-manual headings |
| Same invariants on six clients | `composeNativeMarkdown()` | Required policy phrases are present for every registered native client |
| Native overlays cannot redefine workflow | composer output for Claude/Gemini | Shared core appears first; overlay claims match verified hook/tier facts |
| Details are on demand | composer output | Heavy partial headings and route command manuals are absent; on-demand route references remain |
| Startup context shrinks | composer output plus checked-in partial sizes | Per-client output is at most 8,000 characters and shared output is at most 40% of the prior chain |
| Deterministic shared-file ownership | `renderCodexNativeOutputs`, `renderOpencodeNativeOutputs`, `renderHermesNativeOutputs`, `renderGrokNativeOutputs` | Each standalone markdown operation produces identical AGENTS content |
| Managed sync remains safe | `syncNativeEnhancements()` in a temporary root | User text and markers survive; generated blocks match the compact contract |
| Hook/capability truthfulness | checked-in client sources and settings | Only Claude settings contain prompt hooks; no false Hermes/Gemini agent/team claim appears |

## Allowed Test Seams

- Primary focused seam: `scripts/tests/native-agent-guidance.test.mjs` through exported composer and emitter functions.
- Integration seam: `scripts/tests/native-sync.test.mjs` through `syncNativeEnhancements()` against temporary directories.
- Existing policy regression seams: `npm run test:workflow-policy` and `npm run test:rex-integration`.
- Final repository seam: `npm run test:scripts`, `clients doctor --json`, and `agents doctor --json`.

Tests must not gain a pass by deleting assertions, skipping clients, weakening required invariants, or asserting only mock call counts. The minimal vertical slice is composer output plus temporary-root native sync because together they observe the generated client-facing behavior without invoking unrelated live clients.

## Completion Judgment

The batch is complete only when focused tests first demonstrate the current projection failure, the implementation satisfies the acceptance mapping, root managed projections are regenerated from canonical sources, full repository verification passes, and measured output meets both deterministic size thresholds.

