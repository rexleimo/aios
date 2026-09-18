#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createAiosProgram } from './lib/cli/commander-app.mjs';
import { createAiosDispatch } from './lib/cli/dispatch.mjs';
import { getRuntimeVersion } from './lib/cli/dispatch/runtime.mjs';
import { getRootHelpText } from './lib/cli/help.mjs';
import { resolveProjectRoot } from './lib/cli/project-root.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** cwd 只是兜底：AIOS_PROJECT_ROOT 让 wrapper / CI 能显式声明目标项目。 */
const projectRoot = resolveProjectRoot({ env: process.env });

function isUsageError(message) {
  return /^(?:error: )?(Unknown command|Unknown option|Missing value|too many arguments|--.+ must|.+ requires )/u.test(message);
}

async function main(argv = process.argv) {
  const program = createAiosProgram({
    version: await getRuntimeVersion(rootDir),
    dispatch: createAiosDispatch({ rootDir, projectRoot }),
  });
  await program.parseAsync(argv);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  if (error?.refusal === true) {
    // 守卫拒绝自带可操作的一行结论，不再刷堆栈。
  } else if (isUsageError(message)) {
    process.stderr.write(getRootHelpText());
  } else if (error instanceof Error && error.stack) {
    process.stderr.write(`${error.stack}\n`);
  }
  process.exitCode = 1;
});
