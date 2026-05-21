import { loadWorkspaceConfig, resolveRuntimeWorkspace } from './runtime.mjs';

export async function runRefsCommand(parsed, context) {
  const { resolveStorage } = await import('../../offload/tool-offload.mjs');
  const { readRef, grepRefs, listRefs, pruneRefs } = await import('../../offload/refs-store.mjs');
  const ws = resolveRuntimeWorkspace(parsed.command, parsed.options, context);
  const config = await loadWorkspaceConfig(ws);
  const storage = resolveStorage(parsed.options, process.env, config);
  const sub = parsed.options.subcommand || 'list';

  if (sub === 'grep') {
    const pattern = parsed.options.pattern;
    if (!pattern) {
      process.stderr.write('Usage: aios refs grep <pattern> [--session S]\n');
      process.exitCode = 1;
      return;
    }
    const results = await grepRefs(ws, pattern, { sessionId: parsed.options.session, storage, limit: Number(parsed.options.limit) || 20 });
    for (const item of results) console.log(`${item.node_id}  ${item.tool || ''}  ${item.ts || ''}  ${item.path}`);
    return;
  }

  if (sub === 'read') {
    const nodeId = parsed.options.nodeId;
    if (!nodeId) {
      process.stderr.write('Usage: aios refs read <node_id>\n');
      process.exitCode = 1;
      return;
    }
    const content = await readRef(ws, nodeId, storage);
    if (content) {
      process.stdout.write(typeof content === 'string' ? content : JSON.stringify(content, null, 2));
    } else {
      process.stderr.write(`[offload] node ${nodeId} not found\n`);
      process.exitCode = 1;
    }
    return;
  }

  if (sub === 'list') {
    const results = await listRefs(ws, { sessionId: parsed.options.session, storage, limit: Number(parsed.options.limit) || 20 });
    for (const item of results) console.log(`${item.node_id}  ${item.session}  ${item.path || ''}`);
    return;
  }

  if (sub === 'prune') {
    const result = await pruneRefs(ws, { storage, keepDays: Number(parsed.options.keepDays) || 30 });
    console.log(`Pruned ${result.pruned} refs, freed ${(result.bytesFreed / 1024).toFixed(1)}KB`);
    return;
  }

  process.stderr.write(`Unknown refs subcommand: ${sub}. Use: grep, read, list, prune\n`);
  process.exitCode = 1;
}

export async function runCanvasCommand(parsed, context) {
  const { resolveStorage } = await import('../../offload/tool-offload.mjs');
  const { loadCanvas, canvasToMermaid, getCanvasPaths } = await import('../../offload/mermaid-canvas.mjs');
  const ws = resolveRuntimeWorkspace(parsed.command, parsed.options, context);
  const config = await loadWorkspaceConfig(ws);
  const storage = resolveStorage(parsed.options, process.env, config);
  const sub = parsed.options.subcommand || 'show';
  const session = parsed.options.session || 'default';

  if (sub === 'show') {
    const fmt = parsed.options.format || 'mmd';
    const canvas = await loadCanvas(ws, session, storage);
    if (fmt === 'json') {
      console.log(JSON.stringify(canvas, null, 2));
    } else {
      console.log(canvasToMermaid(canvas));
    }
    return;
  }

  if (sub === 'path') {
    const paths = getCanvasPaths(ws, session, storage);
    console.log(JSON.stringify(paths, null, 2));
    return;
  }

  if (sub === 'backfill') {
    const inputPath = String(parsed.options.inputPath || '').trim();
    if (!inputPath) {
      process.stderr.write('Usage: aios canvas backfill --input <events.jsonl> --client <client> [--session S]\n');
      process.exitCode = 1;
      return;
    }
    const { backfillFromJsonl } = await import('../../offload/backfill.mjs');
    const result = await backfillFromJsonl({
      workspaceRoot: ws,
      sessionId: session,
      client: parsed.options.client || '',
      inputPath,
      storage,
      config,
    });
    console.log(`Backfilled scanned=${result.scanned} offloaded=${result.offloaded} skipped=${result.skipped} errors=${result.errors}`);
    return;
  }

  process.stderr.write(`Unknown canvas subcommand: ${sub}. Use: show, path, backfill\n`);
  process.exitCode = 1;
}
