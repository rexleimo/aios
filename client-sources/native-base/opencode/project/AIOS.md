# AIOS For OpenCode

This repository provides compatibility-tier native enhancements for OpenCode through repo-local skills and AIOS runtime conventions.

## Agent Self-Trigger

When this client is launched through AIOS shell integration, continue normal single-agent work by default. For explicit delegation/parallel requests, run the injected `team` or `subagent` AIOS command. For long-running, overnight, resumable objectives, run `aios harness run --objective "<task>" --worktree --max-iterations 8` and use `aios harness status/resume/stop` for handoff.

## Turn Compression Compliance

OpenCode work in this repository must obey the shared AIOS `bidirectional-turn-compression` metric: run live work through the AIOS-managed runner, require `pre_send` compression before model input, require `post_receive` compression after model output, and treat direct host bypass as a policy violation.
