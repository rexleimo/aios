/**
 * Evolution trigger policy.
 *
 * Decides when consolidation should run based on:
 * - manual: explicit `aios evolution run`
 * - threshold: pending candidate count >= minCandidates
 * - schedule: time since last successful run >= cooldownHours
 *
 * Default config: minCandidates=5, cooldownHours=24
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { resolveMemoRoot } from '../../aios/state-root.mjs';
import { atomicWriteText } from '../../memo/storage/fs-io.mjs';
import { listMemoryCandidates } from '../../memo/storage/candidates.mjs';

const TRIGGER_STATE_FILE = 'trigger-state.json';
const DEFAULT_CONFIG = Object.freeze({
  minCandidates: 5,
  cooldownHours: 24,
});

function evolutionRoot(rootDir, env = process.env) {
  return path.join(resolveMemoRoot(rootDir, { env }), 'evolution');
}

function triggerStatePath(rootDir, env = process.env) {
  return path.join(evolutionRoot(rootDir, env), TRIGGER_STATE_FILE);
}

/**
 * Read the persisted trigger state, or return a default empty state.
 */
export async function readTriggerState(rootDir, env = process.env) {
  try {
    const raw = await fs.readFile(triggerStatePath(rootDir, env), 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { lastRunAt: null, pendingCandidates: 0, lastTrigger: null };
    }
    throw error;
  }
}

/**
 * Write the trigger state atomically.
 */
async function writeTriggerState(rootDir, state, env = process.env) {
  const target = triggerStatePath(rootDir, env);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await atomicWriteText(target, `${JSON.stringify(state, null, 2)}\n`);
  return state;
}

/**
 * Count pending candidates (session-close + memo candidates with status=pending).
 */
export async function countPendingCandidates(rootDir, env = process.env) {
  const candidates = await listMemoryCandidates({ workspaceRoot: rootDir, status: 'pending', env });
  return candidates.length;
}

/**
 * Evaluate the trigger policy and decide what action to take.
 *
 * @param {Object} options
 * @param {string} options.rootDir - Workspace root
 * @param {Object} [options.config] - Override default config
 * @param {string} [options.force] - 'manual' to force run regardless of policy
 * @returns {Object} Trigger decision
 */
export async function evaluateTrigger({
  rootDir,
  config = DEFAULT_CONFIG,
  force = null,
  env = process.env,
} = {}) {
  const state = await readTriggerState(rootDir, env);
  const pendingCandidates = await countPendingCandidates(rootDir, env);
  const now = Date.now();

  // Update pending count in state
  state.pendingCandidates = pendingCandidates;

  // Manual override
  if (force === 'manual') {
    return {
      action: 'run',
      trigger: 'manual',
      pendingCandidates,
      lastRunAt: state.lastRunAt,
      config,
      reason: 'Manual trigger via `aios evolution run`',
    };
  }

  // Threshold check
  if (pendingCandidates >= config.minCandidates) {
    const cooldownMs = config.cooldownHours * 60 * 60 * 1000;
    const lastRunMs = state.lastRunAt ? new Date(state.lastRunAt).getTime() : 0;
    const timeSinceLastRun = now - lastRunMs;

    if (timeSinceLastRun >= cooldownMs || !state.lastRunAt) {
      return {
        action: 'run',
        trigger: 'threshold',
        pendingCandidates,
        lastRunAt: state.lastRunAt,
        config,
        reason: `Pending candidates (${pendingCandidates}) >= threshold (${config.minCandidates}) and cooldown elapsed`,
      };
    }

    // Threshold met but cooldown not elapsed
    const nextEligibleAt = new Date(lastRunMs + cooldownMs).toISOString();
    return {
      action: 'noop',
      trigger: 'cooldown',
      pendingCandidates,
      lastRunAt: state.lastRunAt,
      nextEligibleAt,
      config,
      reason: `Threshold met but cooldown not elapsed. Next eligible at ${nextEligibleAt}`,
    };
  }

  // Schedule check (time-based only, if no candidates but enough time passed)
  const cooldownMs = config.cooldownHours * 60 * 60 * 1000;
  const lastRunMs = state.lastRunAt ? new Date(state.lastRunAt).getTime() : 0;
  const timeSinceLastRun = now - lastRunMs;

  if (timeSinceLastRun >= cooldownMs && state.lastRunAt) {
    return {
      action: 'review',
      trigger: 'schedule',
      pendingCandidates,
      lastRunAt: state.lastRunAt,
      config,
      reason: `Cooldown elapsed since last run. Review pending candidates.`,
    };
  }

  // No trigger conditions met
  const nextEligibleAt = state.lastRunAt
    ? new Date(lastRunMs + cooldownMs).toISOString()
    : null;

  return {
    action: 'noop',
    trigger: 'none',
    pendingCandidates,
    lastRunAt: state.lastRunAt,
    nextEligibleAt,
    config,
    reason: `No trigger conditions met. Need ${config.minCandidates} candidates (have ${pendingCandidates}) or wait until ${nextEligibleAt || 'first run'}`,
  };
}

/**
 * Record that a consolidation run completed successfully.
 */
export async function recordSuccessfulRun(rootDir, env = process.env) {
  const state = await readTriggerState(rootDir, env);
  state.lastRunAt = new Date().toISOString();
  state.lastTrigger = 'run';
  await writeTriggerState(rootDir, state, env);
  return state;
}

/**
 * Update the pending candidate count (called after session finalize).
 */
export async function updatePendingCount(rootDir, env = process.env) {
  const state = await readTriggerState(rootDir, env);
  state.pendingCandidates = await countPendingCandidates(rootDir, env);
  await writeTriggerState(rootDir, state, env);
  return state;
}

export { DEFAULT_CONFIG as EVOLUTION_TRIGGER_DEFAULTS };
