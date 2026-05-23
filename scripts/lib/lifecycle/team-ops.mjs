// Facade：团队运维入口只负责导出命令，具体状态、历史和技能候选职责放到 team-ops/* 子模块。
export { createStatusWatchStallTracker } from './team-ops/shared.mjs';
export { resolveStatusSkillCandidateOptions } from './team-ops/status-options.mjs';
export { runTeamStatus } from './team-ops/status.mjs';
export { runTeamHistory } from './team-ops/history.mjs';
export {
  runTeamSkillCandidatesExport,
  runTeamSkillCandidatesList,
} from './team-ops/skill-candidates.mjs';
