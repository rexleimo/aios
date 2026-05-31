# AIOS For Crush

This repository provides compatibility-tier native enhancements for Crush (charmbracelet) through repo-local skills and AIOS runtime conventions.

Crush auto-discovers skills from `.agents/skills`, `.crush/skills`, and `.claude/skills` (project and global). It also auto-loads `AGENTS.md`, `CLAUDE.md`, and `GEMINI.md` as context files — so all AIOS instructions are automatically in scope.

## Agent Self-Trigger

When this client is launched through AIOS shell integration, continue normal single-agent work by default. For explicit delegation/parallel requests, run the injected `team` or `subagent` AIOS command. For long-running, overnight, resumable objectives, run `aios harness run --objective "<task>" --worktree --max-iterations 8` and use `aios harness status/resume/stop` for handoff.
