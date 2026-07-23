# Native Guidance Token Contract Update Scope

## User Goal

Keep ordinary native-client guidance compact and pull-based. Token-discipline
details are available through their on-demand route, not injected into daily
shared AGENTS guidance.

## Explicit Non-Goals

- Do not modify the native markdown composer or reintroduce always-loaded
  token-discipline content.
- Do not change token profiles, runtime interception, Rex, browser MCP, or
  any unmanaged client instructions.

## Acceptance Mapping

| Behavior | Public assertion | Seam |
| --- | --- | --- |
| Shared native guidance stays compact | Generated AGENTS managed block contains the shared core and does not contain `AIOS Token Discipline`. | `scripts/tests/token-discipline.test.mjs`. |
| The no-daily-injection boundary is intentional | Existing native guidance projection assertions continue to reject a token-discipline heading in ordinary guidance. | `scripts/tests/native-agent-guidance.test.mjs`. |
| Token discipline remains pull-based | The token-discipline source partial remains available to the on-demand skill route; this test must not claim daily injection. | Existing `client-sources` partial fixture. |

## Completion

The focused token-discipline test passes with the corrected public contract,
the native-guidance projection test remains green, and no production source
file changes.
