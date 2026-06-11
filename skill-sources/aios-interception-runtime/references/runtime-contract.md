# AIOS Interception Runtime Contract

<!-- 中文注释：运行时契约定义 raw ref、compact packet、metrics 和客户端能力边界，是验收标准来源。 -->

## Mechanism

1. Tool output enters an AIOS-owned boundary:
   - Shell/harness: `runShellEnvelope` or `scripts/aios-intercept.mjs`
   - MCP: `scripts/aios-mcp-proxy.mjs`
   - MCP shell tool: `scripts/shell-mcp-server.mjs` registered as `aios-shell` in all client configs, proxied through the same MCP proxy
   - Native CLI entrypoints: shell setup installs `~/.aios/bin/<client>` shims ahead of the real clients and routes them through `scripts/contextdb-shell-bridge.mjs`
   - Host-native shell hooks: `scripts/hooks/claude/aios-rewrite.sh` may rewrite supported Bash commands before execution
2. `createInterceptionEngine()` normalizes output and builds a compact packet.
3. MCP wire responses remain protocol-compatible; MCP compact packets are attached at `result._meta.aios` and large `tools/call` text is replaced with a compact text payload.
4. Large raw output is stored in `.aios/interception/refs/<session>/`.
5. Compact packet carries only summary, key lines, errors, refs, and metrics.
6. Metrics JSONL is appended to `.aios/interception/metrics/<session>.jsonl`.
7. Raw recall uses `node scripts/aios.mjs refs read|grep|list`.

## Required Proof

A valid proof must show:

- compact packet does not contain the unique raw sentinel;
- raw ref recall does contain the sentinel;
- metrics record contains the packet ref id;
- `saved_bytes > 0` and `saving_ratio > 0.5` for large outputs;
- MCP config targets are routed through `scripts/aios-mcp-proxy.mjs`.
- for host-native shell hooks, `aios init --agent claude` registers `PreToolUse` and `node scripts/aios.mjs interception rewrite --hook claude --input <json>` returns host protocol JSON with `updatedInput.command`.
- for native CLI entrypoints, `node scripts/aios.mjs clients doctor --native-strict --json` shows managed shims installed, first in `PATH`, and backed by a real downstream client after the shim dir is removed from `PATH`.

Run:

```bash
node scripts/aios.mjs interception doctor --fix --json
```

## Client Levels

Use `config/host-capabilities.json` as the source of truth.
Do not over-claim native raw-shell interception for a client that lacks a verified pre-tool mutation surface.

## Shell Rewrite Guardrails

- Rewrite only supported noisy commands (`git`, `rg`, test/build commands, etc.) through `scripts/aios-intercept.mjs`.
- Fail open when the command is unsupported or the hook cannot parse input.
- Do not rewrite commands with shell constructs where compact JSON would change semantics: pipes, redirection, command substitution, or backticks.

## Native Shim Guardrails

- Shims live in `~/.aios/bin` and are managed files only.
- The bridge removes `AIOS_NATIVE_SHIM_DIR` from child `PATH` before launching the real client or AIOS runner to avoid recursion.
- Strict shim verification must also find the real downstream client after removing `AIOS_NATIVE_SHIM_DIR` from `PATH`.
- Native shims prove process-level input/output control and AIOS runner entry. They do not prove internal interactive model-turn interception unless the client also has a verified hook/plugin/gateway.
- Shims self-heal by probing common AIOS install paths when the baked-in fallback fails; if no install is found, they fail-open by exec-ing the real client binary directly.
