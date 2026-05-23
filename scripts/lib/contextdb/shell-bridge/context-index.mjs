import { writeIndex } from '../context-registry.mjs';

export async function writeBridgeContextIndex({ workspace, agent, env }) {
  try {
    await writeIndex({
      sessionId: '',
      status: 'running',
      agent,
      workspaceRoot: workspace,
    });
  } catch (err) {
    if (env.CTXDB_DEBUG) {
      console.error(`[contextdb-shell-bridge] index write failed: ${err.message}`);
    }
  }
}
