## AIOS Client Capability Gates

Before using a client for live delegation, training, quality-gate execution, or harness work, check the verified rollout state:

```bash
node scripts/aios.mjs clients doctor --json
```

Interpretation:
- `supported-candidate`: Static projection and live AIOS orchestration are allowed, subject to normal task safety gates.
- `compatibility`: Keep context/skills/native sync working, but avoid new live-only assumptions unless the command output explicitly allows them.
- `pending-smoke`: Treat the client as static-projection-only. Do not launch it for live one-shot work, skill training, quality-gate runner duties, or harness live execution until CLI args, MCP config, and unattended smoke evidence are verified.

Current strict policy: Antigravity and Crush may receive generated instructions/skills, but live execution remains blocked while they are `pending-smoke`. If a task needs those clients, report the blocker and continue with a verified client instead of silently falling back.
