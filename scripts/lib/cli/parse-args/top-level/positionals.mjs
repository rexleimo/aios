/* 中文注释：首个位置参数只对少数顶层命令有意义，单独封装避免主解析器堆 if。 */
import {
  normalizeEntropyGcMode,
  normalizeOrchestratorBlueprint,
  normalizeQualityGateMode,
} from '../shared.mjs';

export function applyTopLevelPositional(command, options, arg, index) {
  if (index !== 0 || String(arg || '').startsWith('-')) {
    return false;
  }
  if (command === 'quality-gate') {
    options.mode = normalizeQualityGateMode(arg);
    return true;
  }
  if (command === 'orchestrate') {
    options.blueprint = normalizeOrchestratorBlueprint(arg);
    return true;
  }
  if (command === 'entropy-gc') {
    options.mode = normalizeEntropyGcMode(arg);
    return true;
  }
  return false;
}
