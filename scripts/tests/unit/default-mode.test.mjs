import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  readAiosConfig,
  resolveDefaultMode,
  getModePreset,
  resolveDefaultModeInjections,
  writeAiosConfig,
} from '../../lib/lifecycle/options/default-mode.mjs';
import { resolveRuntimeDirectiveInjections } from '../../lib/lifecycle/harness/directive-inject.mjs';

test('readAiosConfig returns null when config file does not exist', async () => {
  const tmpDir = await mkdtemp();
  try {
    const result = await readAiosConfig(tmpDir);
    assert.equal(result, null);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('readAiosConfig parses valid config.json', async () => {
  const tmpDir = await mkdtemp();
  try {
    await mkdir(path.join(tmpDir, '.aios'), { recursive: true });
    await writeFile(path.join(tmpDir, '.aios', 'config.json'), JSON.stringify({ default_mode: 'strict-primary' }));
    const result = await readAiosConfig(tmpDir);
    assert.equal(result.default_mode, 'strict-primary');
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('resolveDefaultMode returns null for no config', () => {
  assert.equal(resolveDefaultMode(null), null);
  assert.equal(resolveDefaultMode({}), null);
  assert.equal(resolveDefaultMode({ default_mode: '' }), null);
});

test('resolveDefaultMode returns mode for known presets', () => {
  assert.equal(resolveDefaultMode({ default_mode: 'strict-primary' }), 'strict-primary');
  assert.equal(resolveDefaultMode({ default_mode: 'harness-runner' }), 'harness-runner');
  assert.equal(resolveDefaultMode({ default_mode: 'team-worker' }), 'team-worker');
});

test('resolveDefaultMode returns mode for custom presets', () => {
  const config = {
    default_mode: 'my-custom',
    mode_presets: {
      'my-custom': { label: 'Custom', skills: ['x'], systemPromptAdditions: ['y'] },
    },
  };
  assert.equal(resolveDefaultMode(config), 'my-custom');
});

test('resolveDefaultMode returns null for unknown mode without custom preset', () => {
  assert.equal(resolveDefaultMode({ default_mode: 'unknown-mode' }), null);
});

test('getModePreset returns built-in presets', () => {
  const preset = getModePreset('strict-primary', {});
  assert.equal(preset.label, 'Strict AIOS Primary Agent');
  assert.equal(preset.builtin, true);
  assert.deepEqual(preset.skills, []);
  assert.match(preset.systemPromptAdditions.join('\n'), /workflow policy/i);
});

test('getModePreset returns custom presets from config', () => {
  const config = {
    mode_presets: {
      'my-mode': { label: 'My Mode', skills: ['a', 'b'], systemPromptAdditions: ['c'] },
    },
  };
  const preset = getModePreset('my-mode', config);
  assert.equal(preset.label, 'My Mode');
  assert.equal(preset.builtin, false);
});

test('getModePreset returns null for unknown mode', () => {
  assert.equal(getModePreset('nonexistent', {}), null);
});

test('resolveDefaultModeInjections returns null when no default_mode', async () => {
  const tmpDir = await mkdtemp();
  try {
    const result = await resolveDefaultModeInjections(tmpDir);
    assert.equal(result, null);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('resolveDefaultModeInjections returns injections for strict-primary', async () => {
  const tmpDir = await mkdtemp();
  try {
    await mkdir(path.join(tmpDir, '.aios'), { recursive: true });
    await writeFile(path.join(tmpDir, '.aios', 'config.json'), JSON.stringify({ default_mode: 'strict-primary' }));
    const result = await resolveDefaultModeInjections(tmpDir);
    assert.equal(result.modeName, 'strict-primary');
    assert.equal(result.label, 'Strict AIOS Primary Agent');
    assert.deepEqual(result.skills, []);
    assert.match(result.systemPromptAdditions.join('\n'), /workflow policy/i);
    assert.doesNotMatch(result.systemPromptAdditions.join('\n'), /superpowers workflow before any implementation/i);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('runtime directive presets avoid fixed Provider injection', async () => {
  const tmpDir = await mkdtemp();
  try {
    await mkdir(path.join(tmpDir, '.aios'), { recursive: true });
    await writeFile(path.join(tmpDir, '.aios', 'config.json'), JSON.stringify({ default_mode: 'team-worker' }));

    const result = resolveRuntimeDirectiveInjections(tmpDir);
    assert.equal(result.modeName, 'team-worker');
    assert.deepEqual(result.skills, []);
    assert.match(result.systemPromptAdditions.join('\n'), /workflow policy/i);
    assert.doesNotMatch(result.systemPromptAdditions.join('\n'), /superpowers workflow before any implementation/i);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('writeAiosConfig creates config file with default_mode', async () => {
  const tmpDir = await mkdtemp();
  try {
    const result = await writeAiosConfig(tmpDir, { defaultMode: 'harness-runner' });
    assert.equal(result.default_mode, 'harness-runner');
    // Verify written file
    const readBack = await readAiosConfig(tmpDir);
    assert.equal(readBack.default_mode, 'harness-runner');
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('writeAiosConfig merges with existing config', async () => {
  const tmpDir = await mkdtemp();
  try {
    await mkdir(path.join(tmpDir, '.aios'), { recursive: true });
    await writeFile(path.join(tmpDir, '.aios', 'config.json'), JSON.stringify({ existing_field: 'kept' }));
    const result = await writeAiosConfig(tmpDir, { defaultMode: 'team-worker' });
    assert.equal(result.default_mode, 'team-worker');
    assert.equal(result.existing_field, 'kept');
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

async function mkdtemp() {
  return await mkdir(path.join(os.tmpdir(), 'aios-default-mode-test-'), { recursive: true });
}
