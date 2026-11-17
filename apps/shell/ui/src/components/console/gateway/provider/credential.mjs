// Display-only helpers for inline API keys. A pasted key is stored in the local
// config but must never be rendered in full in the editor, summaries or confirmations.

/** Mask an inline key, keeping only the last four characters for recognition. */
export function maskCredential(value) {
  const key = String(value || '').trim();
  if (!key) return '';
  if (key.length <= 8) return '•'.repeat(8);
  return `${'•'.repeat(8)}${key.slice(-4)}`;
}

/**
 * Human-readable effective credential for one scope. Inline keys take precedence
 * over env references and are always masked; env refs are shown as-is (not secrets).
 * Returns '' when neither is configured.
 */
export function credentialLabel(scope = {}) {
  const inline = String(scope.apiKey || '').trim();
  if (inline) return `内联密钥 ${maskCredential(inline)}`;
  return String(scope.apiKeyEnv || '').trim();
}

// Mirrors the runtime resolver: account inline > account env ref > provider inline
// > provider env ref. An account env ref, once set, is authoritative (no fallback).
export function effectiveCredential(provider = {}, account) {
  if (account?.apiKey?.trim()) return { apiKey: account.apiKey };
  if (account?.apiKeyEnv?.trim()) return { apiKeyEnv: account.apiKeyEnv };
  if (provider?.apiKey?.trim()) return { apiKey: provider.apiKey };
  return { apiKeyEnv: provider?.apiKeyEnv };
}
