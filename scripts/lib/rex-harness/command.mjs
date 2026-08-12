import path from 'node:path';

import { captureCommand } from '../platform/process.mjs';

export function createRexCommandRunner({ rootDir, run = captureCommand } = {}) {
  const rexEntry = path.join(path.resolve(rootDir), 'rex-harness', 'bin', 'rex-harness.mjs');

  return async function runRex(args = [], { write = process.stdout.write.bind(process.stdout) } = {}) {
    const result = await run(process.execPath, [rexEntry, ...args], {
      cwd: path.resolve(rootDir),
      encoding: 'utf8',
    });
    if (result.stdout) write(String(result.stdout));
    if (result.stderr) write(String(result.stderr));
    return { exitCode: result.status ?? 1 };
  };
}
