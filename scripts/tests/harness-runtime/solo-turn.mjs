import assert from 'node:assert/strict';
import test from 'node:test';

import { mkdtemp, rm, os, path, buildIterationPrompt } from './support.mjs';

test('buildIterationPrompt injects offload canvas as compact resume context', () => {
  const prompt = buildIterationPrompt({
    objective: 'Resume offloaded evidence',
    iteration: 2,
    offloadCanvas: {
      relativePath: '.aios/offload/canvas/demo-session/task-canvas.mmd',
      mermaid: 'graph LR\n    m_n0001_abc123["n0001-abc123 Bash: npm test"]\n',
      truncated: false,
    },
  });

  assert.match(prompt, /Offload Canvas/);
  assert.match(prompt, /\.aios\/offload\/canvas\/demo-session\/task-canvas\.mmd/);
  assert.match(prompt, /n0001-abc123 Bash: npm test/);
  assert.match(prompt, /aios refs grep\/read/);
});



test('buildProductionExecuteTurn compresses solo harness prompts before provider launch and compacts received output', async () => {
  const { buildProductionExecuteTurn } = await import('../../lib/lifecycle/harness/execute-turn.mjs');
  const { readMetricsRecords } = await import('../../lib/interception/metrics/metrics-sink.mjs');
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-solo-turn-'));
  const PRE_SENTINEL = 'SOLO_HARNESS_PRE_SEND_SENTINEL';
  const POST_SENTINEL = 'SOLO_HARNESS_POST_RECEIVE_SENTINEL';
  let captured = null;

  try {
    const executeTurn = buildProductionExecuteTurn({
      rootDir,
      aiosRootDir: rootDir,
      sessionId: 'solo-turn',
      objective: `${PRE_SENTINEL.repeat(120)}\nscripts/lib/lifecycle/harness/execute-turn.mjs:11`,
      provider: 'codex',
      spawnCommandImpl: async (command, args, options) => {
        captured = { command, args, options };
        return {
          status: 0,
          stdout: JSON.stringify({
            outcome: 'success',
            summary: `${POST_SENTINEL.repeat(120)}\nscripts/lib/lifecycle/harness/execute-turn.mjs:33`,
            keyChanges: [],
            keyLearnings: [],
            nextAction: 'stop',
            shouldStop: true,
          }),
          stderr: '',
        };
      },
    });

    const result = await executeTurn({
      iteration: 1,
      continuity: '',
      offloadCanvas: null,
      summary: { workspaceRoot: rootDir, aiosRootDir: rootDir },
      worktree: { enabled: false },
    });

    assert.equal(JSON.stringify(captured).includes(PRE_SENTINEL), false);
    assert.equal(result.rawOutput.includes(POST_SENTINEL), false);
    assert.match(result.rawOutput, /aios\.compact_packet/);

    const records = await readMetricsRecords({ workspaceRoot: rootDir, sessionId: 'solo-turn' });
    assert.equal(records.some((record) => record.event_kind === 'pre_send' && record.client_id === 'aios-harness'), true);
    assert.equal(records.some((record) => record.event_kind === 'post_receive' && record.client_id === 'aios-harness'), true);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
