import { captureCrgCommand, runCrgCommand } from './crg.mjs';
import { readState, writeState } from './state-store.mjs';

export async function buildCodemap({ projectRoot, io = console } = {}) {
  const result = runCrgCommand(['build'], { cwd: projectRoot, io });
  const state = readState(projectRoot);
  if (state) {
    state.graphBuilt = true;
    writeState(projectRoot, state);
  }
  return result;
}

export async function updateCodemap({ projectRoot, io = console } = {}) {
  return runCrgCommand(['update'], { cwd: projectRoot, io });
}

export async function statusCodemap({ projectRoot, io = console } = {}) {
  const result = captureCrgCommand(['status'], { cwd: projectRoot });
  if (result) {
    io.log(result.stdout.trim());
  } else {
    io.log('ERR  code-review-graph status failed');
  }
  return result;
}
