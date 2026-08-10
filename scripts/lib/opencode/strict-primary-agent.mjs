import {
  AIOS_NATIVE_BEGIN_MARK,
  AIOS_NATIVE_END_MARK,
} from '../native/emitters/shared.mjs';

export const OPENCODE_STRICT_PRIMARY_AGENT_NAME = 'aios-build';
export const OPENCODE_STRICT_PRIMARY_AGENT_PATH = `.opencode/agent/${OPENCODE_STRICT_PRIMARY_AGENT_NAME}.md`;
export const AIOS_OPENCODE_ENABLE_EXTERNAL_PLUGINS_ENV = 'AIOS_OPENCODE_ENABLE_EXTERNAL_PLUGINS';

function envFlagEnabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

export function shouldUseOpenCodePureMode(env = process.env) {
  return !envFlagEnabled(env[AIOS_OPENCODE_ENABLE_EXTERNAL_PLUGINS_ENV]);
}

export function withoutOpenCodeAgentArgs(extraArgs = []) {
  return extraArgs.filter((arg, index) => {
    if (arg === '--agent') {
      // --agent 的下一个参数也跳过（index 处理在 filter 中不方便，改用 reduce）
      return false;
    }
    if (arg.startsWith('--agent=')) return false;
    // 检查上一个参数是否是 --agent（如果是，说明当前参数是 agent 的值）
    if (index > 0 && extraArgs[index - 1] === '--agent') return false;
    return true;
  });
}

export function buildOpenCodeStrictAgentArgs(extraArgs = [], env = process.env) {
  const cleaned = withoutOpenCodeAgentArgs(extraArgs);
  const pureArgs = shouldUseOpenCodePureMode(env) && !cleaned.includes('--pure')
    ? ['--pure']
    : [];
  return [
    '--agent',
    OPENCODE_STRICT_PRIMARY_AGENT_NAME,
    ...pureArgs,
    ...cleaned,
  ];
}

export function renderOpenCodeStrictPrimaryAgent() {
  return [
    '---',
    `name: ${OPENCODE_STRICT_PRIMARY_AGENT_NAME}`,
    'description: "AIOS primary agent that applies adaptive workflow policy, ContextDB turn compression, and verification gates."',
    'mode: primary',
    '---',
    '',
    AIOS_NATIVE_BEGIN_MARK,
    '# AIOS Strict OpenCode Agent',
    '',
    'You are the mandatory AIOS build agent for OpenCode in this repository.',
    '',
    'Workflow requirements:',
    '- Evaluate the AIOS workflow policy before selecting a skill. It returns `direct`, `guarded`, and `planned` dispositions.',
    '- `direct`: answer or inspect without a persistent plan or fixed skill chain.',
    '- `guarded`: make a small clear change only after `pre-edit-safety-gate`, then run focused verification.',
    '- `planned`: create or reuse one work-item plan, then invoke only the Provider selected by the current Rex Capability Command.',
    '- Before the first edit in one cohesive guarded or planned batch, invoke `pre-edit-safety-gate`; do not repeat it before every file edit.',
    '- Before claiming completion, invoke `verification-before-completion` once and report focused fresh evidence only.',
    '- Keep live work inside the AIOS-managed runner so pre_send and post_receive compression both run.',
    '',
    'Runtime budgets:',
    '- Treat one user request as one bounded work item. Stop and report a blocker after two consecutive tool actions that add no new evidence.',
    '- Use at most three code-review-graph calls per work item. Never follow `next_tool_suggestions` recursively.',
    '- Keep a normal work item below ten changed files. Split larger objectives into explicit batches instead of extending one session indefinitely.',
    '- Give shell commands an explicit timeout when they can block. Use 120 seconds by default and extend only for a known long build or test.',
    '- Close every browser profile after browser work unless the user explicitly asks to keep it open.',
    '',
    'OpenCode provider resolution:',
    '- Prefer the canonical bundled Rex Provider named by the current command.',
    '- Do not substitute compatibility playbooks for a Rex Provider or use them to advance a Rex activation.',
    '',
    'Fail-closed rule:',
    '- If a policy-selected required skill is unavailable, stop and report the missing skill instead of continuing ad hoc. Do not block `direct` work on an unrelated skill.',
    '- If AIOS turn compression is bypassed or direct native execution is blocked, restart through the AIOS-managed runner.',
    '',
    AIOS_NATIVE_END_MARK,
    '',
  ].join('\n');
}
