import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { loadTaskRegistry } from '../task-registry.mjs';
import { buildMixedReplayBatch } from '../trainer.mjs';
import { pickBestCheckpoint } from '../eval-harness.mjs';
import { loadReplayPool } from '../replay-pool.mjs';
import { runOnlineCampaign } from '../../rl-core/campaign-controller.mjs';
import { runRealShadowEval } from './shadow-eval.mjs';
import { runTrainingRun } from './training-run.mjs';

export async function runCampaign({ config, deps = {} }) {
  const rootDir = config.rootDir || process.cwd();
  const trainingRunner = deps.trainingRunner || runTrainingRun;
  const shadowEvalRunner = deps.shadowEvalRunner || runRealShadowEval;
  const replayPoolLoader = deps.replayPoolLoader || loadReplayPool;
  const registryLoader = deps.registryLoader || (async () => await loadTaskRegistry({
    rootDir,
    configPath: config.configPath || 'experiments/rl-shell-v1/configs/benchmark-v1.json',
  }));
  const registryGate = await registryLoader({ rootDir, config });
  if (registryGate?.valid === false) {
    return { status: registryGate.reason || 'invalid-registry' };
  }

  const seeds = Array.isArray(config.acceptanceSeeds) && config.acceptanceSeeds.length === 3
    ? config.acceptanceSeeds
    : [17, 29, 41];

  const seedResults = [];
  for (const seed of seeds) {
    const result = await trainingRunner({
      config,
      seed,
      deps: {
        ...deps,
        registryLoader: async () => registryGate,
      },
    });
    seedResults.push({
      seed,
      status: result.status,
      successRate: result.heldOutMetrics?.successRate || 0,
      regressionFreeFixRate: result.heldOutMetrics?.regressionFreeFixRate || 0,
      avgTokenCount: result.heldOutMetrics?.avgTokenCount || 0,
      bestCheckpointPath: result.bestCheckpointPath || '',
      runId: result.runId || '',
      summaryPath: result.summaryPath || '',
    });
  }

  const bestRun = pickBestCheckpoint(
    seedResults.map((row) => ({
      step: row.seed,
      successRate: row.successRate,
      regressionFreeFixRate: row.regressionFreeFixRate,
      avgTokenCount: row.avgTokenCount,
      bestCheckpointPath: row.bestCheckpointPath,
      runId: row.runId,
      summaryPath: row.summaryPath,
    }))
  );

  const campaignId = `campaign-${Date.now()}`;
  const campaignDir = path.join(rootDir, 'experiments', 'rl-shell-v1', 'campaigns');
  await mkdir(campaignDir, { recursive: true });
  const campaignArtifactPath = path.join(campaignDir, `${campaignId}.json`);
  const status = seedResults.some((row) => row.successRate >= 0.5) ? 'passed' : 'failed';
  let replayPoolStatus = undefined;
  let realRepeatedRepairRate = undefined;
  let replayMix = undefined;

  if (config.phase === '2C') {
    const shadowResult = await shadowEvalRunner({ config, deps });
    const replayPool = await replayPoolLoader({ rootDir });
    const replayBatch = buildMixedReplayBatch({
      pool: replayPool,
      batchSize: Number(config.replayBatchSize || 5),
    });
    replayPoolStatus = shadowResult.pool_status;
    realRepeatedRepairRate = shadowResult.repeatability.repeatedRepairRate;
    replayMix = {
      realShadow: replayBatch.realShadow.length,
      synthetic: replayBatch.synthetic.length,
    };
  }

  await writeFile(campaignArtifactPath, `${JSON.stringify({
    campaign_id: campaignId,
    phase: config.phase || 'v1',
    status,
    seed_results: seedResults,
    best_run: bestRun,
    replay_pool_status: replayPoolStatus,
    real_repeated_repair_rate: realRepeatedRepairRate,
    replay_mix: replayMix,
  }, null, 2)}\n`, 'utf8');

  return {
    campaignId,
    phase: config.phase || 'v1',
    status,
    seedResults,
    bestRun,
    replayPoolStatus,
    realRepeatedRepairRate,
    replayMix,
    campaignArtifactPath,
  };
}

export async function runPhase3Campaign({ config, deps = {} }) {
  return runOnlineCampaign({
    config: {
      ...config,
      namespace: config.namespace || 'rl-shell-v1',
    },
    deps,
  });
}
