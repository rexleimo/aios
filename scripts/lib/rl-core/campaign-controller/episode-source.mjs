export async function pullAdmittedEpisode({
  deps,
  taskIndex,
  runtime,
  controlState,
}) {
  const nextEpisode = deps.nextEpisode;
  const sampleTask = deps.sampleTask;

  if (typeof nextEpisode !== 'function' && typeof sampleTask === 'function') {
    const task = await sampleTask({
      taskIndex,
      currentEpoch: runtime.currentEpoch,
      activeCheckpointId: controlState.active_checkpoint_id,
      controlState,
    });
    if (task === null) {
      runtime.idlePolls += 1;
      return { kind: 'idle' };
    }
    if (typeof deps.runEpisode !== 'function') {
      throw new Error('deps.runEpisode is required when sampleTask returns work');
    }
    runtime.idlePolls = 0;
    const episode = await deps.runEpisode({
      task,
      taskIndex,
      currentEpoch: runtime.currentEpoch,
      activeCheckpointId: controlState.active_checkpoint_id,
      controlState,
    });
    return episode?.admission_status === 'admitted'
      ? { kind: 'episode', episode }
      : { kind: 'skip' };
  }

  runtime.idlePolls = 0;
  const episode = await nextEpisode({
    taskIndex,
    currentEpoch: runtime.currentEpoch,
    activeCheckpointId: controlState.active_checkpoint_id,
    controlState,
  });
  return episode?.admission_status === 'admitted'
    ? { kind: 'episode', episode }
    : { kind: 'skip' };
}
