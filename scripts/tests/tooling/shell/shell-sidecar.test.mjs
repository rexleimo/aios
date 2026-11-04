// The desktop shell and the launcher must agree on facts neither of them owns.
//
// Two kinds of drift are possible and both are silent:
//
// 1. The shell's default port and the launcher's default port are the same fact
//    written twice (Rust constant vs `UI_DEFAULT_PORT`). If they drift, the shell
//    waits on a port nothing serves and reports a timeout that names no cause.
// 2. `tauri.conf.json` carries a `devUrl` for the Tauri CLI and `frontendDist` for
//    the build. A devUrl pointing at another port is the same failure one layer up.
//
// These are read as text on purpose: the Rust side is not importable from Node.
// The assertions are equality of one value per owner, not a shape check on prose.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { UI_DEFAULT_PORT } from '../../../../scripts/aios-ui.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..', '..');
const SRC_TAURI = path.join(ROOT, 'apps', 'shell', 'src-tauri');

function read(relative) {
  return readFileSync(path.join(SRC_TAURI, relative), 'utf8');
}

function rustDefaultUiPort() {
  const match = read(path.join('src', 'sidecar.rs')).match(
    /pub const DEFAULT_UI_PORT: u16 = (\d+);/,
  );
  assert.ok(match, 'sidecar.rs must declare DEFAULT_UI_PORT as a plain u16 literal');
  return Number(match[1]);
}

test('the shell default port and the launcher default port are one value', () => {
  assert.equal(rustDefaultUiPort(), UI_DEFAULT_PORT);
});

test('the tauri devUrl points at the same port the launcher serves', () => {
  const config = JSON.parse(read('tauri.conf.json'));
  const url = new URL(config.build.devUrl);
  assert.equal(url.hostname, '127.0.0.1', 'the page is served to this machine only');
  assert.equal(Number(url.port), UI_DEFAULT_PORT);
});

test('the capability process entry the shell starts is the launcher that exists', () => {
  const scriptRel = read(path.join('src', 'sidecar.rs')).match(
    /pub const UI_SCRIPT_REL: &str = "([^"]+)";/,
  );
  assert.ok(scriptRel, 'sidecar.rs must declare UI_SCRIPT_REL');
  assert.ok(
    existsSync(path.join(ROOT, scriptRel[1])),
    `${scriptRel[1]} must exist at the repository root`,
  );
});

test('the shell is a window over a server, not a bundler of the page', () => {
  // The page is `force-dynamic`: it shells out to data/load.mjs per request, so
  // there is no static export to embed. `bundle.active` stays false until S2
  // produces an artifact; a true here without a signing story would ship an
  // unsigned installer by accident.
  const config = JSON.parse(read('tauri.conf.json'));
  assert.equal(config.bundle.active, false);
  assert.deepEqual(config.app.windows, [], 'the window is created in code, after the server listens');
});

test('every icon the bundle names exists and is not an empty placeholder', () => {
  const config = JSON.parse(read('tauri.conf.json'));
  assert.ok(config.bundle.icon.length > 0);
  for (const icon of config.bundle.icon) {
    const file = path.join(SRC_TAURI, icon);
    assert.ok(existsSync(file), `${icon} is declared but missing`);
    assert.ok(readFileSync(file).length > 64, `${icon} is too small to be a real image`);
  }
});

test('every declared icon survives the repository ignore rules', () => {
  // 实测：仓库根 `.gitignore` 有一条 `*.png`，三个 png 图标因此被静默忽略，只有 icon.ico
  // 进了版本库——“文件存在”与“文件被跟踪”是两件事，前者在新克隆上不成立。
  const config = JSON.parse(read('tauri.conf.json'));
  // `--quiet` is only valid with a single pathname (git says so: exit 128), so the
  // decision is read off the exit code instead: 1 means none of them is ignored.
  const probe = spawnSync(
    'git',
    ['check-ignore', '--', ...config.bundle.icon.map((icon) => path.join(SRC_TAURI, icon))],
    { cwd: ROOT, encoding: 'utf8' },
  );
  if (probe.error) {
    assert.fail(`git is required to decide whether an icon is tracked: ${probe.error.message}`);
  }
  assert.equal(
    probe.status,
    1,
    `declared icons are ignored by git (exit ${probe.status}): ${probe.stdout.trim()}`,
  );
});

test('the window title and identifier are declared, not defaulted', () => {
  const config = JSON.parse(read('tauri.conf.json'));
  assert.equal(config.identifier, 'top.rexai.aios.shell');
  assert.equal(typeof config.productName, 'string');
  assert.ok(config.productName.length > 0);
});
