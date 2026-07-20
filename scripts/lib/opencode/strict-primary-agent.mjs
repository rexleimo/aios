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
    '- Before any edit, invoke `pre-edit-safety-gate` and write tests first when coverage is missing.',
    '- Before claiming completion, invoke `verification-before-completion` and report fresh evidence only.',
    '- Keep live work inside the AIOS-managed runner so pre_send and post_receive compression both run.',
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
