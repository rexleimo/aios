import manifest from '../test-suites.json' with { type: 'json' };

const SUITES = Object.freeze({
  unit: Object.freeze({
    concurrency: 4,
    roots: Object.freeze(['scripts/tests/unit']),
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
