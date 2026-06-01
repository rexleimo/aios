# AIOS For Antigravity CLI

AIOS runtime conventions for Antigravity CLI (Google), the successor to Gemini CLI.
Antigravity inherits Agent Skills, Hooks, Subagents, and Extensions from Gemini CLI.

## Skill Discovery

Antigravity discovers skills from `~/.gemini/skills/`, `~/.agents/skills/`, and
workspace `.gemini/skills/` / `.agents/skills/` — all paths already synced by AIOS.

## Agent Self-Trigger

When this client is launched through AIOS shell integration, context files like
`GEMINI.md` are automatically loaded as project context. For delegation or
parallel requests, run the injected `team` or `subagent` AIOS command.
For long-running, overnight, resumable objectives, run `aios harness run`.
