# Six-client invocation compatibility matrix

> Scope: P5 / L8. This matrix covers the six Rex projection clients and the shared workflow/adapter protocol. It is an invocation compatibility report, not a claim that external client binaries are installed in this workspace.

## Matrix

| Client | Projection root | Workflow entry | Evidence entry | Resume/state | Current verification |
|---|---|---|---|---|---|
| codex | `.codex/skills` | standalone `rex-harness start/resume` | CLI `plan capability-evidence`; AIOS envelope | `.aios/workflow-activations` + compact Command | supported client list + parent adapter test |
| claude | `.claude/skills` | standalone `rex-harness start/resume` | CLI `plan capability-evidence`; AIOS envelope | same Rex activation store | supported client list + parent adapter test |
| gemini | `.gemini/skills` | standalone `rex-harness start/resume` | CLI `plan capability-evidence`; AIOS envelope | same Rex activation store | supported client list + parent adapter test |
| opencode | `.opencode/skills` | standalone `rex-harness start/resume` | CLI `plan capability-evidence`; AIOS envelope | same Rex activation store | supported client list + parent adapter test |
| hermes | `.hermes/skills` | standalone `rex-harness start/resume` | CLI `plan capability-evidence`; AIOS envelope | same Rex activation store | supported client list + parent adapter test |
| grok | `.grok/skills` | standalone `rex-harness start/resume` | CLI `plan capability-evidence`; AIOS envelope | same Rex activation store | supported client list + parent adapter test |

## Shared contract

All six clients use the same:

- `rex-workflow` packaged Skill;
- explicit-intent normalization and policy;
- `rex.cli.workflow-command.v1` compact Command;
- one current command token at a time;
- `AIOS_REX_EVIDENCE=<single JSON envelope>` for non-Agent providers;
- typed `wayfinderArtifact` / `planningArtifact` when the current capability requires them;
- `.aios/workflow-activations` as the persisted activation source, protected by a write-ahead state transaction and store lock;
- fail-closed behavior for stale token, split projection/workflow state, invalid envelope, wrong artifact kind, damaged state, and workspace-external artifact files.

## Fresh checks

```text
node --test scripts/tests/rex-artifact-cli.test.mjs scripts/tests/rex-client-compatibility.test.mjs
```

The focused compatibility suite passed 4/4 (two artifact CLI checks and two six-client adapter checks). The same files are included in `test:rex-integration` so the matrix is part of the canonical Rex gate.

External client installation/projection remains governed by `supportedClients()` and the managed projection marker; this report does not perform an external install or modify `agent-sources/skills/`.
