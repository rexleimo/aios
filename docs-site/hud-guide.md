---
title: HUD User Guide
description: Complete guide to using HUD (Heads-Up Display) for monitoring agent sessions.
---

# HUD User Guide

HUD (Heads-Up Display) provides real-time visibility into agent session status, dispatch outcomes, and improvement opportunities.

## When to Use HUD

- **Long-running tasks**: Monitor progress without interrupting the agent
- **Debugging failures**: See quality-gate outcomes and hindsight analysis
- **Skill improvement**: Discover and apply skill candidate patches
- **Team coordination**: Track multiple concurrent sessions

## HUD Modes

### Minimal Mode

Best for watch mode in long-running sessions:
- Shows only essential status
- Fast refresh (1s data polling)
- Adaptive interval to reduce resource usage

```bash
aios hud --watch --preset minimal --fast
```

### Compact Mode

Terminal-friendly summary:
- Session goal
- Dispatch summary
- Quality-gate status

```bash
aios hud --preset compact
```

### Focused Mode (Default)

Balanced detail for most use cases:
- All compact info
- Recent dispatch artifacts
- Skill candidate hints

```bash
aios hud --preset focused
```

### Full Mode

Complete diagnostics:
- All focused info
- Full hindsight analysis
- Quality-gate details
- Fix hints and recommendations

```bash
aios hud --preset full
```

## Basic Usage

### View Current Session

```bash
# Default focused view
aios hud

# Specify provider
aios hud --provider claude
aios hud --provider gemini
```

### Watch Mode

```bash
# Continuous monitoring (1s refresh)
aios hud --watch

# Custom interval (milliseconds)
aios hud --watch --interval-ms 2000

# Fast mode with adaptive interval
aios hud --watch --fast
```

### Specify Session

```bash
# By session ID
aios hud --session <session-id>

# From recent history
aios hud --session $(aios team history --json | jq -r '.[0].sessionId')
```

### JSON Output

```bash
# Machine-readable output
aios hud --json

# Combine with jq for filtering
aios hud --json | jq '.selection.qualityGate'
```

## Skill Candidate Features

### View Skill Candidates

Skill candidates appear automatically when a session has improvement suggestions:

```bash
# Show candidates inline with HUD
aios hud --show-skill-candidates

# Detail view (standalone candidate list)
aios hud --show-skill-candidates --skill-candidate-view detail

# Limit number of candidates (1-20)
aios hud --show-skill-candidates --skill-candidate-limit 10
```

### Skill Candidate View Modes

**Inline (default)**: Candidates shown below HUD

```
═══════════════════════════════════════
HUD Status
═══════════════════════════════════════
Session: abc123
Goal: Implement user authentication
Status: running | dispatch=ok | quality=ok
...

───────────────────────────────────────
Skill Candidates (3)
───────────────────────────────────────
[1] skill-candidate-001
    Scope: authentication
    Failure: token-validation-edge-case
    Lessons: 2
    Patch: Add retry logic for expired tokens

[2] skill-candidate-002
    ...
```

**Detail**: Only candidates shown (HUD hidden)

```bash
aios hud --show-skill-candidates --skill-candidate-view detail
```

### Export Patch Templates

Export skill candidates as patch template artifacts:

```bash
# Export to default location
aios hud --export-skill-candidate-patch-template

# Export with specific draft ID filter
aios hud --export-skill-candidate-patch-template --draft-id <draft-id>

# Export with custom candidate limit
aios hud --export-skill-candidate-patch-template --skill-candidate-limit 5
```

**Output location**: `.aios/context-db/sessions/<session-id>/artifacts/skill-candidate-patch-template-<timestamp>.md`

### Filter by Draft ID

```bash
# Show only candidates from specific draft
aios hud --show-skill-candidates --draft-id <draft-id>

# Export filtered candidates
aios hud --export-skill-candidate-patch-template --draft-id <draft-id>
```

## Quality-Gate Integration

### View Quality-Gate Status

HUD shows quality-gate outcomes automatically:

```bash
# Full view includes quality details
aios hud --preset full

# JSON output for programmatic access
aios hud --json | jq '.selection.qualityGate'
```

### Filter by Quality Category

```bash
# Not directly supported in HUD - use team history
aios team history --quality-category clarity --limit 5
```

## Performance Tuning

### Fast Watch Mode

Optimized for long-running watch sessions:

```bash
# Minimal preset + fast mode = lowest overhead
aios hud --watch --preset minimal --fast

# Data refresh: 1s (minimum)
# Render interval: adaptive (1s-10s based on activity)
```

### Custom Refresh Intervals

```bash
# Slower refresh for background monitoring
aios hud --watch --interval-ms 5000

# Adaptive interval (auto-adjusts based on session activity)
aios hud --watch --adaptive-interval
```

### Concurrency Controls

HUD reads session data sequentially by default. For multiple sessions:

```bash
# Not applicable to single-session HUD
# Use team status for multi-session views
```

## Watch Mode Best Practices

### Terminal Management

```bash
# Run in tmux pane for persistent monitoring
tmux new-session -a -s aios-hud 'aios hud --watch'

# Split terminal: agent on top, HUD on bottom
tmux split-window -v
# Top pane: run agent
# Bottom pane: aios hud --watch --preset minimal
```

### Notification Integration

```bash
# Alert on quality-gate failure (example with terminal-notifier)
aios hud --watch --json | while read line; do
  echo "$line" | jq -r '.selection.qualityGate.outcome' | grep -q failed && \
    osascript -e 'display notification "Quality gate failed!" with title "AIOS HUD"'
done
```

### Log Correlation

```bash
# Correlate HUD timestamps with agent logs
aios hud --watch | ts '[%Y-%m-%d %H:%M:%S] HUD: '
```

## Troubleshooting

### HUD Shows Stale Data

```bash
# Force refresh by restarting watch
# HUD caches data for performance

# Check data refresh interval
aios hud --watch --interval-ms 500
```

### No Skill Candidates Shown

Possible reasons:
- No session selected (use `--session`)
- Session has no failed quality-gates
- Session passed all quality checks
- Learn-eval hasn't run yet

```bash
# Verify session has quality-gate failures
aios hud --json | jq '.selection.qualityGate'

# Check if learn-eval ran
aios hud --json | jq '.selection.dispatchHindsight'
```

### JSON Output Parsing Issues

```bash
# Validate JSON structure
aios hud --json | jq .

# Access specific fields
aios hud --json | jq '.selection.sessionId'
aios hud --json | jq '.selection.dispatch.jobCount'
aios hud --json | jq '.selection.qualityGate.outcome'
```

## Examples

### Monitor Build Pipeline

```bash
# Start build in background, monitor with HUD
aios orchestrate --live &
aios hud --watch --preset minimal --fast
```

### Debug Failed Session

```bash
# View full details of failed session
aios hud --session <failed-session-id> --preset full

# Export skill candidates for patching
aios hud --session <failed-session-id> --export-skill-candidate-patch-template
```

### Multi-Session Dashboard

```bash
# Watch multiple providers simultaneously
# Terminal 1
aios hud --provider codex --watch --preset minimal

# Terminal 2
aios hud --provider claude --watch --preset minimal

# Terminal 3 (aggregated view)
aios team status --watch --preset minimal
```

## Related Documentation

- [Team Ops](team-ops.md) - Overview of Team Operations
- [Skill Candidates](skill-candidates.md) - Understanding and applying patches
- [ContextDB](contextdb.md) - Session storage and retrieval
