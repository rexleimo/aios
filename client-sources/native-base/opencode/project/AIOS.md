# AIOS For OpenCode

This repository provides compatibility-tier native enhancements for OpenCode through repo-local skills and AIOS runtime conventions.

## Agent Self-Trigger

This compatibility projection does not declare prompt hooks. When this client is launched through AIOS shell integration, use the shared workflow policy and continue normal single-agent work for `direct` and `guarded` tasks. Use an injected `team`, `subagent`, or `harness` command only for one explicit `planned` work item.

OpenCode work in this repository uses community tools (RTK + Caveman) for token compression, installed via `aios init`.

## Turn Compression Compliance

OpenCode compatibility mode still requires `bidirectional-turn-compression`: every managed turn needs `pre_send` and `post_receive` evidence. Direct host output bypass is a policy violation; route tool output through AIOS-managed compression surfaces instead.
