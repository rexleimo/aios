---
name: aios-interception-runtime
description: RTK/Caveman-style AIOS interception runtime. Use when users ask for token compression, RTK/Caveman parity, MCP proxying, raw refs, compact packets, metrics proof, or cross-client interception for codex/claude/gemini/opencode/cursor.
primary: false
---

<!-- 中文注释：这个 Skill 只负责触发和路由拦截运行时，真正的压缩、召回和证明由代码数据面完成。 -->

## Always Read
1. references/runtime-contract.md

## Session Discipline
Every new task about token savings, RTK/Caveman parity, browser/MCP output size, shell output size, refs, or metrics must re-read this file and `references/runtime-contract.md`. Do not answer with prompt-only advice when a deterministic interception surface is available.

## Task Routing
- Need proof/metrics -> run `node scripts/aios.mjs interception proof --json`
- Need repair/default routing -> run `node scripts/aios.mjs interception doctor --fix`
- Need MCP config migration only -> run `node scripts/aios.mjs interception mcp-migrate`
- Need raw recall -> use `node scripts/aios.mjs refs read <ref_id> --session <session>` or `refs grep`
- Need client capability answer -> cite `config/host-capabilities.json` and doctor output, not assumptions

## Runtime Contract
- Data plane is code, not prompt: `InterceptionEngine -> CompactPacket -> RawRefStore -> MetricsSink`.
- MCP clients must route browser tools through `scripts/aios-mcp-proxy.mjs` before the real MCP server.
- AIOS-controlled shell/harness calls must route through `scripts/aios-intercept.mjs` or `runShellEnvelope`.
- Large raw output must not enter the compact packet; raw bytes are recalled through refs.
- Metrics must be written under `.aios/interception/metrics/<session>.jsonl` with `raw_bytes`, `compact_bytes`, `saved_bytes`, and `saving_ratio`.

## Red Flags - STOP
- Claiming RTK/Caveman parity without a fresh `interception proof` result.
- Reporting token savings without `saved_bytes` and `saving_ratio` evidence.
- Calling a client L3 when `config/host-capabilities.json` records a lower level.
- Using `page.get_html`, screenshots, or broad shell reads directly when an MCP proxy or AIOS runner can intercept them.
