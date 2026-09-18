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

test('docs-pages workflow rebuilds when the shared version source or hook changes', () => {
  const workflow = read('.github/workflows/pages.yml');

  assert.match(workflow, /- "VERSION"/);
  assert.match(workflow, /- "scripts\/mkdocs_version\.py"/);
});

test('docs-pages workflow rebuilds for the single-h1 and sitemap-merge hooks', () => {
  const workflow = read('.github/workflows/pages.yml');

  assert.match(workflow, /- "scripts\/mkdocs_single_h1\.py"/);
  assert.match(workflow, /- "scripts\/mkdocs_sitemap_merge\.py"/);
});

test('docs-pages workflow submits published URLs to IndexNow after a deploy', () => {
  const workflow = read('.github/workflows/pages.yml');

  assert.match(workflow, /name:\s+Submit published URLs to IndexNow/);
  assert.match(workflow, /run:\s+node scripts\/indexnow-submit\.mjs/);
  assert.match(workflow, /continue-on-error:\s+true\s+run:\s+node scripts\/indexnow-submit\.mjs/);
});
