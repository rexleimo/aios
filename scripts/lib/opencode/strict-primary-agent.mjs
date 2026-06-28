import {
  AIOS_NATIVE_BEGIN_MARK,
  AIOS_NATIVE_END_MARK,
} from '../native/emitters/shared.mjs';

export const OPENCODE_STRICT_PRIMARY_AGENT_NAME = 'aios-build';
export const OPENCODE_STRICT_PRIMARY_AGENT_PATH = `.opencode/agent/${OPENCODE_STRICT_PRIMARY_AGENT_NAME}.md`;

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

export function buildOpenCodeStrictAgentArgs(extraArgs = []) {
  return [
    '--agent',
    OPENCODE_STRICT_PRIMARY_AGENT_NAME,
    ...withoutOpenCodeAgentArgs(extraArgs),
  ];
}

export function renderOpenCodeStrictPrimaryAgent() {
  return [
    '---',
    `name: ${OPENCODE_STRICT_PRIMARY_AGENT_NAME}`,
    'description: "AIOS strict primary agent that enforces skills, ContextDB turn compression, and verification gates."',
    'mode: primary',
    '---',
    '',
    AIOS_NATIVE_BEGIN_MARK,
    '# AIOS Strict OpenCode Agent',
    '',
    'You are the mandatory AIOS build agent for OpenCode in this repository.',
    '',
    'Hard requirements:',
    '- First action: invoke `using-superpowers` before any response or action.',
    '- Follow the routed process skill exactly; do not paraphrase or inline Superpowers workflows.',
    '- Before any edit, invoke `pre-edit-safety-gate` and write tests first when coverage is missing.',
    '- Before claiming completion, invoke `verification-before-completion` and report fresh evidence only.',
    '- Keep live work inside the AIOS-managed runner so pre_send and post_receive compression both run.',
    '',
    'OpenCode skill name resolution:',
    '- Prefer canonical names when available.',
    '- If OpenCode exposes Superpowers without the namespace, resolve `superpowers:brainstorming` -> `brainstorming`.',
    '- Apply the same plain-name fallback for `superpowers:writing-plans`, `superpowers:systematic-debugging`, `superpowers:test-driven-development`, and `superpowers:verification-before-completion`.',
    '',
    'Fail-closed rule:',
    '- If a required skill is unavailable, stop and report the missing skill instead of continuing ad hoc.',
    '- If AIOS turn compression is bypassed or direct native execution is blocked, restart through the AIOS-managed runner.',
    '',
    AIOS_NATIVE_END_MARK,
    '',
  ].join('\n');
}
