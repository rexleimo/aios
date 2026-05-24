import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { createEnv } from './workspace.mjs';

export function checkForbiddenCommand(command, policy) {
  const lower = command.toLowerCase();
  for (const pattern of policy.forbidden_command_patterns) {
    if (lower.includes(pattern.toLowerCase())) {
      return `Command contains forbidden pattern: ${pattern}`;
    }
  }
  if (policy.network_access === false && /\b(nc|telnet)\b/i.test(command)) {
    return 'Network access is disabled';
  }
  if (/[;&]\s*$/.test(command) || /\b(nohup|watch|top|less|more|nano|vim)\b/i.test(command)) {
    return 'Interactive or background commands are not allowed';
  }
  const redirectPattern = /(?:^|\s)(?:1>>|2>>|>>|1>|2>|>)(?:\s*)(\S+)/g;
  for (const match of command.matchAll(redirectPattern)) {
    const target = match[1].replace(/^["']|["']$/g, '');
    if (!target) continue;
    if (path.isAbsolute(target)) {
      return 'Command redirect target escapes the temp workspace root';
    }
    if (target.includes('..')) {
      return 'Command redirect target escapes the temp workspace root';
    }
  }
  return null;
}

export function runCommand({ cwd, command, policy }) {
  const result = spawnSync(command, {
    cwd,
    shell: true,
    encoding: 'utf8',
    timeout: policy.max_command_seconds * 1000,
    maxBuffer: policy.max_output_bytes_per_stream * 4,
    env: createEnv(),
  });

  if (result.error && result.error.code === 'ETIMEDOUT') {
    return {
      timedOut: true,
      exitCode: 124,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
    };
  }

  return {
    timedOut: false,
    exitCode: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

export function collectFailingTests(output) {
  const failures = [];
  for (const rawLine of String(output || '').split('\n')) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const isDefaultNodeFailure = line.startsWith('✖ ') && !line.toLowerCase().includes('failing tests');
    const isTapFailure = line.startsWith('not ok ');
    const isAssertionFailure = line.includes('ERR_ASSERTION') || line.includes('AssertionError') || line.includes('ERR_TEST_FAILURE');
    if (isDefaultNodeFailure || isTapFailure || isAssertionFailure) {
      failures.push(line);
    }
  }
  return failures;
}

export function normalizeFailureLabel(line) {
  return String(line || '')
    .replace(/^not ok\s+\d+\s*-\s*/i, '')
    .replace(/^#\s*/i, '')
    .trim()
    .toLowerCase();
}

export function computeVerificationStatus(observation) {
  if (observation.status === 'timeout') {
    return 'timeout';
  }
  if (observation.status === 'ok' && observation.payload?.exit_code === 0) {
    return 'ok';
  }
  return 'failed';
}
