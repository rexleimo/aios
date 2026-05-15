# Anthropic Harness Mapping (Applied to AIOS)

## Source
- https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents

## Mapped Principles
- Treat long-running execution as a systems problem, not a single prompt problem.
- Externalize state so runs can resume and be audited.
- Use bounded loops with explicit checks between steps.
- Prefer deterministic wrappers around nondeterministic model behavior.
- Build observability first (logs/checkpoints) to debug failures quickly.
- Include human gates for sensitive or high-uncertainty transitions.

## Repository-Level Translation
- External state: `tasks/*`, `memory/*`, `docs/plans/*`.
- Deterministic wrappers: browser-use MCP chain (`chrome.launch_cdp` / `browser.connect_cdp` / `page.*`) + selector standards.
- Observability: `page.extract_text` / `page.get_html` evidence + run report documents.
- Human gates: login/captcha/content-policy rewrite approvals.
