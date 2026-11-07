#!/usr/bin/env node
/* 中文注释：AIOS 记忆 MCP server（stdio JSON-RPC，协议形状与 shell-mcp-server.mjs 一致）。
 * 为无 hook 面的客户端（hermes / gemini / workbuddy）提供确定性的记忆入口：
 *   memory_recall     统一搜索（memo + contextdb + plans 等项目源）
 *   memory_write      追加一条 memo 事件（供 turn-recall 检索）
 *   memory_checkpoint 追加 pinned memo（进入 index 的 workspace-memory 召回面）
 * 工作区根：env.AIOS_WORKSPACE_ROOT 优先，缺省 process.cwd()。
 * 安全边界：只做本地读写，无网络；写入不弹确认（用户已拍板：免确认、本地可回滚）。
 */
import { createInterface } from 'node:readline';

const SERVER_INFO = { name: 'aios-memory', version: '1.0.0' };

function resolveWorkspaceRoot(env = process.env) {
  return env.AIOS_WORKSPACE_ROOT || process.cwd();
}

/**
 * 把当前工程记入本机工作区注册表（`~/.aios/workspaces/<key>.json`）。
 *
 * 为什么需要它：注册表自加入起就只产了读端 (`listWorkspaces`) 与测试，**没有任何写者**，
 * 所以 Console 的工作区列表不可能有真数据。而 memo 写入是所有受支持客户端（含无 hook 面的客户端）
 * 都会走的路径，把「这个工程在被 AIOS 用」接在这里，列表就会跟着真实使用变新。
 *
 * 失败不能拖坑记忆写入（后者已完成，前者只是副产品），但**必须被 await**：
 * fire-and-forget 在测试里拿不到确定结果，在生产里也可能随进程退出而丢登记。
 */
async function markWorkspaceSeen(rootDir) {
  try {
    const { recordWorkspace } = await import('./lib/foundation/workspaces/registry.mjs');
    return recordWorkspace({ rootDir });
  } catch {
    return null;
  }
}

function makeResponse(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function makeError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

const TOOLS = [
  {
    name: 'memory_recall',
    description: 'Recall relevant AIOS project memory (memo events, contextdb, plans) for a task. Call this at session start, on resume phrases, and before planning.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search text' },
        limit: { type: 'number', description: 'Max results (default 5)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'memory_write',
    description: 'Append a durable conclusion/fix/preference to AIOS memo. Call when the turn produced a confirmed fact worth remembering.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'One-line durable takeaway' },
        agent: { type: 'string', description: 'Client/agent label (optional)' },
      },
      required: ['text'],
    },
  },
  {
    name: 'memory_checkpoint',
    description: 'Append a pinned checkpoint memo visible in the session-start recall surface. Call before claiming a milestone complete.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Checkpoint summary' },
      },
      required: ['text'],
    },
  },
];

