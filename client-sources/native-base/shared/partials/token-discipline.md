## AIOS Token Discipline

AIOS uses native token discipline profiles: `minimal | balanced | full`.

- `minimal`: prefer the smallest useful context; use semantic summaries, scoped reads, and compact handoffs.
- `balanced`: default profile; preserve enough evidence for implementation while avoiding noisy full-output dumps.
- `full`: use only when debugging, auditing, or reviewing requires broader evidence.

Use strategic compact at stable boundaries: after exploration, before implementation; after a milestone; after debugging; before context switch.

Avoid compacting in the middle of implementation, active debugging, or a multi-file refactor where local continuity matters.

Keep MCP surfaces lean. Disable low-value MCP servers when the active client already has enough native tooling, and prefer AIOS compact packets/raw refs for large outputs.

Do not replace AIOS interception runtime. Token profiles are a pre-context hygiene layer; `scripts/aios-mcp-proxy.mjs`, raw refs, compact packets, and interception metrics remain authoritative.
