# Native Guidance Token Contract Standards and Specification Review

## Scope Reviewed

Reviewed the public test-contract change in
`scripts/tests/token-discipline.test.mjs` against the compact, pull-based
native-guidance requirement and the existing multi-client projection contract
in `scripts/tests/native-agent-guidance.test.mjs`.

## Standards Review

Findings: none.

- The test name now describes the intended public behavior rather than the
  obsolete daily-injection behavior.
- Assertions retain positive evidence that native sync wrote the marked
  managed block and its shared core content.
- The focused test uses the existing isolated temporary-root fixture and does
  not add a production path, configuration surface, or unnecessary abstraction.
- `git diff --check` completed without whitespace errors.

## Specification Review

Findings: none.

- `composeNativeMarkdown()` loads only `core-instructions.md` for the shared
  AGENTS projection, so rejecting `AIOS Token Discipline` from ordinary
  guidance matches the implemented contract.
- The `token-discipline.md` partial remains available for its on-demand route;
  the updated test neither removes it nor represents it as daily context.
- The changed test checks both the token-discipline heading and strategic
  compact detail are absent, while the existing native-guidance suite enforces
  that boundary across all supported projections.

## Verification Evidence

- `node --test scripts/tests/token-discipline.test.mjs`: 6 passed, 0 failed
  (`receipt:06bd142d-a5ef-4e54-976b-e7d109ced1e2`).
- `node --test scripts/tests/native-agent-guidance.test.mjs`: passed
  (`receipt:292c18d4-ef76-4d9b-a841-737ab79ca668`).
- `npm run test:scripts`: exit 0; 829 passed, 0 failed, 8 skipped.

Verdict: the test-contract correction conforms to repository standards and the
approved compact, on-demand native-guidance specification. No remediation is
required.
