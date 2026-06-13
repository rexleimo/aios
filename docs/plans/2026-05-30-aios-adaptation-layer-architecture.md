# AIOS Unified Client Adaptation Layer — Architecture Design

## 1. What Problem This Solves

AIOS generates per-client config (skills, MCP, agents, instructions, commands) for 4 AI coding tools. Before this audit, the adaptation layer had three failure modes:

1. **Wrong format/location** — e.g., MCP written to `~/.claude/mcp.json` (not a real Claude Code path), Gemini skills in SKILL.md (Gemini reads TOML), `AIOS.md` won't load on Gemini
2. **Drift between subsystems** — codemap had its own hardcoded per-client map separate from browser MCP; changes in one didn't propagate
3. **Capability blind spots** — superpowers/codemaps instructions only reached claude/codex; gemini/opencode got almost nothing

## 2. Target Architecture

```
┌─────────────────────────────────────────────────────────┐
│  CLIENT REGISTRY (scripts/lib/clients/)                 │
│  Single source of truth for ALL per-client conventions  │
│                                                         │
│  CLIENT_DEFINITIONS: capabilities, commandName,         │
│    instructionFileName, nativeProjectSourceFile,        │
│    projectSkillRoot, agentTargetRoot, modelArgFlag...   │
│                                                         │
│  CLIENT_MCP_TARGETS: scope, file, format, namespace     │
│  CLIENT_SKILL_TARGETS: dir, format, frontmatter schema  │
│  CLIENT_COMMAND_TARGETS: dir, format, namespace style   │
└────────────┬────────────────────────────────────────────┘
             │
    ┌────────┼────────┬──────────┬───────────┐
    ▼        ▼        ▼          ▼           ▼
  Skills   MCP      Agents    Commands   Instructions
  Sync     Migration Sync      Emitter    Emitter
```

### 2.1 Registry Data Model (complete)

CLIENT_DEFINITIONS entry (per client):
```
{
  // Identity
  commandName, runtimeClientId

  // Capabilities — gates ALL optional features
  capabilities: ['skills'|'agents'|'superpowers'|'native'|'team'|'harness'][]

  // Artifact targets
  instructionFileName: 'CLAUDE.md'|'AGENTS.md'|'GEMINI.md'
  nativeProjectSourceFile: 'CLAUDE.md'|'AGENTS.md'|'AIOS.md'
  projectSkillRoot: '.claude/skills'|'.codex/skills'|...
  agentTargetRoot: '.claude/agents'|'.codex/agents'|undefined

  // Runtime args
  modelArgFlag, unattendedArgs, unattendedInsertAfterToken
}
```

CLIENT_MCP_TARGETS (per client):
```
{ scope: 'home'|'project', file: string, format: 'json'|'toml'|'opencode-json',
  namespace: 'mcpServers'|'mcp_servers'|'mcp', entryShape: 'stdio'|'codex-stdio'|'opencode-local' }
```

CLIENT_SKILL_TARGETS (NEW — per client):
```
{ dir: string, format: 'skille-md-yaml'|'toml-command', frontmatterRequired: ['name']|['prompt'],
  multiFile: bool, autoDiscover: bool }
```

### 2.2 Consumer Pattern

Every subsystem that needs per-client behavior calls registry accessors:

```
import { getClientMcpTarget, resolveClientMcpTargetPath } from '../clients/registry.mjs';
// NOT: path.join(home, 'mcp.json')  ← hardcoded, wrong for codex/gemini/opencode
```

Key accessors (all pure, no filesystem):
- `getClientMcpTarget(client)` → {scope, file, format, namespace, entryShape}
- `resolveClientMcpTargetPath(client, {projectRoot, clientHome})` → absolute path
- `getClientInstructionFileName(client)` → 'CLAUDE.md' etc.
- `getClientSkillTarget(client)` → {dir, format, frontmatterSchema} (NEW)
- `supportsClientCapability(client, 'agents')` → bool
- `resolveClientsWithCapability('skills', 'all')` → ['codex','claude','gemini','opencode']

### 2.3 Capability-Based Degradation

The capability matrix (`CAPABILITY_CLIENT_ORDER`) controls graceful degradation:
- Client w/o `agents` → agent sync skipped for that client
- Client w/o `superpowers` → superpowers section NOT emitted in instructions
- Client w/o `skills` → skill sync skipped

Adding a new client means one registry entry — no emitter code changes if:
- It matches an existing format (e.g., `json` MCP, `skill-md-yaml` skills)
- If it needs a NEW format, add one format handler

## 3. Instruction File Architecture

Each client's managed instruction block = capability-gated sections:

```
[AIOS NATIVE BEGIN]           ← managed marker
  core-instructions.md        ← all clients
  contextdb.md                ← all clients
  superpowers.md              ← only clients with 'superpowers' capability
  agent-routing.md            ← only clients with 'agents' capability
  codemap.md                  ← all clients with 'native' capability
  browser-mcp.md              ← all clients
[client project source]       ← per-client thin wrapper
[AIOS NATIVE END]
```

Per-client project sources are minimal (4–9 lines naming the client layer).

## 4. MCP Registration Architecture

Two MCP server aliases: `mcp-browser-use` (browser, proxied), `aios-auth-tools`.

Format dispatch per `target.format`:
- `json` → JSON parse → upsert mcpServers.<alias> → JSON stringify
- `toml` → remove old managed sections → append new [mcp_servers.<alias>] blocks
- `opencode-json` → JSON parse → upsert mcp.<alias> as {type:'local',command:[...],enabled,environment}

All three are idempotent (re-running produces identical output).

## 5. Remaining Technical Debt

| Item | Impact | Plan |
|------|--------|------|
| Gemini skills: SKILL.md → TOML | Gemini gets zero discoverable skills | Add toml-command emitter, update projectSkillRoot |
| Gemini instruction file: AIOS.md not loaded | Native instructions invisible to Gemini | Write to GEMINI.md instead |
| OpenCode skills unverified | May be dead path | Research or remove |
| Dual-scope MCP (codex/claude/gemini home+project) | Admin-level MCP configs missed | Add dual-target support to CLIENT_MCP_TARGETS |
| EMITTERS map still hand-maintained | Could drift from registry | Auto-derive from registry entries |
| Windows: cmd.exe context injection silently dropped | Users don't know they lost context | Improve warning |
