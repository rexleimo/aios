// Pure safety-gate logic for the AIOS Pi extension. No pi imports here:
// every function is a pure function so node --test can verify it directly.

const DANGEROUS_BASH_PATTERNS = Object.freeze([
  { pattern: /\brm\s+[^|;&]*-[a-z]*r[a-z]*f\b/iu, reason: 'rm -rf is blocked by the AIOS safety gate' },
  { pattern: /--no-preserve-root/iu, reason: '--no-preserve-root is blocked by the AIOS safety gate' },
  { pattern: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;/u, reason: 'fork bomb is blocked by the AIOS safety gate' },
  { pattern: /\bmkfs\b/iu, reason: 'mkfs is blocked by the AIOS safety gate' },
  { pattern: /\bdd\b[^|;&]*\bof=\/dev\//iu, reason: 'dd to a device is blocked by the AIOS safety gate' },
]);

// Basenames that must never be overwritten through Pi file tools, plus
// path segments that are never writable (VCS state, dependencies).
const PROTECTED_BASENAMES = Object.freeze(['.env']);
const PROTECTED_SEGMENTS = Object.freeze(['node_modules', '.git']);

function normalizedPathSegments(targetPath) {
  return String(targetPath || '').split(/[\\/]/u).filter(Boolean);
}

export function checkBashCommand(command) {
  const text = String(command || '');
  for (const { pattern, reason } of DANGEROUS_BASH_PATTERNS) {
    if (pattern.test(text)) return { blocked: true, reason };
  }
  return { blocked: false };
}

export function checkWritePath(targetPath) {
  const segments = normalizedPathSegments(targetPath);
  const basename = segments[segments.length - 1] || '';
  if (PROTECTED_BASENAMES.some((name) => basename === name || basename.startsWith(`${name}.`))) {
    return { blocked: true, reason: `writes to ${basename} are blocked by the AIOS safety gate` };
  }
  const hit = segments.find((segment) => PROTECTED_SEGMENTS.includes(segment));
  if (hit) {
    return { blocked: true, reason: `writes under ${hit}/ are blocked by the AIOS safety gate` };
  }
  return { blocked: false };
}

// Decide a Pi tool_call event. Returns undefined to allow, or a Pi
// blocking verdict { block: true, reason, terminate }.
export function decideToolCall({ toolName, input } = {}) {
  if (toolName === 'bash' || toolName === 'powershell') {
    const verdict = checkBashCommand(input?.command);
    if (verdict.blocked) return { block: true, reason: verdict.reason, terminate: true };
    return undefined;
  }
  if (toolName === 'write' || toolName === 'edit') {
    const verdict = checkWritePath(input?.path);
    if (verdict.blocked) return { block: true, reason: verdict.reason, terminate: false };
    return undefined;
  }
  return undefined;
}

export const AIOS_SYSTEM_PROMPT_ADDITION = [
  'AIOS control plane is active in this session.',
  'Workflow: classify each turn as direct (read-only answer), guarded (one reversible local change behind pre-edit-safety-gate), or planned (explicit work item first).',
  'Memory: call aios_memory_recall before continuing prior work; call aios_memory_write for verified conclusions; call aios_memory_checkpoint at milestones.',
  'Safety: destructive commands are blocked by the extension gate; ask before irreversible operations.',
].join('\n');

// Message injected via before_agent_start so the model sees AIOS context
// for this turn even when AGENTS.md concatenation is disabled.
export function buildBeforeAgentStartMessage({ memoryDigest = '' } = {}) {
  const digest = String(memoryDigest || '').trim();
  return {
    customType: 'aios-context',
    content: digest ? `${AIOS_SYSTEM_PROMPT_ADDITION}\n\nMemory digest:\n${digest}` : AIOS_SYSTEM_PROMPT_ADDITION,
    display: false,
  };
}
