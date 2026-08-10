# AIOS Path Resolution Architecture

## Overview

AIOS uses two distinct path concepts that must not be confused:

1. **AIOS_ROOT** - Framework installation directory
2. **Project Root** - Current working project directory

## Path Types

### 1. AIOS_ROOT (Framework Paths)

**Purpose**: Location of AIOS framework code, scripts, and core infrastructure.

**Environment Variables**:
- `AIOS_ROOT_DIR` - Primary variable
- `AIOS_ROOT` - Alias for compatibility
- `ROOTPATH` - Legacy alias

**Default Resolution**:
```javascript
// scripts/lib/memo/cli/constants.mjs
export const DEFAULT_AIOS_ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', '..', '..', '..'
);
```

**Contains**:
- `scripts/` - Framework scripts (aios.mjs, ctx-agent.mjs, etc.)
- `package.json` - Framework dependencies
- Core AIOS runtime code

**Example**:
- `/Users/rex/.rexcil/aios`
- `~/.aios-framework`
- `/opt/aios`

### 2. Project Root (Working Directory Paths)

**Purpose**: Location of user's project with AIOS-managed state.

**Resolution**: Always uses current working directory (`process.cwd()` or `pwd`)

**Contains**:
- `.aios/` - Project-specific AIOS state
  - `.aios/context-db/` - Context database
  - `.aios/planning/` - Planning artifacts
  - `.aios/workspace/` - Workspace metadata
  - `.aios/tasks/` - Task queue
- `.codex/skills/` - Codex repo-local skills
- `.claude/skills/` - Claude repo-local skills
- `.gemini/skills/` - Gemini repo-local skills
- `.opencode/skills/` - OpenCode repo-local skills
- `.hermes/skills/` - Hermes repo-local skills
- `.grok/skills/` - Grok repo-local skills
- `docs/plans/` - Planning documents
- `CLAUDE.md`, `AGENTS.md`, `GEMINI.md` - Client instruction files

**Example**:
- `/Users/rex/my-project`
- `/home/user/work/awesome-app`
- `C:\Projects\my-app`

## Client Configuration

All client definitions use **relative paths from Project Root**:

```javascript
// scripts/lib/clients/core/definitions.mjs
export const CLIENT_DEFINITIONS = {
  codex: {
    projectSkillRoot: '.codex/skills',      // Relative to Project Root
    agentTargetRoot: '.codex/agents',
    nativeMetadataRoot: '.codex',
    instructionFileName: 'AGENTS.md',
  },
  claude: {
    projectSkillRoot: '.claude/skills',     // Relative to Project Root
    agentTargetRoot: '.claude/agents',
    nativeMetadataRoot: '.claude',
    instructionFileName: 'CLAUDE.md',
  },
  // ... other clients
};
```

## Path Resolution Examples

### Scenario 1: Framework and Project in Same Directory

```bash
AIOS_ROOT=/Users/rex/codes/aios
pwd
# /Users/rex/codes/aios

# Paths resolve to:
$AIOS_ROOT/scripts/aios.mjs               # Framework script
$(pwd)/.aios/context-db/                  # Project state
$(pwd)/.claude/skills/                    # Project skills
```

### Scenario 2: Framework Installed Globally

```bash
AIOS_ROOT=/Users/rex/.rexcil/aios
pwd
# /Users/rex/my-project

# Paths resolve to:
$AIOS_ROOT/scripts/aios.mjs               # Framework script
$(pwd)/.aios/context-db/                  # /Users/rex/my-project/.aios/context-db/
$(pwd)/.claude/skills/                    # /Users/rex/my-project/.claude/skills/
```

### Scenario 3: Multiple Projects, One Framework

```bash
AIOS_ROOT=/opt/aios

# Project A
cd ~/projectA
# Skills: ~/projectA/.codex/skills/
# State: ~/projectA/.aios/context-db/

# Project B
cd ~/projectB
# Skills: ~/projectB/.codex/skills/
# State: ~/projectB/.aios/context-db/
```

## Code Implementation

### Getting Project Root

```javascript
// Most AIOS commands accept --workspace or use cwd
const projectRoot = process.cwd();
const skillsDir = path.join(projectRoot, '.claude/skills');
```

### Getting AIOS Root

```javascript
import { DEFAULT_AIOS_ROOT_DIR } from './constants.mjs';

const aiosRoot = process.env.AIOS_ROOT_DIR || DEFAULT_AIOS_ROOT_DIR;
const scriptPath = path.join(aiosRoot, 'scripts/aios.mjs');
```

### Hook Execution

```javascript
// scripts/lib/planning/hook-user-prompt.mjs
const defaultRoot = process.env.CLAUDE_PROJECT_DIR  // Claude's project dir
  || process.env.AIOS_ROOT                          // Fall back to AIOS root
  || path.resolve(__dirname, '../../..');           // Or relative to script
```

## Common Mistakes

### ❌ Wrong: Using AIOS_ROOT for Project Paths

```javascript
// DON'T DO THIS
const skillsDir = path.join(process.env.AIOS_ROOT, '.claude/skills');
```

### ✅ Correct: Using Project Root

```javascript
// DO THIS
const projectRoot = process.cwd();
const skillsDir = path.join(projectRoot, '.claude/skills');
```

### ❌ Wrong: Assuming Framework and Project are Same

```markdown
# CLAUDE.md - Wrong assumption
Read skills from `.claude/skills/` (assumes this repo is AIOS framework)
```

### ✅ Correct: Clear Documentation

```markdown
# CLAUDE.md - Clear documentation
Read skills from `.claude/skills/` (relative to project root, not AIOS_ROOT)
```

## Verification Commands

### Check Your Configuration

```bash
# Where is AIOS framework installed?
echo $AIOS_ROOT
# Example: /Users/rex/.rexcil/aios

# Where is your project?
pwd
# Example: /Users/rex/my-awesome-project

# List project AIOS directories (should exist in pwd)
ls -la .aios/ .claude/skills/ .codex/skills/

# List framework scripts (should exist in AIOS_ROOT)
ls -la $AIOS_ROOT/scripts/
```

### Test Path Resolution

```bash
# Run AIOS command (uses AIOS_ROOT for scripts, pwd for project)
node $AIOS_ROOT/scripts/aios.mjs plan show

# Skills should be read from pwd, not AIOS_ROOT
ls .claude/skills/  # This should exist in your project
ls $AIOS_ROOT/.claude/skills/  # This might not exist (and that's OK)
```

## Migration Notes

If you encounter path issues:

1. **Check AIOS_ROOT is set correctly**:
   ```bash
   echo $AIOS_ROOT
   # Should point to framework installation
   ```

2. **Check you're in the right project directory**:
   ```bash
   pwd
   # Should be your project root
   ls .aios/  # Should exist
   ```

3. **If paths don't match**:
   - Don't try to set AIOS_ROOT to your project directory
   - Instead, ensure `.aios/`, `.claude/skills/` exist in your project
   - Framework stays in AIOS_ROOT, project state stays in pwd

## References

- Client definitions: `scripts/lib/clients/core/definitions.mjs`
- Path constants: `scripts/lib/memo/cli/constants.mjs`
- Shell bridge: `scripts/lib/contextdb/shell-bridge/constants.mjs`
- Planning hooks: `scripts/lib/planning/hook-user-prompt.mjs`
