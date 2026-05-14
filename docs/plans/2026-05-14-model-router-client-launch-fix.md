# Model Router Client Launch Fix Plan

**Goal:** Make AIOS model-router/subagent launches for Claude, Codex, and Gemini non-interactive and verify each client answers a simple `hi` prompt within 120 seconds.

**Success Criteria:**
- Codex launches with `--dangerously-bypass-approvals-and-sandbox` immediately after `codex exec`.
- Claude launches with `--dangerously-skip-permissions` in one-shot subagent calls.
- Gemini launches with `--yolo` in one-shot subagent calls.
- Model-router route metadata advertises matching unattended CLI protocols.
- Real `claude`, `codex`, and `gemini` smoke tests return a response to `Reply exactly: hi` within 120 seconds.

## Evidence-First Debugging

- Initial `runOneShot` smoke: Claude returned `hi` in 26.4s, Gemini returned `hi` in 31.9s with MCP warnings, Codex timed out after 120s despite stderr showing `approval: never` and `sandbox: danger-full-access`.
- Direct Codex comparison showed `codex exec --dangerously-bypass-approvals-and-sandbox -c ... -` returned `hi`, while the existing runtime order `codex exec -c ... --dangerously-bypass-approvals-and-sandbox -` hung until killed.
- Claude `--permission-mode bypassPermissions --print` hung in a 45s probe, while `--dangerously-skip-permissions --print` returned `hi`.
- Gemini `--yolo -p` returned `hi` and explicitly logged that YOLO mode was enabled.

## Implementation Tasks

- [x] Add failing regression coverage for Codex bypass flag ordering in `scripts/tests/aios-orchestrator.test.mjs`.
- [x] Add failing regression coverage for routed Gemini/Claude unattended flags in `scripts/tests/aios-orchestrator.test.mjs`.
- [x] Add failing regression coverage for model-router `cliCommand` metadata in `scripts/tests/model-router.test.mjs`.
- [x] Update `scripts/lib/harness/subagent-runtime.mjs` to add default unattended flags for Claude/Gemini and place the Codex bypass flag before config/model flags.
- [x] Update `scripts/lib/model-router.mjs` to render unattended launch protocols in route metadata.
- [x] Run fixed 120s real-client smoke and save evidence under `temp/model-router-hi-smoke-fixed-*.json`.

## Verification Checklist

- [x] `node --test scripts/tests/model-router.test.mjs --test-name-pattern 'unattended launch flags'`
- [x] `node --test scripts/tests/aios-orchestrator.test.mjs --test-name-pattern 'Codex child workers unattended|model-router per job'`
- [x] Real 120s `hi` smoke through `runOneShot` for `claude-code`, `codex-cli`, and `gemini-cli`
- [x] `npm run test:scripts`
- [x] `cd mcp-server && npm run typecheck && npm run test && npm run build`
