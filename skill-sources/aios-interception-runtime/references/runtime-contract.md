# AIOS Interception Runtime Contract

<!-- 中文注释：运行时契约定义 raw ref、compact packet、metrics 和客户端能力边界，是验收标准来源。 -->

## Mechanism

1. Tool output enters an AIOS-owned boundary:
   - Shell/harness: `runShellEnvelope` or `scripts/aios-intercept.mjs`
   - MCP: `scripts/aios-mcp-proxy.mjs`
2. `createInterceptionEngine()` normalizes output and builds a compact packet.
3. Large raw output is stored in `.aios/interception/refs/<session>/`.
4. Compact packet carries only summary, key lines, errors, refs, and metrics.
5. Metrics JSONL is appended to `.aios/interception/metrics/<session>.jsonl`.
6. Raw recall uses `node scripts/aios.mjs refs read|grep|list`.

## Required Proof

A valid proof must show:

- compact packet does not contain the unique raw sentinel;
- raw ref recall does contain the sentinel;
- metrics record contains the packet ref id;
- `saved_bytes > 0` and `saving_ratio > 0.5` for large outputs;
- MCP config targets are routed through `scripts/aios-mcp-proxy.mjs`.

Run:

```bash
node scripts/aios.mjs interception doctor --fix --json
```

## Client Levels

Use `config/host-capabilities.json` as the source of truth.
Do not over-claim native raw-shell interception for a client that lacks a verified pre-tool mutation surface.
