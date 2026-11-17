// Shared error identity and value predicates for the pure routing domains.
export class ConfigError extends Error {
  constructor(message, path = null) {
    super(message);
    this.name = 'ConfigError';
    this.path = path;
  }
}

export const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
export const lower = (value) => String(value || '').trim().toLowerCase();
