// Where a Console fact reader looks for user state (.aios/memo, .aios/context-db...).
//
// A source checkout and a user's project both keep state in <root>/.aios. A
// self-contained desktop install is different: its root is the Program Files
// bundle, which is product code, not the user's data. Reading state there is
// both wrong (empty) and fragile (Program Files may be read-only). The bundle
// carries bundle-manifest.json as its marker; when present, state lives in the
// user's home .aios instead — the same directory the CLI writes to by default
// when run from a plain home directory.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BUNDLE_MARKER = 'bundle-manifest.json';
const STATE_DIRNAME = '.aios';

export function isBundledRoot(rootDir, existsImpl = fs.existsSync) {
  return existsImpl(path.join(rootDir, BUNDLE_MARKER));
}

function homeDir(env) {
  return String(env.USERPROFILE || env.HOME || os.homedir());
}

/**
 * Resolve the state root for a given Console root. Explicit CLI contract
 * `AIOS_PROJECT_STATE_DIR` wins; a bundled install uses <home>/.aios; every
 * other root keeps its own <root>/.aios so switching workspaces still reads
 * that project's state.
 */
export function stateDir(rootDir = process.cwd(), env = process.env, existsImpl = fs.existsSync) {
  const root = path.resolve(rootDir);
  const declared = String(env.AIOS_PROJECT_STATE_DIR ?? '').trim();
  if (declared) {
    return path.isAbsolute(declared) ? path.resolve(declared) : path.resolve(root, declared);
  }
  if (isBundledRoot(root, existsImpl)) return path.join(homeDir(env), STATE_DIRNAME);
  return path.join(root, STATE_DIRNAME);
}

/** Env patch for capability subprocesses: keep state consistent with stateDir(). */
export function stateEnv(rootDir, env = process.env, existsImpl = fs.existsSync) {
  if (env.AIOS_PROJECT_STATE_DIR || !isBundledRoot(path.resolve(rootDir), existsImpl)) return {};
  return { AIOS_PROJECT_STATE_DIR: stateDir(rootDir, env, existsImpl) };
}
