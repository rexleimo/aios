import path from 'node:path';

import { captureCommand, runCommand } from '../platform/process.mjs';

export const HEADROOM_PACKAGE_SPEC = 'headroom-ai[all]>=0.31.0,<0.32.0';

const SMOKE_ARGS = Object.freeze([
  Object.freeze(['--version']),
  Object.freeze(['--help']),
  Object.freeze(['wrap', '--help']),
  Object.freeze(['mcp', 'serve', '--help']),
]);

export function parseHeadroomVersion(text = '') {
  const match = /(?:^|\s)(\d+)\.(\d+)\.(\d+)(?:\s|$)/u.exec(String(text));
  return match ? match.slice(1, 4).map(Number) : null;
}

export function isSupportedHeadroomVersion(text = '') {
  const version = Array.isArray(text) ? text : parseHeadroomVersion(text);
  return Boolean(version && version[0] === 0 && version[1] === 31 && version[2] >= 0);
}

function isSupportedPythonVersion(text = '') {
  const version = parseHeadroomVersion(text);
  return Boolean(version && (version[0] > 3 || (version[0] === 3 && version[1] >= 10)));
}

export function buildHeadroomInstallPlan(probe = {}) {
  if (probe.installedVersion && !isSupportedHeadroomVersion(probe.installedVersion)) {
    return { status: 'unsupported-version', installedVersion: probe.installedVersion };
  }
  if (probe.installedVersion) return { status: 'installed', installedVersion: probe.installedVersion };
  if (!isSupportedPythonVersion(probe.pythonVersion)) {
    return { status: 'unsupported-platform', reason: 'python>=3.10-required' };
  }
  if (probe.uvAvailable) return { status: 'missing', command: 'uv', args: ['tool', 'install', HEADROOM_PACKAGE_SPEC] };
  if (probe.pipxAvailable) return { status: 'missing', command: 'pipx', args: ['install', HEADROOM_PACKAGE_SPEC] };
  return { status: 'unsupported-platform', reason: 'uv-or-pipx-required' };
}

export function probeHeadroom({ captureImpl = captureCommand, env = process.env } = {}) {
  const headroom = captureImpl('headroom', ['--version'], { env, timeoutMs: 5000 });
  const installedVersion = headroom.status === 0
    ? parseHeadroomVersion(`${headroom.stdout}\n${headroom.stderr}`)?.join('.') || ''
    : '';
  const python = captureImpl('python3', ['--version'], { env, timeoutMs: 5000 });
  const uv = captureImpl('uv', ['--version'], { env, timeoutMs: 5000 });
  const pipx = captureImpl('pipx', ['--version'], { env, timeoutMs: 5000 });
  return {
    status: installedVersion ? 'installed' : 'missing',
    installedVersion,
    pythonVersion: parseHeadroomVersion(`${python.stdout}\n${python.stderr}`)?.join('.') || '',
    uvAvailable: uv.status === 0,
    pipxAvailable: pipx.status === 0,
  };
}

function resolveHeadroomExecutable({ captureImpl = captureCommand, env = process.env } = {}) {
  const resolver = process.platform === 'win32'
    ? { command: 'where.exe', args: ['headroom'] }
    : { command: 'which', args: ['headroom'] };
  const resolved = captureImpl(resolver.command, resolver.args, { env, timeoutMs: 5000 });
  const executable = String(resolved.stdout || '')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => path.isAbsolute(line));
  return executable || '';
}

function smokeHeadroom({ captureImpl = captureCommand, env = process.env } = {}) {
  return SMOKE_ARGS.map((args) => ({
    args: [...args],
    ...captureImpl('headroom', [...args], { env, timeoutMs: 15000 }),
  }));
}

function buildInstalledHeadroomResult(smoke, { captureImpl = captureCommand, env = process.env } = {}) {
  const versionText = `${smoke[0]?.stdout || ''}\n${smoke[0]?.stderr || ''}`;
  if (smoke.some((item) => item.status !== 0)) return { status: 'failed', smoke };
  if (!isSupportedHeadroomVersion(versionText)) return { status: 'unsupported-version', smoke };
  const executable = resolveHeadroomExecutable({ captureImpl, env });
  if (!executable) return { status: 'failed', reason: 'headroom-executable-not-found', smoke };
  return {
    status: 'installed',
    executable,
    version: parseHeadroomVersion(versionText).join('.'),
    smoke,
  };
}

export async function ensureHeadroomInstalled({
  dryRun = false,
  probe = null,
  env = process.env,
  captureImpl = captureCommand,
  runImpl = async (command, args) => runCommand(command, args, { env }),
} = {}) {
  const detected = probe || probeHeadroom({ captureImpl, env });
  const plan = buildHeadroomInstallPlan(detected);
  if (plan.status === 'installed') {
    const smoke = smokeHeadroom({ captureImpl, env });
    return buildInstalledHeadroomResult(smoke, { captureImpl, env });
  }
  if (plan.status !== 'missing') return plan;
  if (dryRun) return { ...plan, planned: true };

  try {
    await runImpl(plan.command, plan.args);
  } catch (error) {
    return { status: 'failed', reason: error instanceof Error ? error.message : String(error) };
  }

  return buildInstalledHeadroomResult(smokeHeadroom({ captureImpl, env }), { captureImpl, env });
}
