import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

async function persistLane(lane) {
  await writeJson(lane.filePath, {
    count: lane.count,
    episodes: lane.episodes,
  });
}

function createLane(filePath) {
  return {
    filePath,
    count: 0,
    episodes: [],
  };
}

function isTrainingAdmitted(episode) {
  if (typeof episode?.training_admission === 'boolean') {
    return episode.training_admission;
  }
  if (episode?.admission_status === 'admitted') {
    return true;
  }
  if (episode?.admission_status === 'rejected') {
    return false;
  }
  return true;
}

export function classifyReplayRoute(episode) {
  if (
    episode?.comparison_status === 'comparison_failed' ||
    episode?.lifecycle_status === 'update_failed' ||
    episode?.safety_violation === true ||
    episode?.legacy_compatibility?.replayEligible === false
  ) {
    return 'diagnostic_only';
  }
  if (episode?.rollback_batch || episode?.relative_outcome === 'worse') {
    return 'negative';
  }
  if (episode?.comparison_status === 'completed' && episode?.relative_outcome === 'same' && isTrainingAdmitted(episode)) {
    return 'neutral';
  }
  if (episode?.comparison_status === 'completed' && episode?.relative_outcome === 'better') {
    return 'positive';
  }
  return 'diagnostic_only';
}

export async function createReplayPool({ rootDir, namespace = 'rl-core' }) {
  const poolDir = path.join(rootDir, '.aios', 'experiments', namespace, 'replay-pool');
  await mkdir(poolDir, { recursive: true });
  return {
    rootDir,
    namespace,
    poolDir,
    synthetic: createLane(path.join(poolDir, 'synthetic.json')),
    realShadow: createLane(path.join(poolDir, 'real-shadow.json')),
  };
}

export async function addReplayEpisode({ pool, episode }) {
  const hasRoutingMetadata =
    episode?.replay_route !== undefined ||
    episode?.comparison_status !== undefined ||
    episode?.relative_outcome !== undefined ||
    episode?.rollback_batch !== undefined ||
    episode?.lifecycle_status !== undefined;
  const replayRoute = hasRoutingMetadata ? episode?.replay_route || classifyReplayRoute(episode) : null;

  if (
    !episode?.replay_eligible ||
    !isTrainingAdmitted(episode) ||
    episode?.legacy_compatibility?.replayEligible === false ||
    replayRoute === 'diagnostic_only'
  ) {
    return { admitted: false };
  }

  const lane = episode.task_source === 'real_shadow' ? pool.realShadow : pool.synthetic;
  lane.episodes.push({
    ...episode,
    episode_id: episode.episode_id,
    task_source: episode.task_source,
    replay_route: replayRoute,
    replay_priority: Number(episode.replay_priority || 0),
  });
  lane.episodes.sort((left, right) => right.replay_priority - left.replay_priority || left.episode_id.localeCompare(right.episode_id));
  lane.count = lane.episodes.length;
  await persistLane(lane);
  return { admitted: true, lane: episode.task_source };
}

export async function loadReplayPool({ rootDir, namespace = 'rl-core' }) {
  const pool = await createReplayPool({ rootDir, namespace });
  for (const lane of [pool.synthetic, pool.realShadow]) {
    const raw = await readJson(lane.filePath, { count: 0, episodes: [] });
    lane.count = Number(raw.count || 0);
    lane.episodes = Array.isArray(raw.episodes) ? raw.episodes : [];
  }
  return pool;
}

export function sampleReplayBatch({ pool, batchSize = 5, targetRealRatio = 0.6 }) {
  const desiredReal = Math.min(pool.realShadow.count, Math.round(batchSize * targetRealRatio));
  const desiredSynthetic = Math.max(0, batchSize - desiredReal);
  return {
    realShadow: pool.realShadow.episodes.slice(0, desiredReal),
    synthetic: pool.synthetic.episodes.slice(0, desiredSynthetic),
  };
}
