/* 中文注释：solo journal 文件名和阶段枚举集中维护，避免存储模块散落硬编码。 */
export const RUN_SUMMARY_FILENAME = 'run-summary.json';
export const CONTROL_FILENAME = 'control.json';
export const OBJECTIVE_FILENAME = 'objective.md';
export const OPERATOR_NOTES_FILENAME = 'operator-notes.md';
export const HOOK_EVENTS_FILENAME = 'hook-events.jsonl';
export const SOLO_HARNESS_DIRNAME = 'worker-journal';
export const SOLO_STAGES = new Set(['research', 'requirements', 'planning', 'development', 'validation', 'handoff']);
