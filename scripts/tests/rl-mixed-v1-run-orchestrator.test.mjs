import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('mixed campaign reports multi-environment batches and deterministic epoch outcomes', async () => {
  const mod = await import('../lib/rl-mixed-v1/run-orchestrator.mjs');
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-rl-mixed-'));

  const result = await mod.runMixedCampaign({
    rootDir,
    activeEnvironments: ['shell', 'browser', 'orchestrator'],
    batchTargetCount: 3,
    onlineBatchSize: 4,
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.summary.environment_counts.shell > 0, true);
  assert.equal(result.summary.environment_counts.browser > 0, true);
  assert.equal(result.summary.environment_counts.orchestrator > 0, true);
  assert.equal(result.summary.mixed_batch_count >= 3, true);
  assert.equal(result.summary.bandit_policy_state.update_count > 0, true);
  assert.equal(result.summary.bandit_policy_state.context_count > 0, true);
  assert.equal(result.summary.batch_combinations.includes('browser+orchestrator'), true);
  assert.equal(
    result.summary.batch_combinations.some((combo) => combo === 'browser+shell' || combo === 'orchestrator+shell'),
    true
  );

  assert.equal(
    mod.computeMixedEpochOutcome({
      coverage_sufficient: false,
      shell_safety_gate_passed: true,
      comparison_failed_count: 0,
      degradation_streak: 0,
    }).epoch_outcome,
    'replay_only'
  );
  assert.equal(
    mod.computeMixedEpochOutcome({
      coverage_sufficient: true,
      shell_safety_gate_passed: false,
      comparison_failed_count: 0,
      degradation_streak: 0,
    }).epoch_outcome,
    'replay_only'
  );
  assert.equal(
    mod.computeMixedEpochOutcome({
      coverage_sufficient: true,
      shell_safety_gate_passed: true,
      comparison_failed_count: 1,
      degradation_streak: 0,
    }).epoch_outcome,
    'replay_only'
  );
  assert.equal(
    mod.computeMixedEpochOutcome({
      coverage_sufficient: true,
      shell_safety_gate_passed: true,
      comparison_failed_count: 0,
      degradation_streak: 3,
    }).epoch_outcome,
    'rollback'
  );
});

test('mixed campaign computes orchestrator bandit reward from success, rollback, and human handoff rates', async () => {
  const mod = await import('../lib/rl-mixed-v1/run-orchestrator.mjs');
  const reward = mod.computeOrchestratorBanditReward({
    episode: {
      environment: 'orchestrator',
      decision_type: 'dispatch',
      verification_result: 'passed',
      handoff_triggered: false,
      terminal_outcome: 'success',
      terminal_reward: 1,
    },
    batchOrchestratorEpisodes: [
      { terminal_outcome: 'success', handoff_triggered: false },
      { terminal_outcome: 'failed', handoff_triggered: true },
    ],
    historical: {
      updatesCompleted: 4,
      rollbacksCompleted: 1,
    },
  });

  assert.equal(Number(reward.signals.success_rate.toFixed(3)), 0.5);
  assert.equal(Number(reward.signals.rollback_rate.toFixed(3)), 0.25);
  assert.equal(Number(reward.signals.human_handoff_rate.toFixed(3)), 0.5);
  assert.equal(Number(reward.reward.toFixed(3)), 0.5);
});

test('mixed campaign exposes rollback and resume drills', async () => {
  const mod = await import('../lib/rl-mixed-v1/run-orchestrator.mjs');
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-rl-mixed-'));

  const rollback = await mod.runMixedCampaign({
    rootDir,
    mode: 'drill-rollback',
    activeEnvironments: ['shell', 'browser', 'orchestrator'],
    batchTargetCount: 1,
  });
  assert.equal(rollback.summary.drills.rollback.degradation_streak >= 3, true);
  assert.equal(rollback.summary.drills.rollback.rollback_event_ids[0].startsWith('rollback-completed-'), true);
  assert.equal(typeof rollback.summary.drills.rollback.active_checkpoint_id, 'string');
  assert.equal(rollback.summary.drills.rollback.control_mode, 'collection');

  const resume = await mod.runMixedCampaign({
    rootDir,
    mode: 'drill-resume',
    activeEnvironments: ['shell', 'browser', 'orchestrator'],
    resume: true,
  });
  assert.equal(resume.summary.drills.resume.duplicateEventApplications, 0);
  assert.equal(typeof resume.summary.drills.resume.active_checkpoint_id, 'string');
});

test('mixed campaign persists and reloads contextual bandit policy checkpoints', async () => {
  const mod = await import('../lib/rl-mixed-v1/run-orchestrator.mjs');
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-rl-mixed-'));

  const first = await mod.runMixedCampaign({
    rootDir,
    activeEnvironments: ['orchestrator'],
    batchTargetCount: 2,
    onlineBatchSize: 2,
  });
  assert.equal(first.status, 'ok');
  assert.equal(first.summary.policy_checkpoint.save_status, 'written');
  assert.equal(first.summary.policy_checkpoint.path.endsWith('.json'), true);
  assert.equal(first.summary.policy_checkpoint.index_path.endsWith('.json'), true);
  assert.equal(first.summary.policy_checkpoint.available_versions > 0, true);

  const checkpointPath = first.summary.policy_checkpoint.path;
  const payload = JSON.parse(await readFile(checkpointPath, 'utf8'));
  assert.equal(typeof payload.active_policy, 'object');
  assert.equal(Number(payload.update_count) > 0, true);

  const resumed = await mod.runMixedCampaign({
    rootDir,
    activeEnvironments: ['orchestrator'],
    batchTargetCount: 2,
    onlineBatchSize: 2,
    resume: true,
  });
  assert.equal(resumed.summary.policy_checkpoint.load_status, 'loaded');
  assert.equal(resumed.summary.policy_checkpoint.load_target, 'latest');
  assert.equal(
    resumed.summary.bandit_policy_state.update_count > first.summary.bandit_policy_state.update_count,
    true
  );
});

test('mixed campaign safely cold-starts when policy checkpoint is corrupted', async () => {
  const mod = await import('../lib/rl-mixed-v1/run-orchestrator.mjs');
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-rl-mixed-'));

  const first = await mod.runMixedCampaign({
    rootDir,
    activeEnvironments: ['orchestrator'],
    batchTargetCount: 2,
    onlineBatchSize: 2,
  });
  const indexPath = first.summary.policy_checkpoint.index_path;
  const indexPayload = JSON.parse(await readFile(indexPath, 'utf8'));
  const latestVersionId = String(indexPayload.latest_version_id || '');
  const latestVersionEntry = (Array.isArray(indexPayload.versions) ? indexPayload.versions : [])
    .find((entry) => String(entry?.version_id || '') === latestVersionId);
  assert.equal(Boolean(latestVersionEntry?.file_path), true);
  await writeFile(latestVersionEntry.file_path, '{broken-json', 'utf8');

  const resumed = await mod.runMixedCampaign({
    rootDir,
    activeEnvironments: ['orchestrator'],
    batchTargetCount: 2,
    onlineBatchSize: 2,
    resume: true,
  });
  assert.equal(resumed.status, 'ok');
  assert.equal(resumed.summary.policy_checkpoint.load_status, 'corrupt');
  assert.equal(resumed.summary.bandit_policy_state.update_count > 0, true);
});

test('mixed campaign can resume from last-good version target for policy rollback', async () => {
  const mod = await import('../lib/rl-mixed-v1/run-orchestrator.mjs');
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-rl-mixed-'));

  const first = await mod.runMixedCampaign({
    rootDir,
    activeEnvironments: ['orchestrator'],
    batchTargetCount: 3,
    onlineBatchSize: 2,
  });
  const indexPath = first.summary.policy_checkpoint.index_path;
  const indexPayload = JSON.parse(await readFile(indexPath, 'utf8'));
  const versions = Array.isArray(indexPayload.versions) ? indexPayload.versions : [];
  assert.equal(versions.length >= 2, true);
  const previousVersionId = String(versions[versions.length - 2].version_id || '');
  assert.equal(previousVersionId.length > 0, true);
  indexPayload.last_good_version_id = previousVersionId;
  await writeFile(indexPath, `${JSON.stringify(indexPayload, null, 2)}\n`, 'utf8');

  const resumed = await mod.runMixedCampaign({
    rootDir,
    activeEnvironments: ['orchestrator'],
    batchTargetCount: 1,
    onlineBatchSize: 1,
    resume: true,
    policyResumeTarget: 'last-good',
  });
  assert.equal(resumed.status, 'ok');
  assert.equal(resumed.summary.policy_checkpoint.load_status, 'loaded');
  assert.equal(resumed.summary.policy_checkpoint.load_target, 'last-good');
  assert.equal(resumed.summary.policy_checkpoint.loaded_version_id, previousVersionId);
  assert.equal(resumed.summary.policy_checkpoint.rollback_applied, true);
});

test('mixed campaign writes OPE metrics into checkpoint versions and summary', async () => {
  const mod = await import('../lib/rl-mixed-v1/run-orchestrator.mjs');
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-rl-mixed-'));

  const result = await mod.runMixedCampaign({
    rootDir,
    activeEnvironments: ['orchestrator'],
    batchTargetCount: 2,
    onlineBatchSize: 2,
    ope: {
      window_size: 64,
    },
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.summary.ope.window_size > 0, true);
  assert.equal(result.summary.ope.active_policy.sample_count > 0, true);

  const indexPath = result.summary.policy_checkpoint.index_path;
  const indexPayload = JSON.parse(await readFile(indexPath, 'utf8'));
  const latestVersionId = String(indexPayload.latest_version_id || '');
  const latestEntry = (Array.isArray(indexPayload.versions) ? indexPayload.versions : [])
    .find((entry) => String(entry?.version_id || '') === latestVersionId);
  assert.equal(Boolean(latestEntry), true);
  assert.equal(Number(latestEntry.ope.sample_count) > 0, true);
});

test('mixed campaign can consume orchestrator live task collector for real traffic sampling', async () => {
  const mod = await import('../lib/rl-mixed-v1/run-orchestrator.mjs');
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-rl-mixed-'));
  const liveTasks = [
    {
      task_id: 'orch-live-stream-001',
      decision_type: 'dispatch',
      context_snapshot_id: 'ctx-live-stream-1',
      expected_executor: 'local-phase',
      hard_verification_evidence: ['evidence:dispatch:live'],
      available_executors: ['local-phase', 'local-control'],
      available_preflight_actions: ['auth-check', 'doctor'],
      context_state: { blocker_count: 0, requiresHuman: false },
    },
    {
      task_id: 'orch-live-stream-002',
      decision_type: 'retry',
      context_snapshot_id: 'ctx-live-stream-2',
      expected_executor: 'local-phase',
      hard_verification_evidence: ['evidence:retry:live'],
      available_executors: ['local-phase', 'local-control'],
      available_preflight_actions: ['auth-check', 'doctor'],
      context_state: { blocker_count: 1, requiresHuman: false },
    },
  ];

  const result = await mod.runMixedCampaign({
    rootDir,
    activeEnvironments: ['orchestrator'],
    batchTargetCount: 1,
    onlineBatchSize: 2,
    orchestratorLiveTaskCollector: async ({ attempt }) => liveTasks[attempt] || null,
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.summary.orchestrator_task_source, 'live_collector');
  assert.equal(result.summary.environment_counts.orchestrator > 0, true);
});

test('mixed campaign supports reward weight override and auto tuning persistence', async () => {
  const mod = await import('../lib/rl-mixed-v1/run-orchestrator.mjs');
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-rl-mixed-'));

  const result = await mod.runMixedCampaign({
    rootDir,
    mode: 'drill-rollback',
    activeEnvironments: ['shell', 'browser', 'orchestrator'],
    batchTargetCount: 2,
    onlineBatchSize: 4,
    rewardWeights: {
      terminal: 1,
      successRate: 0.5,
      rollbackRate: -0.7,
      humanHandoffRate: -0.4,
      missedHandoff: -0.45,
      verificationBlocked: -0.25,
    },
    rewardAutoTune: {
      enabled: true,
      step: 0.05,
      min_samples: 1,
    },
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.summary.reward_config.latest_tuning.tuned, true);
  assert.equal(result.summary.reward_config.latest_tuning.reason, 'degraded');

  const checkpointPath = result.summary.policy_checkpoint.path;
  const payload = JSON.parse(await readFile(checkpointPath, 'utf8'));
  assert.equal(payload.reward_config.latest_tuning.tuned, true);
  assert.equal(Number(payload.reward_config.weights.rollbackRate) < -0.7, true);
});

test('mixed campaign guardrails emit drift alerts and auto rollback degraded policy versions', async () => {
  const mod = await import('../lib/rl-mixed-v1/run-orchestrator.mjs');
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-rl-mixed-'));

  const seeded = await mod.runMixedCampaign({
    rootDir,
    activeEnvironments: ['shell', 'browser', 'orchestrator'],
    batchTargetCount: 3,
    onlineBatchSize: 4,
  });

  // The namespace root lives under `.aios/` (see ensureNamespaceRoot); read the
  // path the campaign reports instead of hardcoding it, so a namespace move
  // cannot silently turn this into a missing-file test (it did — the path here
  // had been missing the `.aios/` prefix since that move).
  const indexPath = seeded.summary.policy_checkpoint.index_path;
  const indexPayload = JSON.parse(await readFile(indexPath, 'utf8'));
  const versions = Array.isArray(indexPayload.versions) ? indexPayload.versions : [];
  assert.equal(versions.length >= 2, true);
  for (const entry of versions) {
    entry.quality_status = 'healthy';
  }
  indexPayload.last_good_version_id = String(versions[versions.length - 2].version_id || '');
  await writeFile(indexPath, `${JSON.stringify(indexPayload, null, 2)}\n`, 'utf8');

  const degraded = await mod.runMixedCampaign({
    rootDir,
    mode: 'drill-rollback',
    activeEnvironments: ['shell', 'browser', 'orchestrator'],
    batchTargetCount: 1,
    onlineBatchSize: 4,
    resume: true,
    stabilityGuardrails: {
      auto_policy_rollback_on_critical: true,
    },
  });

  assert.equal(degraded.status, 'ok');
  assert.equal(
    degraded.summary.stability_guardrails.alerts.some((alert) => alert.code === 'epoch_rollback'),
    true
  );
  assert.equal(
    degraded.summary.stability_guardrails.alerts.some((alert) => alert.code === 'auto_policy_rollback_applied'),
    true
  );
  assert.equal(degraded.summary.stability_guardrails.auto_policy_rollbacks >= 1, true);
  assert.equal(degraded.summary.policy_checkpoint.rollback_applied, true);
});

test('mixed campaign accepts real orchestrator harness mode for trajectory collection', async () => {
  const mod = await import('../lib/rl-mixed-v1/run-orchestrator.mjs');
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-rl-mixed-'));

  const result = await mod.runMixedCampaign({
    rootDir,
    activeEnvironments: ['orchestrator'],
    batchTargetCount: 2,
    onlineBatchSize: 1,
    orchestratorHarnessMode: 'real',
    orchestratorHarnessOptions: {
      rootDir,
      executionMode: 'dry-run',
      dispatchMode: 'local',
    },
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.summary.environment_counts.orchestrator > 0, true);
  assert.equal(result.summary.bandit_policy_state.update_count > 0, true);
  assert.equal(result.summary.orchestrator_holdout_harness_mode, 'real');
  assert.equal(result.summary.holdout_validation.orchestrator.evaluation_harness_mode, 'real');
});
