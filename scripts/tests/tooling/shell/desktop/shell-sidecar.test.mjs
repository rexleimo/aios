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

import {
  TOKEN_ENV,
  UI_DEFAULT_PORT,
  bootstrapUiUrl,
  tokenPath,
	} from '../../../../../scripts/aios-ui.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..', '..', '..');
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

test('the config declares no second URL for the window', () => {
  // 窗口 URL 由代码生成（带 token），`tauri.conf.json` 的 `devUrl` 会是第二份 URL 事实，
  // 而且是一份不带 token 的旧地址。它被删除后必须保持删除。
  const config = JSON.parse(read('tauri.conf.json'));
  assert.equal(config.build.devUrl, undefined, 'the window URL is built in src/lib.rs, not in config');
  // 实测：把 frontendDist 指向 `../ui/.next` 时，安装包从 1.84 MiB 涨到 90.16 MiB ——
  // 125 MB 的 Next 产物被塞进一个永远不会读它的安装包（窗口加载的是能力进程渲染的页面）。
  assert.equal(config.build.frontendDist, 'resources');
  assert.ok(
    !String(config.build.frontendDist).includes('ui/'),
    'the shell must not embed the capability process`s build output',
  );
});

test('the window URL, the launcher URL and the gate prefix are one shape', () => {
  const sidecar = read(path.join('src', 'sidecar.rs'));
  const token = 'deadbeef';
  const url = bootstrapUiUrl(UI_DEFAULT_PORT, token);
  assert.equal(url, `http://127.0.0.1:${UI_DEFAULT_PORT}/t/${token}/`);
  assert.ok(
    sidecar.includes('http://127.0.0.1:{port}/t/{token}/'),
    'the Rust format string must be the same shape as bootstrapUiUrl',
  );
});

test('the token file name and the token environment variable have one spelling', () => {
  const sidecar = read(path.join('src', 'sidecar.rs'));
  assert.equal(TOKEN_ENV, 'AIOS_UI_TOKEN');
  assert.ok(sidecar.includes('pub const TOKEN_ENV: &str = "AIOS_UI_TOKEN";'));
  assert.equal(path.basename(tokenPath(UI_DEFAULT_PORT, '/tmp')), 'aios-ui-token-3126');
  assert.ok(sidecar.includes('aios-ui-token-{port}'));
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
  // The page is `force-dynamic`: it shells out to data/load.mjs per request, so there
  // is no static export to embed. Bundling is on (S2-3) but produces an unsigned
  // installer, so the targets are stated and nothing here claims a signature.
  const config = JSON.parse(read('tauri.conf.json'));
  assert.equal(config.bundle.active, true);
  assert.deepEqual(config.bundle.targets, ['nsis']);
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
