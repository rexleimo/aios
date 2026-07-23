# Evidence Rejection Reasons Minimal Construction

## Reuse Ladder

1. The rejection causes are observable API data, so they cannot be removed or
   represented only by exception text.
2. `withTerminalDecision()` already owns immutable ledger terminal decisions;
   reuse it rather than adding a second error envelope.
3. JavaScript has no useful standard closed-vocabulary facility beyond local
   constants/validated literals for this domain contract.
4. No dependency is justified for a handful of deterministic domain values.
5. The smallest readable option is an explicit local closed reason map plus
   calls to the existing terminal-decision helper at each evidence branch.
6. A new shared error module is unnecessary until a second independent domain
   consumes the same vocabulary.

## Selected Option

Keep reason ownership in `src/domain/long-running-delivery.mjs`, extend the
existing terminal-decision return shape, and verify each public branch through
the current delivery tests. This preserves ledger semantics and does not pull
CLI, workflow runtime, or AIOS into the implementation.
