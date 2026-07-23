import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const fixturePath = path.join(process.cwd(), 'scripts', 'tests', 'fixtures', 'gaia-ab-eval-valid.json');

function runEvaluator(configPath) {
  return spawnSync(process.execPath, ['scripts/gaia-ab-eval.mjs', '--config', configPath, '--dry-run'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
}

async function withManifestVariant(update, assertion) {
  const manifest = JSON.parse(await readFile(fixturePath, 'utf8'));
  update(manifest);
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gaia-ab-eval-'));
  const configPath = path.join(directory, 'manifest.json');

  try {
    await writeFile(configPath, `${JSON.stringify(manifest)}\n`, 'utf8');
    await assertion(configPath);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

test('GAIA A/B evaluator exposes an offline manifest configuration entry point', () => {
  const result = spawnSync(process.execPath, ['scripts/gaia-ab-eval.mjs', '--help'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /GAIA A\/B evaluation/u);
  assert.match(result.stdout, /--config/u);
  assert.match(result.stdout, /--dry-run/u);
});

test('GAIA A/B evaluator reserves --execute for an explicitly configured local run', () => {
  const result = spawnSync(process.execPath, ['scripts/gaia-ab-eval.mjs', '--execute'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /requires --config/u);
  assert.doesNotMatch(result.stderr, /only supports --dry-run/u);
});

test('GAIA A/B evaluator validates a selected-client manifest without invoking a client', () => {
  const result = runEvaluator(fixturePath);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /codex/u);
  assert.match(result.stdout, /claude/u);
  assert.match(result.stdout, /hermes/u);
  assert.match(result.stdout, /deepseek-v4-pro/u);
});

test('GAIA A/B evaluator rejects Hermes model drift', async () => {
  await withManifestVariant((manifest) => {
    manifest.runs.find((run) => run.client === 'hermes').model = 'different-model';
  }, async (configPath) => {
    const result = runEvaluator(configPath);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /hermes.*deepseek-v4-pro/iu);
  });
});

test('GAIA A/B evaluator rejects every unequal A/B control', async () => {
  const changedControls = {
    taskSet: 'different-gaia-validation-sample',
    toolProfile: 'different-common-tools-v1',
    browserProfile: 'different-common-browser-v1',
    timeoutSeconds: 301,
    retryPolicy: 'once',
    concurrency: 2,
  };

  for (const [control, value] of Object.entries(changedControls)) {
    await withManifestVariant((manifest) => {
      manifest.runs.find((run) => run.client === 'codex').arms.optimized[control] = value;
    }, async (configPath) => {
      const result = runEvaluator(configPath);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, new RegExp(`codex.*${control}`, 'iu'));
    });
  }
});

test('GAIA A/B evaluator rejects missing Codex and Claude model identifiers', async () => {
  for (const client of ['codex', 'claude']) {
    await withManifestVariant((manifest) => {
      manifest.runs.find((run) => run.client === client).model = '';
    }, async (configPath) => {
      const result = runEvaluator(configPath);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, new RegExp(`${client}.*model.*non-empty`, 'iu'));
    });
  }
});

test('GAIA A/B evaluator rejects cross-model aggregation', async () => {
  await withManifestVariant((manifest) => {
    manifest.report.aggregateAcrossModels = true;
  }, async (configPath) => {
    const result = runEvaluator(configPath);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /aggregateAcrossModels/iu);
  });
});
