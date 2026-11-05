// The one place the panel can cause something to happen.
//
// ADR 0007 decision 3: the capability process executes, the view only fetches. A click
// arrives here as `POST /api/actions/<id>` with at most `{ client, confirm }`; the id
// resolves to a fixed argv in `apps/shell/data/actions.mjs`, and nothing from the body
// is ever interpolated into a command.
//
// Refusals are explicit and distinguishable, because "the button did nothing" is the
// failure this whole layer exists to remove:
//   404 unknown action id
//   400 action needs a client id that is not a declared client
//   409 a mutating action without `confirm: true`
//   423 the capability process itself is unreachable
//
// Output is streamed as server-sent events so a 14-second `aios doctor` shows progress
// instead of a frozen button.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import type { NextRequest } from 'next/server';

import { ACTIONS, buildActionArgv, sseFrame } from '../../../../lib/actions.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function repoRoot(): string {
  return process.env.AIOS_PROJECT_ROOT ?? path.resolve(process.cwd(), '..', '..', '..');
}

/** The declared clients are the only values a client-scoped action accepts. */
function declaredClients(root: string): Set<string> {
  try {
    const config = JSON.parse(
      fs.readFileSync(path.join(root, 'config', 'host-capabilities.json'), 'utf8'),
    ) as { clients?: Record<string, unknown> };
    return new Set(Object.keys(config.clients ?? {}));
  } catch {
    return new Set();
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const spec = ACTIONS[id];
  if (!spec) {
    return json(404, { error: 'unknown-action', id });
  }

  let body: { client?: unknown; confirm?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    // An empty body is fine for actions that need nothing.
  }

  if (spec.confirm && body.confirm !== true) {
    return json(409, {
      error: 'confirmation-required',
      id,
      detail: 'this action writes outside the repository; send {"confirm": true}',
    });
  }

  const root = repoRoot();
  let client: string | undefined;
  if (spec.needsClient) {
    const requested = typeof body.client === 'string' ? body.client : '';
    const declared = declaredClients(root);
    if (!declared.has(requested)) {
      return json(400, {
        error: 'unknown-client',
        id,
        detail: 'the client id must be one declared in config/host-capabilities.json',
      });
    }
    client = requested;
  }

  const argv = buildActionArgv(id, {
    cli: path.join(root, 'scripts', 'aios.mjs'),
    client,
  });
  if (!argv) {
    return json(400, { error: 'unbuildable-action', id });
  }
  if (!fs.existsSync(argv[0])) {
    return json(423, { error: 'capability-process-absent', detail: argv[0] });
  }

  // The CLI entry is a JavaScript file, not an executable: the runner is the current
  // Node. This is also why the argv from the allowlist starts with the script path.
  const [cliPath, ...cliArgs] = argv;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encode = (chunk: string) => controller.enqueue(new TextEncoder().encode(chunk));
      encode(
        sseFrame('start', {
          id,
          argv: [path.relative(root, cliPath), ...cliArgs],
        }),
      );

      const child = spawn(process.execPath, [cliPath, ...cliArgs], {
        cwd: root,
        env: { ...process.env, AIOS_PROJECT_ROOT: root },
        stdio: ['ignore', 'pipe', 'pipe'],
        // Fixed argv, no shell: the body of the request never reaches this call.
        shell: false,
      });

      const pipe = (source: NodeJS.ReadableStream, channel: 'stdout' | 'stderr') => {
        source.setEncoding?.('utf8');
        source.on('data', (chunk: string) => {
          encode(sseFrame(channel, { chunk }));
        });
      };
      pipe(child.stdout, 'stdout');
      pipe(child.stderr, 'stderr');

      child.on('error', (error) => {
        encode(sseFrame('error', { message: error.message }));
        controller.close();
      });
      child.on('close', (code) => {
        encode(sseFrame('result', { exitCode: code ?? 1 }));
        controller.close();
      });
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
    },
  });
}
