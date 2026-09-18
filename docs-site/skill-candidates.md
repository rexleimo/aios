---
title: Skill Candidates Guide
description: "Skill Candidates explain how AIOS turns failed sessions into reviewable skill patches: how one is detected, reviewed, and applied safely."
---

# Skill Candidates Guide

**Skill Candidates** are automated improvement suggestions extracted from failed agent sessions. They help you continuously improve your AI assistant's capabilities by learning from mistakes.

## What Are Skill Candidates?

When an agent session fails a quality-gate check, AIOS automatically:
1. Analyzes the failure pattern
2. Identifies the root cause (e.g., missing error handling, edge case)
3. Generates a skill patch draft
4. Presents it as a **skill candidate** for your review

### Example Flow

```
Session fails → Learn-eval analyzes → Skill candidate generated → You review → Apply patch → Skill improved
```

## Skill Candidate Structure

Each skill candidate contains:

| Field | Description |
|-------|-------------|
| `skillId` | Target skill to patch |
| `scope` | Functional area (e.g., "authentication", "file-ops") |
| `failureClass` | Type of failure encountered |
| `lessonKind` | Type of improvement (e.g., "error-handling", "edge-case") |
| `lessonCount` | Number of lessons learned |
| `patchHint` | Suggested code/text changes |
| `sourceDraftTargetId` | Originating draft ID |
| `reviewStatus` | Pending/Approved/Rejected |

## Viewing Skill Candidates

### From HUD

```bash
# Show candidates inline with session status
aios hud --show-skill-candidates

# Detail view (candidates only, no HUD)
aios hud --show-skill-candidates --skill-candidate-view detail

# Limit results
aios hud --show-skill-candidates --skill-candidate-limit 5
```

### From Team Status

```bash
# Show all recent candidates
aios team status --show-skill-candidates

# Filter by session
aios team status --session <session-id> --show-skill-candidates

# Export to artifact file
aios team status --export-skill-candidate-patch-template
```

### List Command

```bash
# List candidates for current session
aios team skill-candidates list

# List for specific session
aios team skill-candidates list --session-id <session-id>

# JSON output
aios team skill-candidates list --json
```

### Filter by Draft ID

```bash
# Show only candidates from specific draft
aios team skill-candidates list --draft-id <draft-id>

# Export filtered candidates
aios team skill-candidates export --draft-id <draft-id>
```

## Exporting Patches

### Export to Artifact File

```bash
# Default location (session artifacts folder)
aios team skill-candidates export

# Custom output path
aios team skill-candidates export --output-path ./patches/my-fix.md

# With draft filter
aios team skill-candidates export --draft-id <draft-id> --output-path ./draft-patch.md
```

### Export Format

Exported patch templates include:
- Candidate metadata (skill ID, scope, failure class)
- Lesson descriptions
- Suggested patch content
- Application instructions

## Applying Skill Patches

### Review Process

**Before applying any patch:**
1. Read the failure class - understand what went wrong
2. Review the lesson - what was learned
3. Examine the patch hint - suggested changes
4. Verify the patch applies to your skill version

### Apply Command

```bash
# Apply a specific candidate
aios skill-candidate apply <candidate-id>

# Apply with review mode
aios skill-candidate apply <candidate-id> --review

# Dry-run (preview changes)
aios skill-candidate apply <candidate-id> --dry-run
```

### Batch Apply

```bash
# Apply all pending candidates for a skill
aios skill-candidate apply-all --skill <skill-id>

# Apply with approval
aios skill-candidate apply-all --skill <skill-id> --approve
```

## Skill Candidate Workflow

### Step 1: Discover Candidates

```bash
# After a failed session, check for candidates
aios hud --session <failed-session-id> --show-skill-candidates
```

### Step 2: Review Candidates

```bash
# Detail view for careful review
aios hud --session <session-id> --show-skill-candidates --skill-candidate-view detail

# Export for offline review
aios team skill-candidates export --session-id <session-id>
```

### Step 3: Test Patch Locally

```bash
# Create a test branch (if using git)
git checkout -b skill-patch-<skill-id>

# Apply patch manually or use apply command
aios skill-candidate apply <candidate-id>

# Run tests to verify
npm test
```