function clip(text, max = 1600) {
  const value = String(text || '').trim();
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

async function handleMemoryRecall(args = {}) {
  const { searchAiosProject } = await import('./lib/memory/search/unified-search.mjs');
  const query = String(args.query || '').trim();
  if (!query) throw new Error('query is required');
  /* 中文注释：searchAiosProject 返回 { query, sources, results } 包装对象，取 .results */
  const payload = await searchAiosProject(resolveWorkspaceRoot(), {
    query,
    limit: Number.isFinite(Number(args.limit)) ? Number(args.limit) : 5,
  });
  const results = Array.isArray(payload) ? payload : (Array.isArray(payload?.results) ? payload.results : []);
  if (results.length === 0) {
    return { content: [{ type: 'text', text: 'No memory hits for this query.' }] };
  }
  const lines = results.map((item, index) => {
    const source = item?.source || item?.kind || 'memory';
    const text = item?.text || item?.snippet || item?.content || '';
    const score = Number.isFinite(Number(item?.score)) ? ` (score ${Number(item.score).toFixed(3)})` : '';
    return `${index + 1}. [${source}]${score} ${clip(text, 400)}`;
  });
  return { content: [{ type: 'text', text: `## AIOS MEMORY RECALL\n${lines.join('\n')}` }] };
}

async function getActiveStorage(root) {
  const { getActiveMemoStorage } = await import('./lib/memory/memo/storage/base/config.mjs');
  return await getActiveMemoStorage(root);
}

async function handleMemoryWrite(args = {}) {
  const { appendMemoEvent } = await import('./lib/memory/memo/storage/events/events-write.mjs');
  const text = String(args.text || '').trim();
  if (!text) throw new Error('text is required');
  const root = resolveWorkspaceRoot();
  const storage = await getActiveStorage(root);
  const event = await appendMemoEvent({
    workspaceRoot: root,
    storage,
    space: 'default',
    text,
    scope: 'project_shared',
    agent: String(args.agent || 'mcp-memory'),
  });
  // 中文注释：写 memo 就是「这个工程在被 AIOS 用」的硬证据。workspace 注册表只产了读端与测试、
  // 零写者，所以 Console 的工作区列表永远是空的。接在这里而不是另开入口：不新增事实源，
  // 只把已有事实多通知一个读者。必须 await：否则测试拿不到确定结果，进程退出时登记会丢。
  await markWorkspaceSeen(root);
  return {
    content: [{
      type: 'text',
      text: `Memo stored: ${event?.eventId || event?.id || 'ok'} — ${clip(text, 200)}`,
    }],
  };
}

async function handleMemoryCheckpoint(args = {}) {
  const { appendPinnedMemo, pinnedServeReceipt, readPinnedMemo } = await import('./lib/memory/memo/storage/govern/pinned.mjs');
  const text = String(args.text || '').trim();
  if (!text) throw new Error('text is required');
  const root = resolveWorkspaceRoot();
  const storage = await getActiveStorage(root);
  const entry = `[checkpoint] ${text}`;
  await appendPinnedMemo(root, { storage, space: 'default', content: entry });
  // checkpoint 同样是一次真实使用，不能只有 memo 面会把工程记进注册表。
  await markWorkspaceSeen(root);
  // 中文注释：与 CLI 面同一回执。旧回复只说“pinned”，而写入永远成功、服务窗口却会丢位——
  // 工具回报必须区分“落盘”与“被注入”，否则调用方会把“成功回复”当成“未来能召回”。
  const receipt = pinnedServeReceipt(await readPinnedMemo(root, { storage, space: 'default' }));
  const window = `window ${receipt.chars}/${receipt.maxChars} chars, ${receipt.entriesIncluded}/${receipt.entriesTotal} entries served`;
  return {
    content: [{
      type: 'text',
      text: receipt.served
        ? `Checkpoint pinned and served: ${clip(text, 200)} (${window})`
        : `Checkpoint written but NOT served: ${clip(text, 200)} (${window}, ${receipt.entriesDropped} older entries not injected) — it will not appear in recall until the lane is trimmed`,
    }],
  };
}

export async function handleMessage(message = {}) {
  if (message.method === 'initialize') {
    return makeResponse(message.id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO,
    });
  }

  if (message.method === 'tools/list') {
    return makeResponse(message.id, { tools: TOOLS });
  }

  if (message.method === 'tools/call') {
    const toolName = message?.params?.name;
    const args = message?.params?.arguments || {};
    try {
      if (toolName === 'memory_recall') return makeResponse(message.id, await handleMemoryRecall(args));
      if (toolName === 'memory_write') return makeResponse(message.id, await handleMemoryWrite(args));
      if (toolName === 'memory_checkpoint') return makeResponse(message.id, await handleMemoryCheckpoint(args));
      return makeError(message.id, -32601, `Unknown tool: ${toolName}`);
    } catch (error) {
      return makeResponse(message.id, {
        content: [{ type: 'text', text: `memory tool error: ${error.message}` }],
        isError: true,
      });
    }
  }

  if (message.method === 'notifications/initialized') return undefined;
  if (message.method === 'ping') return makeResponse(message.id, {});
  if (typeof message.id === 'undefined') return undefined;
  return makeError(message.id, -32601, `Unknown method: ${message.method}`);
}

if (process.argv[1] && process.argv[1].endsWith('memory-mcp-server.mjs')) {
  const lines = createInterface({ input: process.stdin });
  /* 中文注释：与 shell-mcp-server.mjs 一致的并发模型——不 await 串行。
     慢的 memory_recall（检索可达数秒）不得阻塞后续 ping / initialize / 取消，
     否则客户端在工具调用期间完全无响应。 */
  for await (const line of lines) {
    if (!line.trim()) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null })}\n`);
      continue;
    }
    Promise.resolve(handleMessage(message).catch((error) => makeError(message.id, -32603, error.message)))
      .then((response) => {
        if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
      });
  }
}
