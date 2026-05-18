# Test Overview

This repository has two main automated test layers:

- Root AIOS workflow tests under `scripts/tests/`
- MCP server tests under `mcp-server/tests/`

## Command Matrix

Run from repo root:

```bash
npm run test:scripts
```

Run from `mcp-server/`:

```bash
npm run typecheck
npm run test
npm run build
```

ContextDB-focused checks:

```bash
npm run test:contextdb
npm run bench:contextdb:refs:ci
npm run bench:contextdb:refs:gate
```

Orchestrate/Learn-eval perf smoke (repo root):

```bash
npm run perf:orchestrate-learn-eval:smoke
```

Team status watch perf smoke (repo root):

```bash
npm run perf:team-status-watch:smoke
```

## CI Mapping

- `.github/workflows/ci-main.yml`
  - `npm run test:scripts`
  - `mcp-server` typecheck/test/build on Linux/macOS/Windows
  - orchestrate/learn-eval performance smoke gate
  - team status watch performance smoke gate
- `.github/workflows/contextdb-quality.yml`
  - ContextDB focused tests + refs benchmark gate

## Troubleshooting

- If ContextDB fails after switching Node, run `nvm use 24` and then `cd mcp-server && npm run test:contextdb`.
- If `tsx` cannot be resolved in `mcp-server`: run `cd mcp-server && npm ci`.
- If orchestrate/learn-eval perf smoke fails intermittently in CI, review `test-results/perf-orchestrate-learn-eval-smoke.json` and adjust thresholds via:
  - `AIOS_PERF_ORCHESTRATE_MAX_MS`
  - `AIOS_PERF_LEARN_EVAL_MAX_MS`
- Team status watch perf smoke thresholds can be tuned with:
  - `AIOS_PERF_TEAM_STATUS_WATCH_FRAMES`
  - `AIOS_PERF_TEAM_STATUS_WATCH_AVG_MS`
  - `AIOS_PERF_TEAM_STATUS_WATCH_P95_MS`
  - CI artifact: `test-results/perf-team-status-watch-smoke.json`
