# Test-diff review (rex-tdd refactor)

Focused tests still constrain the review-fix user behaviors:

- `collectTurnRecall` must query CCRG and must not emit “Call get_minimal_context”
- `startStoredAiosCapabilityActivation` must reuse an active work-item ledger
- `executePhaseJob` must not call `runOneShot` when prefixes are missing or rex bind fails
- Hook sources and `detectHookClient` must not treat `XAI_API_KEY` as Grok identity; `--client` is required

No assertion was deleted, skipped, or relaxed to match implementation output.
Refactor-check receipt: `receipt:56076f05-a1bd-47fd-8ee0-4619c979b4ad` (exit 0).
