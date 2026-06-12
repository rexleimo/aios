export function buildOpenCodePrompt({ prompt = '' } = {}) {
  return String(prompt || '').trim();
}
