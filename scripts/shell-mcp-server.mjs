#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const SHELL_TOOL = {
  name: 'aios_shell',
  description: 'Execute shell commands with automatic output compression via AIOS MCP proxy. Use this instead of the host Bash tool for all non-interactive commands. Output is compressed to save context tokens while preserving errors, key lines, and actionable data. Supports environment variable prefixes, chained commands with && and ||, and common shell operations.',
  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'Shell command to execute',
      },
      cwd: {
        type: 'string',
        description: 'Working directory (defaults to project root or CWD)',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds (default: 120000)',
      },
    },
    required: ['command'],
  },
};

function makeResponse(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function makeError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function executeCommand(command, cwd, timeout) {
  return new Promise((resolve) => {
    const limit = Math.min(Math.max(timeout || 120000, 1000), 300000);
    let killed = false;
    const child = spawn(process.platform === 'win32' ? 'cmd' : '/bin/sh', [
      process.platform === 'win32' ? '/c' : '-c',
      command,
    ], {
      cwd: cwd || process.cwd(),
      env: { ...process.env },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const timer = setTimeout(() => {
      killed = true;
      child.kill('SIGTERM');
      setTimeout(() => {
        try { child.kill('SIGKILL'); } catch {}
      }, 5000);
    }, limit);

    const stdout = [];
    const stderr = [];
    child.stdout?.on('data', (chunk) => stdout.push(chunk));
    child.stderr?.on('data', (chunk) => stderr.push(chunk));

    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ stdout: '', stderr: error.message, exitCode: 1 });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        exitCode: killed ? -1 : (code ?? 0),
        timedOut: killed,
      });
    });
  });
}

async function handleToolsCall(id, params) {
  const { command, cwd, timeout } = params || {};
  if (!command || typeof command !== 'string') {
    return makeError(id, -32602, 'Missing or invalid "command" parameter');
  }

  const result = await executeCommand(command.trim(), cwd, timeout);
  const content = [];

  if (result.exitCode !== 0) {
    content.push({
      type: 'text',
      text: `Exit code: ${result.exitCode}${result.timedOut ? ' (timed out)' : ''}\n${result.stderr}\n${result.stdout}`,
    });
  } else if (result.stderr) {
    content.push(
      { type: 'text', text: result.stdout },
      { type: 'text', text: `[stderr] ${result.stderr}` },
    );
  } else {
    content.push({ type: 'text', text: result.stdout });
  }

  return makeResponse(id, { content });
}

async function handleMessage(message) {
  if (!message || typeof message.id === 'undefined') return undefined;

  if (message.method === 'initialize') {
    return makeResponse(message.id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'aios-shell', version: '1.0.0' },
    });
  }

  if (message.method === 'tools/list') {
    return makeResponse(message.id, { tools: [SHELL_TOOL] });
  }

  if (message.method === 'tools/call') {
    const toolName = message?.params?.name;
    if (toolName === 'aios_shell') {
      return handleToolsCall(message.id, message.params?.arguments || message.params);
    }
    return makeError(message.id, -32601, `Unknown tool: ${toolName}`);
  }

  if (message.method === 'notifications/initialized' || message.method === 'ping') {
    return message.method === 'ping' ? makeResponse(message.id, {}) : undefined;
  }

  return makeResponse(message.id, { capabilities: {}, tools: [] });
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('shell-mcp-server.mjs')) {
  const lines = createInterface({ input: process.stdin });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null })}\n`);
      continue;
    }
    const response = await handleMessage(message);
    if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
  }
}

export { handleMessage, executeCommand, SHELL_TOOL };
