/**
 * Commands that forward their remaining argv to **another runtime** and therefore
 * must not pre-validate options here: the child binary owns that contract, and a
 * flag AIOS cannot know about is not an AIOS usage error.
 *
 * 中文注释（2026-10-27）：这份名单是**声明**，不是测试里的临时豁免。它的规模被测试上限钉住
 * （`passthrough size <= 4`），因为“为了变绿而加豁免”正是假通过的形状——新增条目必须带上
 * “谁转发、转发给谁”的真实理由，由 `scripts/tests/execution/aios-cli/cli-usage-error-exit.test.mjs`
 * 的反面断言守住：名单外的任何命令接受未知 flag 还退 0，就是缺陷。
 */
export const PASSTHROUGH_COMMANDS = new Set([
  // `aios rex …` is a thin launcher for the rex-harness CLI; its options belong to that CLI.
  'rex',
]);

/**
 * Declared, shrink-only debt ledger: commands whose parser still swallows a
 * usage failure instead of rejecting it. They are NOT silently excused - the
 * guard test asserts every offender must appear here, and that the set only
 * ever gets smaller. Adding a name requires making the parser strict first.
 *
 * 中文注释（2026-10-27）：这一项来自 P0 基线。把未完面写成名单而不是把断言改松，
 * 是因为“假绿”与“真修”的区别就在于：旧行为是否仍然可被机器发现。
 */
export const UNKNOWN_OPTION_STRICTNESS_DEFERRED = new Set([
  'agents',
  'canvas',
  'clients',
  'harness',
  'integration',
  'interception',
  'judgment',
  'model-router',
  'perception',
  'refs',
  'skill',
  'workflow',
]);

export function isPassthroughCommand(name = '') {
  return PASSTHROUGH_COMMANDS.has(String(name).trim().toLowerCase());
}

/** True when this command is expected to reject an unknown option right now. */
export function mustRejectUnknownOption(name = '') {
  const key = String(name).trim().toLowerCase();
  return !isPassthroughCommand(key) && !UNKNOWN_OPTION_STRICTNESS_DEFERRED.has(key);
}

/**
 * One owner for the question every parser had to answer but kept re-deriving:
 * is this thrown error a help/version display (a successful interaction) or a
 * usage failure (a rejected invocation)?
 */
const HELP_DISPLAY_CODES = new Set(['commander.helpDisplayed', 'commander.help', 'commander.version']);

export function isHelpDisplay(error) {
  return HELP_DISPLAY_CODES.has(String(error?.code || ''));
}

/**
 * Normalize a parse failure into a canonical usage error so the process boundary
 * can (a) exit non-zero and (b) print help instead of a stack trace.
 */
export function toUsageError(error, { command = '' } = {}) {
  if (error?.usage === true) return error;
  const raw = String(error?.message || error || 'invalid usage').replace(/^error:\s*/iu, '');
  const usage = new Error(`error: ${raw}${command && !raw.includes(command) ? ` [${command}]` : ''}`);
  usage.usage = true;
  usage.cause = error;
  return usage;
}
