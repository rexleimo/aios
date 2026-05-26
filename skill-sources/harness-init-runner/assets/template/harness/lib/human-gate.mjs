const DEFAULT_BOUNDARY_PATTERNS = Object.freeze([
  { id: 'auth', label: 'auth boundary', pattern: /\b(auth|authentication|authorize|authorization|login|oauth|token|credential|api[- ]?key|session cookie|secret)\b/i },
  { id: 'payment', label: 'payment boundary', pattern: /\b(payment|billing|invoice|charge|refund|payout|stripe|paypal|card)\b/i },
  { id: 'policy', label: 'policy boundary', pattern: /\b(policy|compliance|privacy|legal|regulation|gdpr|hipaa|soc2|pci)\b/i },
]);

const DEFAULT_SENSITIVE_COMMAND_PATTERNS = Object.freeze([
  { id: 'sudo', label: 'sudo command', pattern: /\bsudo\s+\S+/i },
  { id: 'rm-rf', label: 'rm -rf command', pattern: /\brm\s+-rf\b/i },
  { id: 'git-push', label: 'git push', pattern: /\bgit\s+push\b/i },
  { id: 'npm-publish', label: 'npm publish', pattern: /\bnpm\s+publish\b/i },
]);

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function clipText(value, maxLength = 160) {
  const text = normalizeText(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(1, maxLength - 1))}...`;
}

function isBackgroundHeader(value) {
  return /\b(agents?\.md|instructions?|guidelines?|notes?|context|background|reference|repo(?:sitory)? rules?)\b/i.test(value);
}

function collectActionSamples(text) {
  const lines = String(text || '').split(/\r?\n/u);
  const samples = [];
  let background = false;

  for (const rawLine of lines) {
    const line = normalizeText(rawLine.replace(/^[-*]\s+/, ''));
    if (!line) continue;

    const heading = /^(?:#{1,6}\s*)?(.+?)\s*:?\s*$/.exec(line);
    if (/^#{1,6}\s+/.test(rawLine) && heading) {
      background = isBackgroundHeader(heading[1]);
      continue;
    }

    const labelMatch = /^(user goal|user request|task|objective|goal|next action|planned action)\s*:\s*(.+)$/i.exec(line);
    if (labelMatch) {
      samples.push({ text: labelMatch[2], background: false });
      continue;
    }

    samples.push({ text: line, background: background || isBackgroundHeader(line) });
  }

  return samples.length > 0 ? samples : [{ text: normalizeText(text), background: false }];
}

function isNegatedRiskSample(sample, descriptor) {
  const text = normalizeText(sample).toLowerCase();
  const negationWindows = [
    /\b(do not|don't|never|must not|should not|avoid|without|no need to)\b.{0,120}/gi,
    /.{0,80}\b(not required|not requested|not allowed|disabled)\b.{0,80}/gi,
  ];

  for (const windowPattern of negationWindows) {
    for (const match of text.matchAll(windowPattern)) {
      if (descriptor.pattern.test(match[0])) {
        return true;
      }
    }
  }
  return false;
}

function isExplicitBoundaryAction(sample) {
  return /\b(login|log in|authenticate|authorize|use|enter|rotate|create|change|submit|charge|refund|publish|send|export|share|upload|delete|remove|modify|write|apply)\b/i.test(sample);
}

function buildDecision({ reasons, warnings }) {
  if (reasons.length > 0) return 'approval-required';
  if (warnings.length > 0) return 'warn';
  return 'allow';
}

function buildQuestion(reasons) {
  if (reasons.length === 0) return '';
  return `Please confirm before I continue: may the harness proceed with this sensitive next action? Reason: ${reasons[0]}`;
}

export function evaluateHumanGate({ taskText, enabled = true, allowRisk = false } = {}) {
  if (!enabled) {
    return { allowed: true, decision: 'allow', reasons: [], warnings: [] };
  }
  if (allowRisk) {
    return {
      allowed: true,
      decision: 'allow',
      reasons: [],
      warnings: ['human gate risk override accepted via --allow-risk'],
    };
  }
  const reasons = [];
  const warnings = [];
  const seenReasons = new Set();
  const seenWarnings = new Set();
  const samples = collectActionSamples(taskText);

  const pushUnique = (target, seen, message) => {
    if (seen.has(message)) return;
    seen.add(message);
    target.push(message);
  };

  for (const sample of samples) {
    for (const command of DEFAULT_SENSITIVE_COMMAND_PATTERNS) {
      if (!command.pattern.test(sample.text)) continue;
      const message = `potential ${command.label} detected in next action: "${clipText(sample.text)}"`;
      if (sample.background || isNegatedRiskSample(sample.text, command)) {
        pushUnique(warnings, seenWarnings, `background or negated ${command.label} reference ignored: "${clipText(sample.text)}"`);
        continue;
      }
      pushUnique(reasons, seenReasons, message);
    }

    for (const boundary of DEFAULT_BOUNDARY_PATTERNS) {
      if (!boundary.pattern.test(sample.text)) continue;
      const message = `potential ${boundary.label} detected in next action: "${clipText(sample.text)}"`;
      if (sample.background || isNegatedRiskSample(sample.text, boundary) || !isExplicitBoundaryAction(sample.text)) {
        pushUnique(warnings, seenWarnings, `background ${boundary.label} reference ignored: "${clipText(sample.text)}"`);
        continue;
      }
      pushUnique(reasons, seenReasons, message);
    }
  }

  const decision = buildDecision({ reasons, warnings });
  return {
    allowed: reasons.length === 0,
    decision,
    reasons,
    warnings,
    question: buildQuestion(reasons),
    recommendedAction: reasons.length > 0
      ? 'Pause provider execution until the operator confirms this sensitive action.'
      : 'Continue automatically.',
    resumeHint: reasons.length > 0
      ? 'After explicit approval, rerun the same command with --allow-risk.'
      : '',
  };
}

