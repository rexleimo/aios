const DEFAULT_BOUNDARY_PATTERNS = Object.freeze([
  { label: 'auth boundary', pattern: /\b(auth|authentication|authorize|authorization|login|oauth|token|credential|api[- ]?key|session cookie|secret)\b/i },
  { label: 'payment boundary', pattern: /\b(payment|billing|invoice|charge|refund|payout|stripe|paypal|card)\b/i },
  { label: 'policy boundary', pattern: /\b(policy|compliance|privacy|legal|regulation|gdpr|hipaa|soc2|pci)\b/i },
]);

const DEFAULT_SENSITIVE_COMMAND_PATTERNS = Object.freeze([
  { label: 'sudo command', pattern: /\bsudo\s+\S+/i },
  { label: 'rm -rf command', pattern: /\brm\s+-rf\b/i },
  { label: 'git push', pattern: /\bgit\s+push\b/i },
  { label: 'npm publish', pattern: /\bnpm\s+publish\b/i },
]);

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function evaluateHumanGate({ taskText, enabled = true, allowRisk = false } = {}) {
  const text = normalizeText(taskText);
  if (!enabled) {
    return { allowed: true, reasons: [] };
  }
  if (allowRisk) {
    return { allowed: true, reasons: [] };
  }
  const reasons = [];

  for (const boundary of DEFAULT_BOUNDARY_PATTERNS) {
    if (boundary.pattern.test(text)) {
      reasons.push(`potential ${boundary.label} detected in task text`);
    }
  }
  for (const command of DEFAULT_SENSITIVE_COMMAND_PATTERNS) {
    if (command.pattern.test(text)) {
      reasons.push(`potential ${command.label} detected in task text`);
    }
  }

  return {
    allowed: reasons.length === 0,
    reasons,
  };
}

