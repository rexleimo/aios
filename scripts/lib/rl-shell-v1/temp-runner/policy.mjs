export const DEFAULT_POLICY = Object.freeze({
  max_steps_per_episode: 12,
  max_command_seconds: 30,
  max_episode_seconds: 180,
  max_output_bytes_per_stream: 65536,
  no_progress_window: 3,
  network_access: false,
  forbidden_command_patterns: ['sudo', 'ssh', 'scp', 'curl', 'wget', 'git push', 'git reset --hard', 'rm -rf /'],
});

export function createDefaultExecutionPolicy() {
  return {
    ...DEFAULT_POLICY,
    forbidden_command_patterns: [...DEFAULT_POLICY.forbidden_command_patterns],
  };
}

export function ensureBudgets(workspace, policy) {
  const elapsedMs = Date.now() - workspace.startedAt;
  if (elapsedMs > policy.max_episode_seconds * 1000) {
    throw new Error('Episode wall-clock budget expired');
  }
  if (workspace.observations.length >= policy.max_steps_per_episode) {
    throw new Error('Episode step budget exhausted');
  }
}
