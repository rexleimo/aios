/* 中文注释：clarity gate 常量和风险模式集中维护，避免评估/持久化模块重复定义。 */
export const CLARITY_GATE_EVENT_KIND = 'orchestration.human-gate';
export const MAX_SIGNAL_SAMPLES = 8;
export const CLARITY_NEEDS_INPUT_FAILURE_CATEGORY = 'clarity-needs-input';

export const SENSITIVE_COMMAND_PATTERNS = Object.freeze([
  { id: 'sudo', label: 'sudo command', pattern: /\bsudo\s+\S+/i },
  { id: 'rm-rf', label: 'rm -rf command', pattern: /\brm\s+-rf\b/i },
  { id: 'chmod', label: 'chmod command', pattern: /\bchmod\s+\S+/i },
  { id: 'chown', label: 'chown command', pattern: /\bchown\s+\S+/i },
  { id: 'ssh', label: 'ssh command', pattern: /\bssh\s+\S+/i },
  { id: 'scp', label: 'scp command', pattern: /\bscp\s+\S+/i },
  { id: 'docker-push', label: 'docker push', pattern: /\bdocker\s+push\b/i },
  { id: 'npm-publish', label: 'npm publish', pattern: /\bnpm\s+publish\b/i },
  { id: 'git-push', label: 'git push', pattern: /\bgit\s+push\b/i },
  { id: 'kubectl-apply', label: 'kubectl apply', pattern: /\bkubectl\s+apply\b/i },
  { id: 'terraform-apply', label: 'terraform apply', pattern: /\bterraform\s+apply\b/i },
  { id: 'aws-cli', label: 'aws cli', pattern: /\baws\s+\S+/i },
  { id: 'gcloud-cli', label: 'gcloud cli', pattern: /\bgcloud\s+\S+/i },
  { id: 'az-cli', label: 'az cli', pattern: /\baz\s+\S+/i },
]);

export const BOUNDARY_PATTERNS = Object.freeze([
  { id: 'auth', label: 'auth boundary', pattern: /\b(auth|authentication|authorize|authorization|login|oauth|token|credential|api[- ]?key|session cookie|secret)\b/i },
  { id: 'payment', label: 'payment boundary', pattern: /\b(payment|billing|invoice|charge|refund|payout|stripe|paypal|card)\b/i },
  { id: 'policy', label: 'policy boundary', pattern: /\b(policy|compliance|privacy|legal|regulation|gdpr|hipaa|soc2|pci)\b/i },
]);
