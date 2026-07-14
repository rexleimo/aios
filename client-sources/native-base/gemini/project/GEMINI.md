# AIOS For Gemini

This repository provides compatibility-tier native enhancements for Gemini through repo-local skills and AIOS runtime conventions.

## Agent Self-Trigger

This compatibility projection does not declare prompt hooks. When this client is launched through AIOS shell integration, use the shared workflow policy and continue normal single-agent work for `direct` and `guarded` tasks. Use an injected `team`, `subagent`, or `harness` command only for one explicit `planned` work item.
