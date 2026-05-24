/* 中文注释：team 默认值集中维护，具体子命令解析器只覆盖自己的字段。 */
import { TEAM_PROVIDER_CLIENT_MAP } from '../shared.mjs';

export function createDefaultTeamOptions() {
  return {
    workers: 3,
    provider: 'codex',
    clientId: TEAM_PROVIDER_CLIENT_MAP.codex,
    blueprint: 'feature',
    taskTitle: '',
    contextSummary: '',
    planPath: '',
    sessionId: '',
    limit: 10,
    recommendationId: '',
    preflightMode: 'none',
    executionMode: 'live',
    resumeSessionId: '',
    retryBlocked: false,
    force: false,
    format: 'text',
    teamSpec: '3:codex',
  };
}

export function createDefaultTeamStatusOptions() {
  return {
    subcommand: 'status',
    provider: 'codex',
    clientId: TEAM_PROVIDER_CLIENT_MAP.codex,
    sessionId: '',
    resumeSessionId: '',
    preset: 'focused',
    watch: false,
    fast: false,
    showSkillCandidates: false,
    skillCandidateView: 'inline',
    skillCandidateLimit: 0,
    exportSkillCandidatePatchTemplate: false,
    draftId: '',
    json: false,
    intervalMs: 1000,
    watchdog: false,
  };
}

export function createDefaultTeamWatchdogOptions() {
  return {
    subcommand: 'watchdog',
    provider: 'codex',
    clientId: TEAM_PROVIDER_CLIENT_MAP.codex,
    sessionId: '',
    resumeSessionId: '',
    workers: 2,
    json: false,
  };
}

export function createDefaultTeamHistoryOptions() {
  return {
    subcommand: 'history',
    provider: 'codex',
    clientId: TEAM_PROVIDER_CLIENT_MAP.codex,
    limit: 10,
    concurrency: 4,
    fast: false,
    qualityFailedOnly: false,
    qualityCategory: '',
    qualityCategoryPrefix: '',
    qualityCategoryPrefixMode: 'any',
    draftId: '',
    since: '',
    status: '',
    json: false,
  };
}

export function createDefaultTeamSkillCandidatesExportOptions() {
  return {
    subcommand: 'skill-candidates',
    action: 'export',
    provider: 'codex',
    clientId: TEAM_PROVIDER_CLIENT_MAP.codex,
    sessionId: '',
    resumeSessionId: '',
    skillCandidateLimit: 0,
    draftId: '',
    outputPath: '',
    json: false,
  };
}
