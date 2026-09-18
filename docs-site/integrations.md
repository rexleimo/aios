---
title: Vendor Integrations (TypeSafe / Jev)
description: "Adopt third-party agent skills and MCP servers through one pinned, hash-verified, dry-runnable command. TypeSafe support covers all nine AIOS clients."
---

# Vendor Integrations (TypeSafe / Jev)

> **Quick Answer:** `aios integration add <vendor>` installs a third-party agent skill and its MCP server through a pinned commit, a verified sha256, a per-client registration plan, and a live handshake check. The first shipped vendor is **TypeSafe (System One / Jev)**. Run `aios integration add typesafe --dry-run` to see the exact per-client plan before anything changes on disk.

## Why a vendor integration command exists

Most vendors ship adoption as a paragraph of prose — "copy this prompt / paste this config into your agent". That is a supply-chain risk: the text is unversioned, unhashed, and untested against your actual client set.

`aios integration` turns that paragraph into an operator command with four hard gates:

| Gate | What it proves |
| --- | --- |
| Pinned commit | The skill is fetched from an immutable revision, not a moving branch |
| Verified sha256 | File content matches the reviewed artifact; a tampered or stale copy is refused |
| Per-client plan | Every one of the nine AIOS clients gets an explicit, inspectable registration step |
| Live handshake | The docs MCP server is actually reachable and exposes the expected tools |

## Supported models

AIOS treats a vendor's model surface as part of the integration contract, so routing and prompts can name it directly.

| Vendor | Model | Model ID | Credential | Docs MCP |
| --- | --- | --- | --- | --- |
| TypeSafe (System One) | Jev | `jev-latest` | `TYPESAFE_API_KEY` | `https://docs.typesafe.ai/mcp` |

**TypeSafe System One** provides small units of AI intelligence you use like programming primitives: `Choice`, `Score`, and `Noul`. **Jev** turns natural language plus application state into typed judgments and probabilities that ordinary code can combine, so a "prompt and parse" step becomes a structured decision.

## Install the TypeSafe integration

```bash
# 1. Preview every change for all nine clients — writes nothing
aios integration add typesafe --dry-run

# 2. Install the skill and register the docs MCP server
aios integration add typesafe

# 3. Verify the result with real evidence, not a success message
aios integration doctor typesafe
```

A dry run prints each client's registration step and marks the ones a human must finish:

```text
TypeSafe integration: TypeSafe (System One / Jev) (typesafe) [dry-run]
  skill      planned @65a39f393687 sha256=71ea90d7906c
  claude     planned
             run: claude mcp add --scope user --transport http typesafe-docs https://docs.typesafe.ai/mcp
  codex      planned
             run: codex mcp add typesafe-docs --url https://docs.typesafe.ai/mcp
  gemini     manual step required  ~/.gemini/settings.json  (http-config-shape-unverified)
  probe      verified 2987ms
```

## Client coverage

All nine AIOS clients are covered. Coverage means *an honest, actionable path for every client* — not a claim that every client has an identical CLI.

| Client | Registration path | How AIOS reports it |
| --- | --- | --- |
| Claude Code | `claude mcp add --transport http` | verified |
| Codex | `codex mcp add --url` | verified |
| OpenCode | `opencode mcp add --url` | verified |
| Grok | `grok mcp add -t http` | verified |
| Pi | writes `~/.pi/agent/mcp.json` | verified |
| Gemini CLI | `--transport http` CLI when present, else config file + manual step | verified, else manual step |
| Hermes | `hermes mcp add --url` | needs an interactive terminal |
| WorkBuddy | config file + manual step | manual step required |
| ZCode | config file + manual step | manual step required |

Two behaviours are deliberate:

- **Hermes** prompts interactively for the auth method and offers no non-interactive flag. AIOS does not guess an answer or hang a script; it prints the exact command and marks the client `pending-interactive`.
- **WorkBuddy and ZCode** have known configuration file locations but no AIOS-verified HTTP transport key name. AIOS shows the file and a JSON skeleton with the unknown key left as `<transport-key>` instead of inventing a field name.

An uninstalled client is reported as `client-missing` with the binary name, never as a silent success.

## Commands

| Command | Purpose |
| --- | --- |
| `aios integration list` | List known vendors and what each one installs |
| `aios integration add <vendor> [--dry-run] [--clients a,b] [--skip-skills] [--skip-mcp]` | Install the skill and register the MCP server |
| `aios integration doctor <vendor> [--json]` | Verify skill hash, client registrations, credentials presence, and live MCP handshake |
| `aios integration remove <vendor> [--dry-run]` | Unregister and remove only what AIOS owns |

Useful flags:

- `--dry-run` prints the full plan and writes nothing.
- `--clients claude,codex` limits the run to specific clients; the default is all nine.
- `--skip-skills` or `--skip-mcp` isolates one plane when you only need half the integration.
- `--json` on `doctor` emits machine-readable evidence for CI.

## What the skill plane installs

The skill lands in the AIOS catalog (`skill-sources/`) and is then fanned out to every client by the existing skill distributor, which is the same path AIOS uses for its own skills — so third-party and built-in skills cannot drift apart.

AIOS adds internal frontmatter keys to the catalog copy so it knows which clients to target, and strips them before writing any client tree. Your client only ever sees the vendor's own `name`, `description`, and `license` fields.

A catalog directory AIOS does not own is never overwritten. If `skill-sources/typesafe-ai` already contains your own edits, the install refuses with `unmanaged-existing-catalog-directory` and tells you where to look.

## Safety properties

- **Credentials are checked for presence only.** The doctor reports whether `TYPESAFE_API_KEY` is set; it never reads, prints, or stores the value.
- **Ownership is tracked.** `~/.aios/integrations/<vendor>.json` records a fingerprint of every entry AIOS wrote, so a later run can tell `owned` from `external` from `conflict` and refuses to clobber entries you added yourself.
- **Removal is scoped.** `aios integration remove` unregisters only entries AIOS registered; foreign MCP servers in the same file are preserved.
- **Backups are written before edits.** Config files are backed up to `.bak-<timestamp>` before any rewrite.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `manual step required` | The client's HTTP config shape is unverified | Open the printed file and confirm the transport key name against the client's docs |
| `needs a terminal` | The client's `mcp add` prompts interactively | Run the printed command yourself in a real terminal |
| `client not installed` | The client binary is not on `PATH` | Install the client, then re-run |
| `probe unreachable` | The docs MCP endpoint did not complete a handshake | Check network or proxy settings, then re-run `doctor` |
| `unmanaged-existing-catalog-directory` | `skill-sources/<name>` is not owned by AIOS | Move your edits aside, then re-run the install |

## Next steps

- [Model Router](model-router.md) — declare a `task-type` and route work to a specific model surface.
- [ContextDB](contextdb.md) — the project memory the integration's skill reads from.
- [Workflow Policy](workflow-policy.md) — how AIOS decides between direct, guarded, and planned work.
