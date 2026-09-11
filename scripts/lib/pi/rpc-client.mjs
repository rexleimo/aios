// scripts/lib/pi/rpc-client.mjs — Pi `--mode rpc` JSONL driver.
// Speaks Pi's stdin/stdout protocol (LF-delimited JSON, request/response
// correlation by id, async agent events, extension_ui sub-protocol) so the
// AIOS managed runner can drive Pi as a long-lived session instead of
// one-shot `-p` spawns. All process access is injected (spawnImpl) for tests.
import { spawn } from 'node:child_process';

const DEFAULT_RESPONSE_TIMEOUT_MS = 60000;
const DEFAULT_SETTLED_TIMEOUT_MS = 120000;

// Split on \n ONLY (never generic line readers: U+2028/29 are legal in JSON
// strings). Accept optional \r\n by stripping one trailing \r.
export function createJsonlFramer({ onRecord, onParseError } = {}) {
  let buffer = '';
  const handleLine = (line) => {
    const clean = line.endsWith('\r') ? line.slice(0, -1) : line;
    if (!clean) return;
    try {
      onRecord?.(JSON.parse(clean));
    } catch (error) {
      onParseError?.({ line: clean, error });
    }
  };
  return {
    push(chunk) {
      buffer += String(chunk ?? '');
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        handleLine(buffer.slice(0, index));
        buffer = buffer.slice(index + 1);
        index = buffer.indexOf('\n');
      }
    },
    flush() {
      if (buffer.length > 0) {
        const rest = buffer;
        buffer = '';
        handleLine(rest);
      }
    },
  };
}

function nextId(prefix, counter) {
  counter.n += 1;
  return `${prefix}-${counter.n}`;
}

// Fail-closed UI approver: every dialog is cancelled unless the caller
// supplies an approver that explicitly allows it.
export async function defaultUiApprover() {
  return { cancelled: true };
}

function buildUiResponse(request, payload) {
  return { type: 'extension_ui_response', id: request.id, ...payload };
}

export function createPiRpcSession({
  spawnImpl = spawn,
  command = 'pi',
  args = ['--mode', 'rpc', '--no-session'],
  env = process.env,
  responseTimeoutMs = DEFAULT_RESPONSE_TIMEOUT_MS,
  onEvent = null,
  onParseError = null,
  approver = defaultUiApprover,
  io = null,
} = {}) {
  const counter = { n: 0 };
  const pending = new Map();
  const settledWaiters = [];
  let child = null;
  let framer = null;
  let closed = false;

  function settleWaiters() {
    while (settledWaiters.length > 0) {
      const waiter = settledWaiters.shift();
      clearTimeout(waiter.timer);
      waiter.resolve();
    }
  }

  function failAll(error) {
    for (const [, waiter] of pending) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    pending.clear();
    while (settledWaiters.length > 0) {
      const waiter = settledWaiters.shift();
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }

  async function handleUiRequest(request) {
    const method = request.method;
    if (method === 'notify' || method === 'setStatus' || method === 'setWidget' || method === 'setTitle' || method === 'set_editor_text') {
      io?.log?.(`[pi-rpc] ui:${method} ignored (fire-and-forget)`);
      return;
    }
    let payload;
    try {
      payload = (await approver({ method, title: request.title, options: request.options, request })) || { cancelled: true };
    } catch {
      payload = { cancelled: true };
    }
    writeRecord(buildUiResponse(request, payload));
  }

  function handleRecord(record) {
    if (!record || typeof record !== 'object') return;
    if (record.type === 'response') {
      const waiter = record.id !== undefined ? pending.get(record.id) : null;
      if (waiter) {
        pending.delete(record.id);
        clearTimeout(waiter.timer);
        waiter.resolve(record);
      }
      return;
    }
    if (record.type === 'extension_ui_request') {
      void handleUiRequest(record);
      return;
    }
    if (record.type === 'agent_settled') settleWaiters();
    onEvent?.(record);
  }

  function writeRecord(obj) {
    if (!child || closed) throw new Error('pi RPC session is not running');
    child.stdin.write(`${JSON.stringify(obj)}\n`);
  }

  function sendCommand(command) {
    const id = command.id !== undefined ? command.id : nextId('aios', counter);
    const payload = { ...command, id };
    return new Promise((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        rejectPromise(new Error(`pi RPC response timeout: ${payload.type} (id ${id})`));
      }, responseTimeoutMs);
      pending.set(id, { resolve: resolvePromise, reject: rejectPromise, timer });
      try {
        writeRecord(payload);
      } catch (error) {
        pending.delete(id);
        clearTimeout(timer);
        rejectPromise(error);
      }
    });
  }

  return {
    start() {
      if (child) throw new Error('pi RPC session already started');
      child = spawnImpl(command, args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
      framer = createJsonlFramer({ onRecord: handleRecord, onParseError });
      child.stdout.on('data', (chunk) => framer.push(chunk));
      child.stdout.on('end', () => framer.flush());
      child.on('error', (error) => failAll(error));
      child.on('close', (code) => {
        if (!closed) failAll(new Error(`pi RPC process closed (code ${code ?? 'unknown'})`));
      });
      return child;
    },
    get running() {
      return Boolean(child) && !closed;
    },
    sendCommand,
    prompt: (message, { streamingBehavior, images } = {}) => sendCommand({
      type: 'prompt', message, ...(streamingBehavior ? { streamingBehavior } : {}), ...(images ? { images } : {}),
    }),
    steer: (message) => sendCommand({ type: 'steer', message }),
    followUp: (message) => sendCommand({ type: 'follow_up', message }),
    abort: () => sendCommand({ type: 'abort' }),
    getState: () => sendCommand({ type: 'get_state' }),
    getMessages: () => sendCommand({ type: 'get_messages' }),
    getSessionStats: () => sendCommand({ type: 'get_session_stats' }),
    getLastAssistantText: () => sendCommand({ type: 'get_last_assistant_text' }),
    getCommands: () => sendCommand({ type: 'get_commands' }),
    compact: (customInstructions) => sendCommand(customInstructions ? { type: 'compact', customInstructions } : { type: 'compact' }),
    setModel: ({ provider, modelId } = {}) => sendCommand({ type: 'set_model', provider, modelId }),
    newSession: () => sendCommand({ type: 'new_session' }),
    waitSettled({ timeoutMs = DEFAULT_SETTLED_TIMEOUT_MS } = {}) {
      return new Promise((resolvePromise, rejectPromise) => {
        const timer = setTimeout(() => {
          const index = settledWaiters.findIndex((w) => w.resolve === resolvePromise);
          if (index !== -1) settledWaiters.splice(index, 1);
          rejectPromise(new Error('pi RPC settled timeout'));
        }, timeoutMs);
        settledWaiters.push({ resolve: resolvePromise, reject: rejectPromise, timer });
      });
    },
    // One full turn: prompt, wait until Pi settles, return the last text.
    async runPromptFlow(message, { promptOptions = {}, timeoutMs = DEFAULT_SETTLED_TIMEOUT_MS } = {}) {
      const accepted = await this.prompt(message, promptOptions);
      if (!accepted?.success) {
        throw new Error(`pi RPC prompt rejected: ${accepted?.error || 'unknown'}`);
      }
      await this.waitSettled({ timeoutMs });
      const last = await this.getLastAssistantText();
      return { accepted, text: last?.data?.text ?? null, response: last };
    },
    async close() {
      closed = true;
      failAll(new Error('pi RPC session closed by client'));
      try {
        child?.kill?.();
      } catch {
        // kill is best-effort on an already-dead process.
      }
      child = null;
    },
  };
}
