// scripts/lib/skills/sync.mjs — barrel index，re-export 子模块公共 API
// 原文件 481 行拆分为 targets.mjs + run.mjs + check.mjs，此文件只做转发
export { syncGeneratedSkills } from './sync/run.mjs';
export { checkGeneratedSkillsSync } from './sync/check.mjs';
