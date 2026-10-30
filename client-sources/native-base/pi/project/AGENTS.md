## AIOS Native Pi Layer

- AIOS-managed project skills live in the shared repo-local `.agents/skills` root (Pi scans it natively; AIOS never writes `.pi/skills`, which would make Pi skip the shared copy as an already-loaded duplicate). User-level `~/.pi/agent/skills` stays personal.
- Keep work grounded in the AIOS runtime and verification flow.
- Pi has no built-in MCP surface: AIOS tools reach Pi through the AIOS Pi extension, not config migration.
- Headless runs use `pi -p` / `--mode json`; project-local `.pi` resources load only after trust — harness passes `-a/--approve` per run.
- AIOS-driven `pi -p` worker turns pass `--no-session`: each dispatched turn is stateless and must not rely on session state left by an earlier turn.
- Pi has no subagent tool upstream. Dispatching "a subagent" on Pi means an AIOS-spawned `pi -p` worker, and it must receive a self-contained brief (objective, owned paths, refs); if a fact is missing it returns `blocked` instead of guessing.
- Pi skills follow the Agent Skills standard and load on demand via `/skill:name`; check `pi list` for installed Pi packages.
- Follow the shared workflow policy before selecting a plan, skill, team, or harness route.
- Token compression is handled by community tools RTK + Caveman (installed via `aios init`).
