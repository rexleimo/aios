import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('docs-pages workflow retries GitHub Pages deployment once before failing', () => {
  const workflow = read('.github/workflows/pages.yml');

  assert.match(workflow, /name:\s+Deploy to GitHub Pages \(attempt 1\)/);
  assert.match(workflow, /id:\s+deployment_attempt_1/);
  assert.match(workflow, /continue-on-error:\s+true/);

  assert.match(workflow, /name:\s+Wait before retrying GitHub Pages deploy/);
  assert.match(workflow, /sleep 15/);

  assert.match(workflow, /name:\s+Deploy to GitHub Pages \(attempt 2\)/);
  assert.match(workflow, /id:\s+deployment_attempt_2/);

  assert.match(workflow, /name:\s+Fail when GitHub Pages deploy retries are exhausted/);
  assert.match(
    workflow,
    /steps\.deployment_attempt_1\.outcome == 'failure'\s+&&\s+steps\.deployment_attempt_2\.outcome == 'failure'/
  );
});
