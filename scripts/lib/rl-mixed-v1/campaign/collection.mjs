export async function collectBatchEpisodes(ctx) {
  const collectionEpisodes = [];
  const batchEnvironments = [];

  while (collectionEpisodes.length < ctx.onlineBatchSize) {
    const sampled = await sampleNextTask(ctx);
    if (!sampled.task || !sampled.environment) {
      ctx.noWorkPolls += 1;
      return collectionEpisodes.length === 0
        ? { status: 'no_work', collectionEpisodes, batchEnvironments }
        : { status: 'partial', collectionEpisodes, batchEnvironments };
    }

    const adapter = ctx.adapters[sampled.environment];
    const episode = await adapter.runEpisode({
      task: sampled.task,
      checkpointId: ctx.controlState.active_checkpoint_id,
      policy: sampled.environment === 'orchestrator' ? ctx.activePolicy || undefined : undefined,
      trainerConfig: sampled.environment === 'orchestrator' ? ctx.currentTrainerConfig : undefined,
    });
    collectionEpisodes.push({
      ...episode,
      episode_id: `${sampled.environment}-collect-${ctx.batchIndex + 1}-${collectionEpisodes.length}`,
      admission_status: 'admitted',
      replay_eligible: episode.replay_route !== 'diagnostic_only',
      task_source: sampled.environment === 'shell' ? 'synthetic' : 'real_shadow',
    });
    batchEnvironments.push(sampled.environment);
    ctx.environmentCounts[sampled.environment] += 1;
  }

  return { status: 'ok', collectionEpisodes, batchEnvironments };
}

async function sampleNextTask(ctx) {
  for (let offset = 0; offset < ctx.resolvedEnvironments.length; offset += 1) {
    const environment = ctx.resolvedEnvironments[(ctx.envCursor + offset) % ctx.resolvedEnvironments.length];
    const adapter = ctx.adapters[environment];
    const task = await adapter.sampleTask({
      seed: ctx.batchIndex,
      attempt: ctx.attempts[environment],
    });
    ctx.attempts[environment] += 1;
    if (task) {
      ctx.envCursor = (ctx.envCursor + offset + 1) % ctx.resolvedEnvironments.length;
      return { task, environment };
    }
  }
  return { task: null, environment: null };
}
