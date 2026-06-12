# ContextDB No-Injection Runtime Release Notes

Date: 2026-06-12
Version: 2.0.0
Impact: major

## Summary

This release removes the old ContextDB prompt-injection runtime path. AIOS no longer turns ContextDB packets, handoff prompts, persona overlays, user overlays, or router guides into automatic model input at interactive startup or one-shot execution.

The new architecture is pull-based:

- Interactive startup may print a short local unfinished-task summary to stderr.
- The summary is not sent to the model.
- Users must explicitly name the task, handoff, checkpoint, event, or ref they want to continue.
- Stable operating rules live in checked-in instruction files and skills.
- ContextDB remains the storage and retrieval layer for sessions, checkpoints, reports, and evidence.

## Breaking Changes

Removed behavior:

- `--startup-mode inject`
- `--context-mode`
- `--limit` as a prompt-loading control
- `CTXDB_AUTO_PROMPT`
- automatic Context Packet prompt wrapping
- generated Handoff Prompt model input
- automatic persona/user overlay injection
- automatic route-guide injection
- workspace memory overlay prompt injection

`context:pack` is now a manual inspection/debug report. It is not a default model prompt source.

## Migration

Before:

```bash
scripts/ctx-agent.sh --agent codex-cli --startup-mode inject --prompt "continue"
```

After:

```bash
scripts/ctx-agent.sh --agent codex-cli --prompt "Continue task <id>; first read only the selected handoff/checkpoint files I name."
```

For explicit recall, use targeted ContextDB retrieval:

```bash
cd mcp-server
npm run contextdb -- search --query "<term>" --project <project>
npm run contextdb -- timeline --session <session_id> --limit 30
```

For report/debug export only:

```bash
cd mcp-server
npm run contextdb -- context:pack --session <session_id> --token-budget 1200 --token-strategy balanced
```

Do not paste the full generated report into a model prompt by default. Retrieve only the specific event, checkpoint, or offload ref needed for the next step.

## Updated Skill Policy

The following skills were trained and updated to preserve the no-injection architecture:

- `skill-sources/contextdb-autopilot/SKILL.md`
- `skill-sources/aios-long-running-harness/SKILL.md`

SkillOpt artifacts:

- `.skillopt/contextdb-no-injection-2026-06-12/`
- `.skillopt/harness-no-injection-2026-06-12/`

Validation scores:

- `contextdb-autopilot`: 0.3333 -> 1.0
- `aios-long-running-harness`: 0 -> 1.0

## Verification

Release validation performed before merge:

- `node --test scripts/tests/skills-no-injection-policy.test.mjs`
- `node scripts/check-native-sync.mjs`
- `node scripts/check-skills-sync.mjs`
- `npm run test:scripts`
- `cd mcp-server && npm run typecheck && npm run test && npm run build`
- CRG incremental update and change detection

Post-merge release validation should run from `main` before tagging and pushing the production release.
