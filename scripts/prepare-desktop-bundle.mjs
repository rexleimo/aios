#!/usr/bin/env node
// Stage a self-contained capability tree for the Tauri desktop bundle.
//
// The desktop installer must work with nothing else installed: one download, one
// shortcut, a working Console. That means it has to carry the three layers that
// currently live apart (see docs/adr/0007):
//   1. the capability tree (scripts/, config/, rex-harness/, skill sources, ...)
//   2. the built Console UI (apps/shell/ui/.next + its node_modules)
//   3. a Node runtime (the very `process.execPath` building the bundle)
//
// Everything lands in apps/shell/src-tauri/bundle/runtime/. tauri.conf.json declares
// that directory as a bundle resource, and the Rust shell resolves its install root
// there. `npm run ui:setup` / `ui:build` are reused as the owners of the UI build —
// this script stages, it does not reimplement the build.
//
// Usage: node scripts/prepare-desktop-bundle.mjs [--root <dir>] [--node <path>] [--json]
// Exit: 0 staged, 1 staging failed, 2 usage error.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNTIME_REL = path.join('apps', 'shell', 'src-tauri', 'bundle', 'runtime');
const UI_REL = path.join('apps', 'shell', 'ui');

// Mirror of the CLI release tree (scripts/package-release.sh release_paths) plus the
// two additions a self-contained desktop needs: the built UI and a Node runtime.
const TREE = [
  'AGENTS.md', 'CHANGELOG.md', 'VERSION', '.nvmrc', '.node-version', '.npmrc',
  'MOTION.md', 'DESIGN.md',
  'package.json', 'package-lock.json',
  'README.md', 'README-zh.md', 'skills-lock.json',
  'vendor', 'client-sources', 'agent-sources', 'skill-sources', 'rex-harness',
  'config', 'scripts', 'mcp-server', 'src', 'packages/debug-hub',
  'apps/shell/README.md', UI_REL,
];

function parseArgs(argv) {
  const options = { root: REPO, node: process.execPath, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--root' || token === '--node') {
      const value = argv[++i];
      if (!value) throw new Error(`[bundle] ${token} needs a value`);
      options[token.slice(2)] = path.resolve(value);
    } else if (token === '--json') options.json = true;
    else throw new Error(`[bundle] unknown option: ${token}`);
  }
  return options;
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) {
    throw new Error(`[bundle] ${command} ${args.join(' ')} failed (${result.status}): ${result.stderr || result.stdout}`);
  }
}

/** Build the Console once, through the same owner the developer workflow uses. */
export function buildUi(root, { node = process.execPath, runner = run } = {}) {
  runner(node, [path.join(root, 'scripts', 'aios-ui.mjs'), 'build', '--root', root], root);
}

/** Copy the release tree, excluding generated/ignored output we rebuild or never use. */
export function stageTree(root, dest, { fsImpl = fs } = {}) {
  // Source trees carry stale .next / node_modules from the developer's machine.
  // We rebuild both at staging time (buildUi) and copy the fresh output explicitly
  // in stageBuiltUi, so they are excluded here to avoid shipping a stale build.
  const excluded = new Set(['node_modules', '.git', '.next', 'tsconfig.tsbuildinfo', 'next-env.d.ts', '.aios', '__pycache__']);
  let files = 0;
  for (const rel of TREE) {
    const source = path.join(root, rel);
    if (!fsImpl.existsSync(source)) throw new Error(`[bundle] required path missing: ${rel}`);
    const target = path.join(dest, rel);
    fsImpl.mkdirSync(path.dirname(target), { recursive: true });
    if (fsImpl.statSync(source).isDirectory()) {
      fsImpl.cpSync(source, target, {
        recursive: true,
        force: true,
        filter: (entry) => !excluded.has(path.basename(entry)),
      });
      files += 1;
    } else {
      fsImpl.copyFileSync(source, target);
      files += 1;
    }
  }
  return files;
}

/** Copy the freshly built Console output (.next + its node_modules) into the tree. */
export function stageBuiltUi(root, dest, { fsImpl = fs } = {}) {
  const sourceUi = path.join(root, UI_REL);
  const targetUi = path.join(dest, UI_REL);
  const buildId = path.join(sourceUi, '.next', 'BUILD_ID');
  if (!fsImpl.existsSync(buildId)) {
    throw new Error(`[bundle] UI build did not produce ${buildId}; run ui:build first`);
  }
  const nextBin = path.join(sourceUi, 'node_modules', 'next', 'dist', 'bin', 'next');
  if (!fsImpl.existsSync(nextBin)) {
    throw new Error(`[bundle] UI dependencies missing: ${nextBin}; run ui:setup first`);
  }
  fsImpl.cpSync(path.join(sourceUi, '.next'), path.join(targetUi, '.next'), { recursive: true, force: true });
  fsImpl.cpSync(path.join(sourceUi, 'node_modules'), path.join(targetUi, 'node_modules'), { recursive: true, force: true });
  return path.relative(dest, path.join(targetUi, '.next', 'BUILD_ID'));
}

/** Place the Node runtime inside the tree; aios-ui.mjs re-execs process.execPath. */
export function stageNode(dest, nodeBinary, { fsImpl = fs, platform = process.platform } = {}) {
  if (!fsImpl.existsSync(nodeBinary)) throw new Error(`[bundle] node runtime missing: ${nodeBinary}`);
  const binDir = path.join(dest, 'bin');
  fsImpl.mkdirSync(binDir, { recursive: true });
  const name = platform === 'win32' ? 'node.exe' : 'node';
  const target = path.join(binDir, name);
  fsImpl.copyFileSync(nodeBinary, target);
  if (platform !== 'win32') fsImpl.chmodSync(target, 0o755);
  return path.relative(dest, target);
}

export function stage({ root = REPO, node = process.execPath } = {}) {
  const dest = path.join(root, RUNTIME_REL);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  buildUi(root, { node });
  const entries = stageTree(root, dest);
  const buildIdRel = stageBuiltUi(root, dest);
  const nodeRel = stageNode(dest, node);
  const manifest = {
    kind: 'aios.desktop-bundle.v1',
    runtime: RUNTIME_REL.replace(/\\/g, '/'),
    entries,
    build: buildIdRel.replace(/\\/g, '/'),
    node: nodeRel.replace(/\\/g, '/'),
  };
  fs.writeFileSync(path.join(dest, 'bundle-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { dest, manifest };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const { dest, manifest } = stage(options);
    if (options.json) process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
    else process.stdout.write(`[bundle] staged ${manifest.entries} entries + node -> ${dest}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
