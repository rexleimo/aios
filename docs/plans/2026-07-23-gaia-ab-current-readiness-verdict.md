VERDICT:
FILES_REVIEWED:
  - scripts/gaia-ab-eval.mjs: lines 8-37 (changed: explicit execute gate remains fail-closed)
  - scripts/lib/gaia-ab-eval/client-adapters.mjs: lines 1-115 (changed: pinned pure Codex, Claude, and Hermes invocation contracts)
  - scripts/tests/gaia-ab-eval.test.mjs: lines 43-52 (changed: public execute gate)
  - scripts/tests/gaia-ab-client-adapters.test.mjs: lines 1-94 (changed: three client privacy and argv contracts)
CHECKS:
  - rtk npm run pretest:scripts: PASS (GAIA 21, workflow policy 63, rex-harness 109, rex integration 31)
  - rtk node --test scripts/tests/gaia-ab-client-adapters.test.mjs: PASS (receipt:81b9eedd-25e7-4012-be10-96b4f5bc888f)
  - rtk node scripts/aios.mjs doctor: FAIL for live readiness (browser-use checkout and default CDP endpoint missing)
  - rtk codex --version: PASS (codex-cli 0.145.0 after local global-package repair)
CODE:
  > if (parsed.flags.execute) {
  >   throw new Error('GAIA A/B --execute remains fail-closed until production client adapters are configured');
  > }
VALIDATION:
  REJECTED - local safety and command-contract behavior is verified, but no real A/B evaluation may start yet. next_actions: provide the intended mcp-browser-use checkout or authorize its exact source; configure a common CDP endpoint; provide a SHA-256-pinned GAIA task manifest plus maxTasks, maxSpendUsd, and timeoutSeconds; implement and review the process-launch/response-redaction layer; resolve or explicitly accept the Hermes argv prompt-visibility risk before any paid Hermes call.
