import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  normalizeSoloIterationOutcome,
  resolveSoloBackoffState,
  runSoloHarnessLoop,
  writeSoloIterationCheckpoint,
} from '../../lib/harness/solo-runtime.mjs';
import { runContextDbCli } from '../../lib/contextdb-cli.mjs';
import {
  getSoloHarnessPaths,
  initSoloRunJournal,
  readSoloRunSummary,
  readSoloControl,
  readSoloRunStatus,
  requestSoloHarnessStop,
} from '../../lib/harness/solo-journal.mjs';
import { buildIterationPrompt, runHarnessCommand } from '../../lib/lifecycle/harness.mjs';
import {
  buildClientStructuredOutputOptions,
  cleanupClientStructuredOutputTempDir,
  createClientStructuredOutputTempDir,
  shouldUseClientStructuredOutput,
} from '../../lib/harness/subagent-clients/structured-output.mjs';
import { buildOneShotInvocation } from '../../lib/harness/subagent-clients/one-shot.mjs';
import { runOneShot } from '../../lib/harness/subagent-runtime/one-shot-runner.mjs';

export async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return false;
    throw error;
  }
}

export async function importHarnessInitHumanGate() {
  return await import(pathToFileURL(path.resolve('skill-sources/harness-init-runner/assets/template/harness/lib/human-gate.mjs')).href);
}

export async function writeFakeCli(binDir, name) {
  await mkdir(binDir, { recursive: true });
  const ext = process.platform === 'win32' ? '.cmd' : '';
  const filePath = path.join(binDir, `${name}${ext}`);
  const content = process.platform === 'win32'
    ? `@echo off\r\n"%~dp0\\node.exe" "%~dp0\\${name}.js" %*\r\n`
    : '#!/usr/bin/env sh\necho "fake $@"\n';
  await writeFile(filePath, content, 'utf8');
  if (process.platform === 'win32') {
    await writeFile(path.join(binDir, `${name}.js`), 'console.log("fake");\n', 'utf8');
  }
  if (process.platform !== 'win32') {
    await chmod(filePath, 0o755);
  }
  return filePath;
}

export async function withFakeProviderPath(providerNames, fn) {
  const binDir = await mkdtemp(path.join(os.tmpdir(), 'aios-fake-cli-bin-'));
  const originalPath = process.env.PATH;
  const originalPathCase = process.env.Path;
  const originalPathExt = process.env.PATHEXT;
  try {
    for (const name of providerNames) {
      await writeFakeCli(binDir, name);
    }
    const testPath = `${binDir}${path.delimiter}${originalPath || originalPathCase || ''}`;
    process.env.PATH = testPath;
    process.env.Path = testPath;
    if (process.platform === 'win32') {
      process.env.PATHEXT = originalPathExt || '.COM;.EXE;.BAT;.CMD';
    }
    return await fn(binDir);
  } finally {
    process.env.PATH = originalPath;
    if (originalPathCase === undefined) delete process.env.Path;
    else process.env.Path = originalPathCase;
    if (originalPathExt === undefined) delete process.env.PATHEXT;
    else process.env.PATHEXT = originalPathExt;
    await rm(binDir, { recursive: true, force: true });
  }
}

export async function writeFallbackCodexCommand(binDir, argsLogPath) {
  await mkdir(binDir, { recursive: true });
  const scriptPath = path.join(binDir, 'codex-fallback.js');
  const script = [
    "const fs = require('node:fs');",
    'const args = process.argv.slice(2);',
    `fs.appendFileSync(${JSON.stringify(argsLogPath)}, JSON.stringify(args) + '\\n', 'utf8');`,
    "if (args.includes('--output-schema')) {",
    "  process.stderr.write(\"unexpected argument '--output-schema'\\n\");",
    '  process.exit(1);',
    '}',
    "process.stdout.write('fake Codex acknowledgement\\n');",
  ].join('\n');
  await writeFile(scriptPath, `${script}\n`, 'utf8');

  const extension = process.platform === 'win32' ? '.cmd' : '';
  const commandPath = path.join(binDir, `codex${extension}`);
  if (process.platform === 'win32') {
    await writeFile(commandPath, `@echo off\r\n"${process.execPath}" "${scriptPath}" %*\r\n`, 'utf8');
  } else {
    await writeFile(commandPath, `#!/usr/bin/env sh\nexec "${process.execPath}" "${scriptPath}" "$@"\n`, 'utf8');
    await chmod(commandPath, 0o755);
  }
  return commandPath;
}

export {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
  os,
  path,
  pathToFileURL,
  normalizeSoloIterationOutcome,
  resolveSoloBackoffState,
  runSoloHarnessLoop,
  writeSoloIterationCheckpoint,
  runContextDbCli,
  getSoloHarnessPaths,
  initSoloRunJournal,
  readSoloRunSummary,
  readSoloControl,
  readSoloRunStatus,
  requestSoloHarnessStop,
  buildIterationPrompt,
  runHarnessCommand,
  buildClientStructuredOutputOptions,
  cleanupClientStructuredOutputTempDir,
  createClientStructuredOutputTempDir,
  shouldUseClientStructuredOutput,
  buildOneShotInvocation,
  runOneShot,
};
