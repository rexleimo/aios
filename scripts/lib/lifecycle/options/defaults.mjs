export function createDefaultSetupOptions() {
  return {
    components: ['browser', 'shell', 'skills', 'native', 'superpowers'],
    wrapMode: 'opt-in',
    client: 'all',
    scope: 'global',
    installMode: 'copy',
    skills: [],
    tokenProfile: 'balanced',
    applyClientCostSettings: false,
    skipPlaywrightInstall: false,
    skipDoctor: false,
  };
}

export function createDefaultUpdateOptions() {
  return {
    selfUpdate: false,
    components: ['browser', 'shell', 'skills', 'native', 'superpowers'],
    wrapMode: 'opt-in',
    client: 'all',
    scope: 'global',
    installMode: 'copy',
    skills: [],
    tokenProfile: 'balanced',
    applyClientCostSettings: false,
    withPlaywrightInstall: false,
    skipDoctor: false,
  };
}

export function createDefaultUninstallOptions() {
  return {
    components: ['shell', 'skills'],
    client: 'all',
    scope: 'global',
    skills: [],
  };
}

export function createDefaultDoctorOptions() {
  return {
    strict: false,
    globalSecurity: false,
    client: 'all',
    profile: 'standard',
    nativeOnly: false,
    verbose: false,
    fix: false,
    dryRun: false,
  };
}

export function createDefaultQualityGateOptions() {
  return {
    mode: 'full',
    profile: 'standard',
    globalSecurity: false,
    sessionId: '',
  };
}

export function createDefaultOrchestrateOptions() {
  return {
    blueprint: '',
    taskTitle: '',
    contextSummary: '',
    planPath: '',
    sessionId: '',
    limit: 10,
    recommendationId: '',
    // 空字符串表示用户没有传参，保留 orchestrate 内部智能默认值。
    dispatchMode: '',
    executionMode: '',
    preflightMode: '',
    format: 'text',
  };
}

export function createDefaultLearnEvalOptions() {
  return {
    sessionId: '',
    limit: 10,
    format: 'text',
    applyDraftId: '',
    applyDrafts: false,
    applyDryRun: false,
  };
}

export function createDefaultEntropyGcOptions() {
  return {
    sessionId: '',
    mode: 'auto',
    retain: 5,
    minAgeHours: 24,
    format: 'text',
  };
}

export function createDefaultSnapshotRollbackOptions() {
  return {
    manifestPath: '',
    sessionId: '',
    jobId: '',
    dryRun: false,
    format: 'text',
  };
}

export function createDefaultReleaseStatusOptions() {
  return {
    statePath: '',
    recent: 10,
    format: 'text',
    strict: false,
    minSamples: 8,
    maxFailureRate: 0.2,
    maxFallbackRate: 0.1,
    wowFailureRateDeltaWarn: 0.05,
    wowFallbackRateDeltaWarn: 0.03,
    outputPath: '',
    historyOutputPath: '',
    historyFormat: 'csv',
    historyDays: 14,
  };
}

export function createDefaultHarnessRunOptions() {
  return {
    subcommand: 'run',
    objective: '',
    sessionId: '',
    workspaceRoot: '',
    provider: 'codex',
    profile: 'standard',
    worktree: false,
    baseRef: 'HEAD',
    maxIterations: 20,
    lifecycleHooks: true,
    dryRun: false,
    json: false,
  };
}

export function createDefaultHarnessStatusOptions() {
  return {
    subcommand: 'status',
    sessionId: '',
    workspaceRoot: '',
    json: false,
  };
}

export function createDefaultHarnessResumeOptions() {
  return {
    subcommand: 'resume',
    sessionId: '',
    workspaceRoot: '',
    maxIterations: 20,
    lifecycleHooks: true,
    json: false,
  };
}

export function createDefaultHarnessStopOptions() {
  return {
    subcommand: 'stop',
    sessionId: '',
    workspaceRoot: '',
    json: false,
    reason: 'operator-request',
  };
}
