# Native Route Shortcut Fix

## Objective
After a normal AIOS install, users should have practical client-level shortcuts for routing work as `single`, `subagent`, `team`, or `harness`, instead of only seeing prompt-level `/single <task>` guidance inside `ctx-agent` one-shot context.

## Root Cause
AIOS already parsed `/single`, `/subagent`, `/team`, and `/harness` in `scripts/ctx-agent-core.mjs` one-shot prompts and injected route guidance into wrapped interactive sessions. It did not materialize client-native command/prompt files during install, so users could not type those shortcuts directly in normal `codex`, `claude`, `gemini`, or `opencode` sessions.

## Client Compatibility Evidence
- Claude Code supports custom slash commands from command files under `.claude/commands` or `~/.claude/commands`.
- Gemini CLI supports custom commands from TOML files under `.gemini/commands` or `~/.gemini/commands`, using `{{args}}` for user arguments.
- OpenCode supports custom commands under `.opencode/commands` or `~/.config/opencode/commands`.
- Codex CLI official docs expose custom prompt files under `$CODEX_HOME/prompts`; they are invoked as `/prompts:<name>` and support `$ARGUMENTS`. The docs mark custom prompts as deprecated in favor of skills, but still supported as of 2026-05-13: https://developers.openai.com/codex/custom-prompts
- Codex CLI official slash-command docs list built-in top-level commands separately; no official direct custom top-level `/single` command path was found: https://developers.openai.com/codex/cli/slash-commands

## Implementation Plan
1. Add a route command renderer/installer that writes four managed shortcuts per client:
   - Codex: `$CODEX_HOME/prompts/{single,subagent,team,harness}.md` (invoked as `/prompts:single`, `/prompts:subagent`, `/prompts:team`, `/prompts:harness`)
   - Claude: `$CLAUDE_HOME/commands/{single,subagent,team,harness}.md`
   - Gemini: `$GEMINI_HOME/commands/{single,subagent,team,harness}.toml`
   - OpenCode: `$OPENCODE_HOME/commands/{single,subagent,team,harness}.md`
2. Keep commands safe and auditable:
   - Managed marker around AIOS command bodies.
   - Skip unmanaged user command files instead of overwriting them.
   - Uninstall removes only managed AIOS route commands.
3. Wire route command provisioning into native install/update/uninstall so release first-run setup creates them automatically.
4. Add regression coverage for install, unmanaged conflict preservation, uninstall, and native component integration.
5. Document actual shortcut names and Codex-specific prompt file behavior.

## Implementation Notes
- `syncRouteTriggerCommands` installs/updates/removes only files carrying the AIOS route command marker and skips unmanaged user files.
- Native install/update/uninstall now provisions route shortcuts alongside repo-local native surfaces.
- Native doctor checks route command drift and `--fix` repairs env-scoped homes; tests isolate client homes through `CODEX_HOME`, `CLAUDE_HOME`, `GEMINI_HOME`, and `OPENCODE_HOME`.
- Codex command bodies display `/prompts:<route>` to avoid promising unsupported top-level `/single` behavior.

## Verification Targets
- `node --test scripts/tests/native-route-commands.test.mjs`
- `node --test scripts/tests/native-route-commands.test.mjs scripts/tests/native-sync.test.mjs scripts/tests/native-doctor.test.mjs`
- `npm run test:scripts`
- `npm run check:site-sync`

## Verification Log
- 2026-05-13: `node --test scripts/tests/native-route-commands.test.mjs scripts/tests/native-sync.test.mjs scripts/tests/native-doctor.test.mjs` passed (19 tests).
- 2026-05-13: `npm run test:scripts` passed (423 tests).
- 2026-05-13: `npm run check:site-sync` passed.
