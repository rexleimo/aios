// 纯函数：过滤掉客户端未安装这类环境提示，只统计需要处理的 warn 行。
export function countEffectiveWarnLines(input) {
  const lines = Array.isArray(input) ? input : String(input || '').split(/\r?\n/);
  return lines
    .filter((line) => line.startsWith('[warn] '))
    .filter((line) => !/^\[warn\] (codex|claude|gemini|opencode) not found in PATH$/u.test(line))
    .length;
}

export function printCaptured(io, text) {
  for (const line of String(text || '').split(/\r?\n/)) {
    if (line.length > 0) {
      io.log(line);
    }
  }
}

export function logSkippedGate(io, gateId, profile) {
  io.log(`[skip] ${gateId} disabled for profile=${profile}`);
}

export function addDoctorCheck(checks, check) {
  checks.push({
    id: String(check.id || '').trim() || 'unknown',
    item: String(check.item || '').trim() || 'unspecified',
    status: String(check.status || 'unknown').trim() || 'unknown',
    fix: String(check.fix || '').trim() || 'review logs and rerun doctor',
    note: String(check.note || '').trim(),
  });
}

export function printDoctorCheckSummary(io, checks = []) {
  io.log('');
  io.log('Doctor Check Summary');
  io.log('--------------------');
  for (const check of checks) {
    io.log(`[check] ${check.id}`);
    io.log(`  item: ${check.item}`);
    io.log(`  status: ${check.status}`);
    io.log(`  fix: ${check.fix}`);
    if (check.note) {
      io.log(`  note: ${check.note}`);
    }
  }
}
