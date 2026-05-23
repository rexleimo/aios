import { createBrowserAdapter } from '../rl-browser-v1/adapter.mjs';
import { runBrowserHoldout } from '../rl-browser-v1/eval-harness.mjs';
import { createOrchestratorAdapter } from '../rl-orchestrator-v1/adapter.mjs';
import { runOrchestratorHoldout } from '../rl-orchestrator-v1/eval-harness.mjs';
import { runShellHoldoutValidation } from '../rl-shell-v1/eval-harness.mjs';
import { createShellMixedAdapter } from './shell-adapter.mjs';

export function createDefaultAdapters({
  overrides = {},
  rootDir = process.cwd(),
  orchestratorHarnessMode = 'fixture',
  orchestratorHarnessOptions = {},
  orchestratorLiveTaskCollector = null,
} = {}) {
  return {
    shell: overrides.shell || createShellMixedAdapter(),
    browser: overrides.browser || createBrowserAdapter(),
    orchestrator: overrides.orchestrator || createOrchestratorAdapter({
      harnessMode: orchestratorHarnessMode,
      harnessOptions: {
        rootDir: orchestratorHarnessOptions.rootDir || rootDir,
        ...orchestratorHarnessOptions,
      },
      liveTaskCollector: orchestratorLiveTaskCollector,
    }),
  };
}

export async function runHoldouts({
  activeEnvironments,
  adapters,
  activeCheckpointId,
  baselineCheckpointId,
  orchestratorHoldoutHarnessMode = 'fixture',
  orchestratorHoldoutHarnessOptions = {},
}) {
  const results = {};
  if (activeEnvironments.includes('shell')) {
    results.shell = await runShellHoldoutValidation({
      checkpointId: activeCheckpointId,
      baselineCheckpointId,
      episodeCount: 20,
    });
  }
  if (activeEnvironments.includes('browser')) {
    const tasks = adapters.browser.loadTasks ? adapters.browser.loadTasks().slice(0, 20) : [];
    results.browser = await runBrowserHoldout({
      tasks,
      checkpointId: activeCheckpointId,
      baselineCheckpointId,
    });
  }
  if (activeEnvironments.includes('orchestrator')) {
    const tasks = adapters.orchestrator.loadTasks ? adapters.orchestrator.loadTasks().slice(0, 20) : [];
    results.orchestrator = await runOrchestratorHoldout({
      tasks,
      checkpointId: activeCheckpointId,
      baselineCheckpointId,
      harnessMode: orchestratorHoldoutHarnessMode,
      harnessOptions: orchestratorHoldoutHarnessOptions,
    });
  }
  return results;
}
