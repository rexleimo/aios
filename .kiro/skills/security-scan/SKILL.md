---
name: security-scan
description: Lightweight security hygiene for agent configs (skills/hooks/MCP/settings). Use before enabling automation, after config changes, and before release.
---

# Security Scan

## Trigger
Use this skill when:
- Onboarding a new repo with agent automation enabled
- Editing skills, hooks, MCP config, or client settings
- Before publishing/releasing changes that affect other projects

## Mandatory Privacy Rule (No Bypass)
- For config-like files that may contain keys/tokens/passwords, **do not read raw file content directly**.
- Always read through Privacy Guard first:
  - `aios privacy read --file <path>` (preferred)
  - or `node scripts/privacy-guard.mjs read --file <path>`
- If Privacy Guard reports guard-disabled for sensitive files, enable it first:
  - `aios privacy enable`

## Quick Path
- Ensure strict mode is on: `aios privacy enforce-on`
- Run the repo verifier: `aios doctor` (preferred when shell integration is installed).
- Or run: `scripts/doctor-security-config.sh` / `scripts/doctor-security-config.ps1`.

## What To Check (Minimum)
1. **Secrets**
   - No API keys/tokens/cookies committed to git.
   - Prefer env vars + local-only config files ignored by git.
   - Use Privacy Guard read output when inspection is required.
   - If scanning finds secrets, rotate them, then remove from history if needed.

2. **Tool/permission scope**
   - Avoid wildcard allowlists (when the client supports allow/deny config).
   - Prefer least-privilege tool access and explicit denies for destructive actions.

3. **Hooks safety**
   - Avoid `curl | bash`, silent error suppression, and untrusted string interpolation.
   - Treat any network egress from hooks as high risk; make it opt-in.

4. **MCP / supply chain**
   - Prefer pinned versions and explicit installs over ad-hoc `npx` execution.
   - Review MCP servers for network + filesystem access and log behavior.

## Output Discipline
- Never paste secret values into chat logs or commits.
- Capture only redacted findings + exact file paths and remediation steps.
