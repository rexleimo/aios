export const OPENCODE_DEFAULT_BASH_TIMEOUT_MS = 120_000;

function setDefault(env, key, value) {
  if (Object.prototype.hasOwnProperty.call(env, key) && String(env[key] ?? '').trim()) {
    return;
  }
  env[key] = String(value);
}

export function applyOpenCodeRuntimeDefaults(env = {}, { managed = false } = {}) {
  const next = { ...env };
  setDefault(next, 'OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS', OPENCODE_DEFAULT_BASH_TIMEOUT_MS);

  // AIOS-managed projects already carry canonical OpenCode skills. Avoid reloading
  // the same skills from Claude and .agents compatibility roots.
  if (managed) {
    setDefault(next, 'OPENCODE_DISABLE_EXTERNAL_SKILLS', '1');
  }

  return next;
}