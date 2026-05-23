import { spawnSync } from 'node:child_process';
import { getCommandSpawnSpec } from '../../platform/process.mjs';

export function spawnInherited(command, args, cwd, env) {
  const spec = getCommandSpawnSpec(command, args, { env });
  const result = spawnSync(spec.command, spec.args, {
    cwd,
    env,
    stdio: 'inherit',
    shell: spec.shell ?? false,
  });

  if (result.error) {
    const reason = result.error.message || String(result.error);
    console.error(`[contextdb-shell-bridge] failed to run ${command}: ${reason}`);
    return 1;
  }

  return result.status ?? 1;
}