### Step 4: Approve or Reject

```bash
# If patch works - approve it
aios skill-candidate review <candidate-id> --approve

# If patch has issues - reject with feedback
aios skill-candidate review <candidate-id> --reject --comment "Doesn't handle edge case X"
```

## Best Practices

### Prioritization

**Apply candidates in this order:**
1. High-frequency failures (same failure class appears multiple times)
2. Critical path skills (authentication, security, data integrity)
3. Easy wins (single-line fixes, clear improvements)

### Review Guidelines

- **Never auto-apply without review** - each patch needs human validation
- **Test in isolation** - verify patch doesn't break existing functionality
- **Check for conflicts** - multiple patches may modify same code
- **Document decisions** - record why you approved/rejected

### Avoiding Overfitting

- Don't apply patches for one-off edge cases
- Look for patterns across multiple sessions
- Prefer general solutions over specific workarounds

## Integration with Learn-Eval

Learn-eval is the system that generates skill candidates:

```bash
# Run learn-eval to analyze recent sessions
aios learn-eval --limit 10

# Shows draft recommendations including skill candidates
```

### Learn-Eval Output

```
Dispatch Hindsight Analysis:
- Pairs analyzed: 15
- Repeated blocked turns: 3
- Regressions: 1
- Top failure class: token-validation-edge-case

Draft Recommendations:
[fix] skill-candidate-001
    Skill: authentication-handler
    Scope: token-validation
    Failure: edge-case-expired-token
    Lessons: 2
    Patch: Add retry logic for expired tokens...
```

## Quality-Gate Connection

Skill candidates are generated when quality-gates fail:

### Quality-Gate Outcomes

| Outcome | Description |
|---------|-------------|
| `ok` | Session passed - no candidate generated |
| `failed` | Session failed - candidate likely generated |
| `retry-needed` | Retry required - may generate candidate |

### Failure Categories

Common quality-gate failure categories that trigger candidates:
- `clarity-needs-input` - Agent needs more user input
- `sample.latency-watch` - Performance issues
- `dispatch.blocked` - Job execution blocked
- `evidence.missing` - Missing verification evidence

## Troubleshooting

### No Candidates After Failed Session

Possible reasons:
- Learn-eval hasn't run yet
- Failure wasn't classified as skill-improvement opportunity
- Session didn't pass quality-gate check threshold

```bash
# Manually trigger learn-eval
aios learn-eval --session <session-id>

# Check quality-gate status
aios hud --json | jq '.selection.qualityGate'
```

### Candidate Patch Doesn't Apply

Reasons:
- Target skill has changed since candidate was generated
- Patch format incompatible with current skill structure
- Conflicting modifications

```bash
# Check candidate source version
aios team skill-candidates list --json | jq '.[0].sourceArtifactPath'

# Compare with current skill
diff <(cat <source-artifact>) <(cat <current-skill-file>)
```

### Multiple Conflicting Candidates

When multiple candidates modify same skill:
1. Review all candidates first
2. Apply in order of priority (frequency, severity)
3. Test after each application
4. Reject conflicting duplicates

```bash
# List all candidates for a skill
aios team skill-candidates list --json | \
  jq '[.[] | select(.skillId == "target-skill-id")]'
```

## Advanced Usage

### Programmatic Access

```bash
# Get candidates as JSON
aios team skill-candidates list --json > candidates.json

# Filter by failure class
cat candidates.json | \
  jq '[.[] | select(.failureClass == "token-validation-edge-case")]'

# Count by skill
cat candidates.json | \
  jq 'group_by(.skillId) | map({skill: .[0].skillId, count: length})'
```

### Custom Analysis

```bash
# Analyze failure patterns over time
aios team history --quality-failed-only --json | \
  jq '[.[] | .skillCandidate] | group_by(.skillId)'

# Find most common failure classes
aios team history --json | \
  jq '[.[] | .skillCandidate.failureClass] | unique'
```

## Related Documentation

- [Team Ops](team-ops.md) - Overview of Team Operations
- [HUD Guide](hud-guide.md) - Monitoring sessions with HUD
- [ContextDB](contextdb.md) - Session storage and artifacts
