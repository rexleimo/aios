/* 中文注释：entropy-gc 参数规划只处理命令选项，不扫描 ContextDB 文件。 */
import {
  createDefaultEntropyGcOptions,
  normalizeEntropyGcFormat,
  normalizeEntropyGcMode,
} from '../options.mjs';
import { parsePositiveInteger } from './shared.mjs';

export function normalizeEntropyGcOptions(rawOptions = {}) {
  const defaults = createDefaultEntropyGcOptions();
  const sessionId = String(rawOptions.sessionId ?? defaults.sessionId).trim();
  const mode = normalizeEntropyGcMode(rawOptions.mode ?? defaults.mode);
  const retain = parsePositiveInteger(rawOptions.retain, defaults.retain);
  const minAgeHours = parsePositiveInteger(rawOptions.minAgeHours, defaults.minAgeHours);
  const format = normalizeEntropyGcFormat(rawOptions.format ?? defaults.format);

  if (!sessionId && mode !== 'off') {
    throw new Error('entropy-gc requires --session unless mode=off');
  }

  return {
    sessionId,
    mode,
    retain,
    minAgeHours,
    format,
  };
}

export function planEntropyGc(rawOptions = {}) {
  const options = normalizeEntropyGcOptions(rawOptions);
  const args = ['entropy-gc', options.mode];
  if (options.sessionId) {
    args.push('--session', options.sessionId);
  }
  if (options.retain !== 5) {
    args.push('--retain', String(options.retain));
  }
  if (options.minAgeHours !== 24) {
    args.push('--min-age-hours', String(options.minAgeHours));
  }
  if (options.format !== 'text') {
    args.push('--format', options.format);
  }
  return {
    command: 'entropy-gc',
    options,
    preview: `node scripts/aios.mjs ${args.join(' ')}`,
  };
}
