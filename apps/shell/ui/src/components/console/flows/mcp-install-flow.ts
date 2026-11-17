export interface McpActionResponse {
  ok?: boolean;
  exitCode?: number;
  argv?: string[];
  error?: string;
  detail?: string;
  refreshRequired?: boolean;
  preview?: { id: string; expiresAt: number };
  result?: {
    schema?: string; command?: string; status?: string; dryRun?: boolean; exitCode?: number;
    classification?: { status?: string };
    landing?: { file?: string; entryPath?: string };
    planned?: { bytes?: number; entryPath?: string };
    reason?: string; backupPath?: string; rolledBack?: string;
  } | null;
}

interface InstallRequest { client: string; scope: string; name: string; entry: Record<string, unknown> }
interface FlowState {
  phase: 'idle' | 'previewing' | 'preview' | 'installing' | 'done' | 'failed';
  preview: McpActionResponse | null;
  outcome: McpActionResponse | null;
  consent: boolean;
  error: string | null;
}

export function createMcpInstallFlow({
  send = fetch, changed = () => {}, refresh = () => {}, now = Date.now,
}: { send?: typeof fetch; changed?: () => void; refresh?: () => void; now?: () => number } = {}) {
  let state: FlowState = { phase: 'idle', preview: null, outcome: null, consent: false, error: null };
  let generation = 0;
  let disposed = false;
  let request: InstallRequest | null = null;
  function update(patch: Partial<FlowState>) {
    state = { ...state, ...patch };
    if (!disposed) changed();
  }
  function revoke(id?: string) {
    if (id) void send('/api/mcp', {
      method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ previewId: id }), keepalive: true,
    }).catch(() => {});
  }
  function invalidate() {
    generation += 1;
    revoke(state.preview?.preview?.id);
    request = null;
    update({ phase: 'idle', preview: null, outcome: null, consent: false, error: null });
  }
  function safePreview(value: McpActionResponse | null) {
    return value?.ok === true && value.exitCode === 0 && value.preview?.id && value.preview.expiresAt > now()
      && value.result?.schema === 'mcp.action.v1' && value.result.command === 'add' && value.result.dryRun === true
      && value.result.exitCode === 0 && ['planned', 'unchanged'].includes(value.result.status || '')
      && ['absent', 'owned'].includes(value.result.classification?.status || '');
  }
  function failure(value: McpActionResponse) {
    return value.error || value.result?.reason || value.result?.status || 'MCP request failed';
  }
  return {
    snapshot: () => state,
    invalidate,
    expire() { if (state.phase === 'preview') { invalidate(); update({ phase: 'failed', error: 'Preview expired; run a fresh preview.' }); } },
    activate() { disposed = false; },
    dispose() { invalidate(); disposed = true; },
    canInstall: () => state.phase === 'preview' && state.consent && Boolean(safePreview(state.preview)),
    approve(consent: boolean) { update({ consent: state.phase === 'preview' && Boolean(safePreview(state.preview)) && consent }); },
    async preview(input: InstallRequest) {
      if (state.phase === 'installing') return;
      invalidate();
      const current = generation;
      request = JSON.parse(JSON.stringify(input));
      update({ phase: 'previewing' });
      try {
        const response = await send('/api/mcp', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...request, action: 'add', dryRun: true }),
        });
        const value = await response.json() as McpActionResponse;
        if (current !== generation || disposed) { revoke(value.preview?.id); return; }
        if (!response.ok || !safePreview(value)) {
          revoke(value.preview?.id);
          request = null;
          update({ phase: 'failed', preview: { ...value, preview: undefined }, error: failure(value) });
        } else update({ phase: 'preview', preview: value });
      } catch {
        if (current === generation && !disposed) { request = null; update({ phase: 'failed', error: 'MCP preview failed; run a fresh preview.' }); }
      }
    },
    async install() {
      if (state.phase !== 'preview' || !state.consent || !request || !safePreview(state.preview)) {
        if (state.phase === 'preview') { invalidate(); update({ phase: 'failed', error: 'Preview expired; run a fresh preview.' }); }
        return;
      }
      const current = generation;
      const body = { ...request, action: 'add', dryRun: false, confirm: true, previewId: state.preview!.preview!.id };
      request = null;
      update({ phase: 'installing', consent: false, preview: { ...state.preview!, preview: undefined }, error: null });
      try {
        const response = await send('/api/mcp', {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
        });
        const value = await response.json() as McpActionResponse;
        const success = response.ok && value.ok === true && value.exitCode === 0 && value.result?.exitCode === 0
          && value.result.schema === 'mcp.action.v1' && value.result.command === 'add' && value.result.dryRun !== true
          && ['installed', 'unchanged'].includes(value.result.status || '');
        if (current === generation && !disposed) update({ phase: success ? 'done' : 'failed', outcome: value, error: success ? null : failure(value) });
      } catch {
        if (current === generation && !disposed) update({ phase: 'failed', error: 'Installation result unknown. Inventory refreshed; run a fresh preview before retrying.' });
      } finally {
        // Closing/unmounting does not cancel a child that may already be committing.
        refresh();
      }
    },
  };
}
