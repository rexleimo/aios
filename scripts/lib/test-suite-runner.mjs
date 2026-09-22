import manifest from '../test-suites.json' with { type: 'json' };

const SUITES = Object.freeze({
  // The `unit` suite lives in the manifest like every other suite. It used to be defined
  // here with `roots` discovery only, which made scripts/tests/unit/** invisible to the
  // wiring guard: those files could sit outside every suite and every CI job while the
  // guard reported all-clear (audit F7, 2026-09-22).
  unit: Object.freeze({
    concurrency: manifest.unit.concurrency,
    files: Object.freeze([...manifest.unit.files]),
  }),
  regression: Object.freeze({
    concurrency: manifest.regression.concurrency,
    files: Object.freeze([...manifest.regression.files]),
  }),
  browser: Object.freeze({
    concurrency: manifest.browser.concurrency,
    files: Object.freeze([...manifest.browser.files]),
  }),
  context: Object.freeze({
    concurrency: manifest.context.concurrency,
    files: Object.freeze([...manifest.context.files]),
  }),
  orchestrator: Object.freeze({
    concurrency: manifest.orchestrator.concurrency,
    files: Object.freeze([...manifest.orchestrator.files]),
  }),
  harness: Object.freeze({
    concurrency: manifest.harness.concurrency,
    files: Object.freeze([...manifest.harness.files]),
  }),
  team: Object.freeze({
    concurrency: manifest.team.concurrency,
    files: Object.freeze([...manifest.team.files]),
  }),
  rex: Object.freeze({
    concurrency: manifest.rex.concurrency,
    files: Object.freeze([...manifest.rex.files]),
  }),
  client: Object.freeze({
    concurrency: manifest.client.concurrency,
    files: Object.freeze([...manifest.client.files]),
  }),
});

export function suiteSpec(name) {
  const suite = SUITES[name];
  if (!suite) throw new Error(`Unknown test suite: ${name}`);
  return {
    concurrency: suite.concurrency,
    ...(suite.roots ? { roots: [...suite.roots] } : {}),
    ...(suite.files ? { files: [...suite.files] } : {}),
  };
}
