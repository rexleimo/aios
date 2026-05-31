# AIOS Adaptation Layer — Implementation Plan

## Status: What's DONE

| Phase | Scope | Status |
|-------|-------|--------|
| Registry hardening | CLIENT_MCP_TARGETS single source of truth, instructionFileName, nativeProjectSourceFile accessors | DONE |
| MCP per-client | Browser MCP writes to correct location/format for all 4 clients; codex TOML, opencode local-shape, gemini project settings.json, claude project .mcp.json | DONE |
| Instruction parity | Capability-gated shared partials (superpowers, agent-routing, codemap); gemini/opencode get codemap (was zero) | DONE |
| Cascade bugs | proxy-inspector, doctor security-config — replaced hardcoded ~/.claude/mcp.json with registry paths | DONE |
| GAP fixes | skill-index + hud candidates: added .gemini/.opencode; code-home: normalized all 4 client homes | DONE |
| Windows | HOME→USERPROFILE order fix; cmd.exe codex detection unified | DONE |

## Phase 5: Gemini Skills Format Fix (HIGH — next priority)

Gemini CLI reads `.gemini/commands/*.toml` with a `prompt` field, NOT SKILL.md. AIOS currently syncs SKILL.md to `.gemini/skills/` — invisible to Gemini.

**Files to change:**
- `scripts/lib/clients/core/definitions.mjs`: Add `skillFormat: 'toml-command'` to gemini entry
- NEW `scripts/lib/skills/emitters/toml-command.mjs`: Convert SKILL.md frontmatter + body → TOML with `prompt` field, handle `{{args}}` placeholder
- `scripts/lib/skills/sync.mjs`: Branch on `skillFormat`, dispatch gemini to toml-command emitter
- `scripts/lib/clients/paths/index.mjs`: Update gemini `projectSkillRoot` from `.gemini/skills` to `.gemini/commands`
- `config/skills-sync-manifest.json`: Update gemini target root

**Risk:** HIGH — changes existing skill sync behavior; TOML command format differs semantically from SKILL.md. Requirement: test against real Gemini CLI.

## Phase 6: Gemini Instruction File Fix (HIGH)

Gemini `nativeProjectSourceFile` is `AIOS.md` — but Gemini only auto-loads `GEMINI.md`.

**Files to change:**
- `scripts/lib/clients/core/definitions.mjs`: Change gemini `nativeProjectSourceFile` from `AIOS.md` to `GEMINI.md`
- `client-sources/native-base/gemini/project/AIOS.md` → rename to `GEMINI.md` (or create new + update emitter)
- `scripts/lib/native/emitters/compose.mjs`: Verify it reads the correct file

**Risk:** LOW — pure rename, instruction content unchanged

## Phase 7: OpenCode Skills Verification (MEDIUM)

Web search suggests OpenCode configures skills inline in `opencode.json`, not via directory discovery.

**Action:** Test on real OpenCode instance. If `.opencode/skills/` doesn't work, either:
- Add opencode-specific inline injection to the skills sync, OR
- Remove `.opencode` from skills sync and document the limitation

**Risk:** MEDIUM — unclear whether this is a dead path

## Phase 8: Dual-Scope MCP Targets (MEDIUM)

Codex, Claude, Gemini all support both project AND home scope MCP. Our CLIENT_MCP_TARGETS models only one.

**Approach:** Change `scope: 'home'|'project'` to `scopes: [{scope:'home',file:'config.toml'}, {scope:'project',file:'.codex/config.toml'}]`. Migration loop iterates both scopes, respects `createIfMissing` per scope.

**Files to change:**
- `scripts/lib/clients/core/definitions.mjs`: CLIENT_MCP_TARGETS per-client arrays
- `scripts/lib/clients/native/index.mjs`: `resolveClientMcpTargetPath` → `resolveClientMcpTargetPaths`
- `scripts/lib/components/browser/mcp-targets.mjs`: Iterate scopes

**Risk:** MEDIUM — changes the MCP target model; all consumers need updating

## Phase 9: EMITTERS Auto-Derivation (LOW)

`scripts/lib/native/sync/constants.mjs` EMITTERS map is hand-maintained. Should derive from registry.

**Approach:** EMITTERS becomes `Object.fromEntries(ALL_CLIENTS.map(c => [c, (opts) => render({...opts, client: c})]))`

**Risk:** LOW — pure refactor, existing tests cover behavior

## Phase 10: Windows Polish (LOW-MEDIUM)

| Item | Action |
|------|--------|
| cmd.exe context injection silently dropped | Improve warning message to tell user to reinstall client launcher |
| PowerShell $PROFILE fallback | Add env.AIOS_POWERSHELL_PROFILE check (already exists as escape hatch) |
| CRLF normalization on write | Ensure written files use platform-native line endings on Windows |

## Verification Strategy

For each phase:
1. Extend/update existing test files first (TDD)
2. Run affected test groups: `node --test scripts/tests/{client-registry,skills-sync,native-sync,mcp-*,aios-components}.test.mjs`
3. Real CLI smoke test: `node scripts/aios.mjs internal native install --client all; node scripts/aios.mjs internal browser mcp-migrate --dry-run`
4. Pre-phase baseline diff: `git stash; npm run test:scripts; git stash pop; npm run test:scripts; diff failures`

## Rollout Strategy

All phases are independent and can ship incrementally. Recommended order:
1. Phase 6 (Gemini instruction file) — lowest risk, immediate correctness win
2. Phase 5 (Gemini skills format) — highest impact, requires careful testing
3. Phase 8 (Dual-scope MCP) — foundation for completeness
4. Phase 7 (OpenCode verification) — gated on real-environment test
5. Phase 9 (EMITTERS) and Phase 10 (Windows) — tech debt cleanup
