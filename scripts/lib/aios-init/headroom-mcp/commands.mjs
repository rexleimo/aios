import path from 'node:path';

const SERVER_NAME = 'headroom';
const RUNTIME_COMMANDS = Object.freeze({
  'gemini-cli': 'gemini',
  'hermes-agent': 'hermes',
  'grok-build': 'grok',
});

export function buildDesiredHeadroomEntry(runtimeId, headroomPath) {
  if (!RUNTIME_COMMANDS[runtimeId]) throw new Error(`Unsupported Headroom MCP runtime: ${runtimeId}`);
  if (!headroomPath || !path.isAbsolute(String(headroomPath))) throw new Error('Headroom executable must be absolute');
  return Object.freeze({
    command: String(headroomPath),
    args: Object.freeze(['mcp', 'serve']),
    env: Object.freeze({ HEADROOM_MCP_CLIENT: runtimeId, HEADROOM_MCP_READ: 'off' }),
  });
}

export function buildHeadroomMcpAddInvocation({ runtimeId, headroomPath, profile = '' } = {}) {
  const desired = buildDesiredHeadroomEntry(runtimeId, headroomPath);
  if (runtimeId === 'gemini-cli') {
    return {
      command: 'gemini',
      args: ['mcp', 'add', '--scope', 'user', '-e', `HEADROOM_MCP_CLIENT=${runtimeId}`, '-e', 'HEADROOM_MCP_READ=off', SERVER_NAME, headroomPath, '--', ...desired.args],
    };
  }
  if (runtimeId === 'grok-build') {
    return {
      command: 'grok',
      args: ['mcp', 'add', '--scope', 'user', '-e', `HEADROOM_MCP_CLIENT=${runtimeId}`, '-e', 'HEADROOM_MCP_READ=off', SERVER_NAME, '--', headroomPath, ...desired.args],
    };
  }
  return {
    command: 'hermes',
    args: ['mcp', 'add', SERVER_NAME, ...(profile ? ['--profile', profile] : []), '--command', headroomPath, '--env', `HEADROOM_MCP_CLIENT=${runtimeId}`, 'HEADROOM_MCP_READ=off', '--args', ...desired.args],
  };
}

export function buildHeadroomMcpRemoveInvocation({ runtimeId, profile = '' } = {}) {
  if (runtimeId === 'gemini-cli') return { command: 'gemini', args: ['mcp', 'remove', '--scope', 'user', SERVER_NAME] };
  if (runtimeId === 'grok-build') return { command: 'grok', args: ['mcp', 'remove', '--scope', 'user', SERVER_NAME] };
  if (runtimeId === 'hermes-agent') {
    return { command: 'hermes', args: ['mcp', 'remove', SERVER_NAME, ...(profile ? ['--profile', profile] : [])] };
  }
  throw new Error(`Unsupported Headroom MCP runtime: ${runtimeId}`);
}
