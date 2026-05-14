---
name: search-first
description: Research-before-building workflow. Use when adding new behavior, dependencies, or integrations to avoid reinventing and to stay compatible across codex/claude/gemini/opencode.
---

# Search First

## Trigger
Use this skill before you:
- Add a new feature or workflow step
- Introduce a new dependency, MCP server, or CLI integration
- Write a new utility/helper that might already exist
- Copy patterns from another repo (porting)

## Outcome
Pick one of: **Adopt**, **Extend**, **Compose**, **Build**, with a short justification and evidence.

## Workflow (Fast)
1. **Define the need**
   - What is the smallest outcome that solves the problem?
   - Constraints: platform (macOS/Linux/Windows), clients (codex/claude/gemini/opencode), offline needs, security posture.

2. **Search locally (before the internet)**
   - Code: `rg -n "<keyword>"` in the repo.
   - Scripts: check `scripts/` for existing lifecycle/doctor commands.
   - Docs: check `README*` and `docs/`.

3. **Search existing skills**
   - Repo-local: `.codex/skills`, `.claude/skills`, `.agents/skills`.
   - Global: `~/.codex/skills`, `~/.claude/skills`, `~/.gemini/skills`, `~/.config/opencode/skills`.
   - Prefer reusing an existing skill name over creating a near-duplicate.

4. **Search the ecosystem (when needed)**
   - Prefer official docs and primary sources (project docs, RFCs, standards).
   - Prefer maintained, well-scoped libraries over bespoke code.
   - For agent tooling, check if an MCP server already provides the capability.

5. **Decide**
   - **Adopt**: exact match, maintained, acceptable license.
   - **Extend**: mostly fits; add thin wrapper/adapter.
   - **Compose**: 2-3 small pieces together beat 1 big framework.
   - **Build**: no good option; implement minimal + document why.

6. **Record evidence**
   - Note what you searched, what you found, and why you chose the approach.
   - If a decision affects cross-CLI behavior, add it to a `docs/plans/` artifact.

