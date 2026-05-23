import { computeHash } from './shared.mjs';

function buildShellTask(taskFamily, index) {
  return {
    task_id: `shell-${taskFamily}-${String(index + 1).padStart(3, '0')}`,
    task_family: taskFamily,
  };
}

export function createShellMixedAdapter() {
  const tasks = ['failing_tests', 'typecheck', 'build'].flatMap((taskFamily) =>
    Array.from({ length: 6 }, (_, index) => buildShellTask(taskFamily, index))
  );

  function sampleTask({ attempt = 0 } = {}) {
    return tasks[attempt % tasks.length];
  }

  function buildEpisode({ task, checkpointId }) {
    const score = computeHash(`${checkpointId}:${task.task_id}`) % 100;
    const terminal_reward = score >= 58 ? 1 : score >= 42 ? 0 : -1;
    return {
      schema_version: 1,
      environment: 'shell',
      task_family: task.task_family,
      teacher_triggered: terminal_reward < 1,
      teacher_trigger_reason: terminal_reward < 0 ? 'failure' : terminal_reward === 0 ? 'boundary' : null,
      boundary_episode: terminal_reward === 0,
      terminal_reward,
      comparison_status: 'completed',
      relative_outcome: 'same',
      replay_route: 'neutral',
      safety_violation: false,
      safety_violation_reason: null,
      task_id: task.task_id,
    };
  }

  function compareAgainstReference({ task, activeCheckpointId, preUpdateRefCheckpointId }) {
    const activeScore = computeHash(`${activeCheckpointId}:${task.task_id}`) % 100;
    const referenceScore = computeHash(`${preUpdateRefCheckpointId}:${task.task_id}`) % 100;
    const relative_outcome = activeScore > referenceScore ? 'better' : activeScore < referenceScore ? 'worse' : 'same';
    return {
      comparison_status: 'completed',
      relative_outcome,
      replay_route: relative_outcome === 'better' ? 'positive' : relative_outcome === 'worse' ? 'negative' : 'neutral',
    };
  }

  return {
    environment: 'shell',
    sampleTask,
    runEpisode({ task, checkpointId }) {
      return buildEpisode({ task, checkpointId });
    },
    compareAgainstReference,
    buildReplayCandidate({ comparison }) {
      return {
        replay_route: comparison.replay_route,
        training_admission: comparison.replay_route !== 'diagnostic_only',
      };
    },
    summarizeEnvironmentEvidence({ episode, comparison }) {
      return {
        task_family: episode.task_family,
        comparison_status: comparison?.comparison_status || episode.comparison_status,
        relative_outcome: comparison?.relative_outcome ?? episode.relative_outcome ?? null,
      };
    },
  };
}
