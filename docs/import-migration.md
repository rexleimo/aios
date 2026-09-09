# Migration import — bring external assistant memory into AIOS

`aios import` converts memory/rules files from other assistant tools into
AIOS memo **candidates**. Nothing is promoted automatically: every imported
fact goes through the same governed review path as any other candidate, so
history stays auditable.

## Supported formats

| `--format` | Source file | How it splits |
|---|---|---|
| `claude` | Claude Code `MEMORY.md` | bullets / numbered lines (headings are structure) |
| `continue` | Continue rules markdown | same markdown splitting |
| `roo` | `.roomodes` (JSON) | one fact per mode from `roleDefinition`/`customInstructions` |
| `conventions` | `CONVENTIONS.md` | same markdown splitting |

## Usage

```bash
# preview what would be imported (no writes)
node scripts/aios.mjs import --format claude --file ~/MEMORY.md --dry-run

# import; facts land as candidates tagged #import-claude in the default space
node scripts/aios.mjs import --format claude --file ~/MEMORY.md --json
```

## Review and promote

```bash
node scripts/aios.mjs memo candidate list
node scripts/aios.mjs memo candidate inspect <id>
node scripts/aios.mjs memo candidate promote <id> --reason "verified in repo"
```

Notes:

- Imports are **idempotent** — re-running skips facts whose normalized text
  already exists in the corpus.
- Imported facts carry `claimStatus=candidate` by protocol: importers have no
  trusted provenance, so a `verified` claim cannot be forged through import.
- Each fact is tagged `#import-<format>` so its origin is always queryable
  (`memo search "#import-roo"`).
