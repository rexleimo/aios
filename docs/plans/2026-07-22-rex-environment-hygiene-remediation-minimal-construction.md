# Environment Hygiene Minimal Construction Decision

## Reuse Ladder

1. **Remove the requirement:** Rejected. Browser automation, structural code
   exploration, and the client-neutral workflow remain required capabilities.

2. **Reuse existing configuration:** Partly applicable. Existing native sync,
   browser install, browser launcher, and route-command repair paths are the
   correct mechanisms once their prerequisites are met. Their dry runs show no
   managed native repair is currently actionable.

3. **Use platform capabilities:** Applicable for the existing local browser
   runtime bootstrap (`uv sync`) after a valid checkout exists. It cannot
   provision an unknown external repository source.

4. **Add a dependency:** Rejected. No new package or service resolves the
   stale token diagnostic, and browser setup already depends on the external
   browser-use checkout by design.

5. **Use a local expression/configuration-only change:** Rejected for the
   token warning. Raising `maxEnabledServers` from 10 to the aggregate count
   would hide a cross-client accounting error; disabling `mcp-browser-use`
   would remove the repository's required primary browser surface.

6. **Minimal new construction:** A bounded repository-code correction plus
   focused tests is required. Reuse the existing token-discipline inspector and
   the configured primary-browser alias to: (a) evaluate the MCP budget per
   client configuration surface rather than summing mutually exclusive client
   files, and (b) exempt the configured `mcp-browser-use` primary server from
   the retired AIOS-proxy heuristic. Preserve explicit configured low-value and
   noisy-server rules.

## Minimal Option Selected

Implement only the diagnostic correction described in item 6 and its focused
regression tests. Do not change the configured server inventory, token-profile
budget, user-home client files, or browser configuration merely to silence a
warning.

The browser runtime remains a prerequisite boundary: use the existing
`internal browser install` only after a valid `ai-browser-book/mcp-browser-use`
checkout is supplied or discovered. Do not guess an upstream URL or create a
placeholder checkout.

The legacy Superpowers projections remain untouched because dry-run ownership
checks classify every one as ownership-ambiguous. A warning alone is not a
safe deletion authority.

## Evidence

- `scripts/lib/token-discipline/index.mjs` currently sums all candidate
  configuration counts and uses `not-routed-through-aios-proxy` for browser
  names without a proxy spec.
- `config/token-discipline.json` sets a budget of 10; the project has separate
  `.mcp.json` and `.gemini/settings.json` surfaces, while the Codex surface is
  independently configured.
- `node scripts/aios.mjs internal browser install --dry-run` fails before
  mutation because its required external checkout is absent.
- `node scripts/aios.mjs internal native doctor --client all --fix --dry-run`
  reports no actionable managed native repair.
- `node scripts/aios.mjs init --adopt-legacy-superpowers --dry-run` reports
  `ownership-ledger-source-is-unavailable` for legacy projections.
