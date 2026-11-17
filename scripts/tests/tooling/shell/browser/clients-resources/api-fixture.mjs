import assert from 'node:assert/strict';
import { agentInventory, skillInventory, skillReport } from '../../data/resources-fixtures.mjs';

export function clientResourceState(options = {}) {
  return {
    clients: ['claude', 'codex', 'pi'].map(id => ({ id, installed: true, version: '1.2.3', versionStatus: 'known',
      source: { kind: 'npm-global', label: 'fixture npm' }, revision: 'f'.repeat(64),
      executable: { path: `/fixture/bin/${id}`, realPath: `/fixture/bin/${id}` }, update: { supported: true } })),
    clientReads: 0, clientActions: [], previews: {}, previewCount: 0, failClients: 0, failUpdate: 0,
    manageReads: [], manageActions: [], skillInventory: structuredClone(skillInventory), agentInventory: structuredClone(agentInventory),
    presetReads: 0, mcpActions: [], mcpReads: 0, mcpPreviewCount: 0, mcpPreviewRevision: null,
    mcpPreview: null, mcpPreviewRequest: null, mcpCancellations: [], mcpInstallRevisions: [],
    failMcpPreview: false, failMcp: 0, failMcpVerdict: false, failPreset: 0,
    preset: { name: 'aios-search', entry: { type: 'stdio', command: '/fixture/runtime/node', args: ['/fixture/runtime/aios-search-mcp.mjs'] },
      requiredEnv: ['DEEPSEEK_API_KEY'], description: 'Local DeepSeek Search / Fetch fixture; no generation model.',
      costNotice: 'Search / Fetch may incur charges when used; preview and install are offline.' },
    ...options,
  };
}

export async function handleClientResourceRequest({ request, url, respond, fail, state }) {
  if (url.pathname === '/api/clients') {
    if (request.method() === 'GET') {
      state.clientReads += 1;
      if (state.failClients) await fail({ error: 'fixture installation inventory unavailable' }, state.failClients);
      else await respond({ ok: true, clients: state.clients });
    } else {
      assert.equal(request.method(), 'POST');
      const body = request.postDataJSON();
      state.clientActions.push(body);
      const client = state.clients.find(row => row.id === body.client);
      assert.ok(client, 'only declared fixture clients can be updated');
      if (body.action === 'preview-update') {
        assert.deepEqual(body, { action: 'preview-update', client: client.id });
        const revision = (++state.previewCount).toString(16).padStart(64, '0');
        state.previews[client.id] = revision;
        await respond({ ok: true, preview: { client: client.id, supported: client.update.supported, revision,
          source: client.source, command: { file: '/fixture/runtime/node', args: ['/fixture/runtime/npm-cli.js', 'install', '--global', client.id], shell: false } } });
      } else {
        assert.deepEqual(body, { action: 'update', client: client.id, expectedRevision: state.previews[client.id], confirm: true });
        delete state.previews[client.id];
        if (state.failUpdate) await fail({ ok: false, error: { code: 'PREVIEW_STALE', message: 'fixture update failed; obtain a new preview' } }, state.failUpdate);
        else {
          client.version = '1.2.4';
          await respond({ ok: true, result: { client: client.id, updated: true } });
        }
      }
    }
    return true;
  }
  if (url.pathname === '/api/manage') {
    if (request.method() === 'GET') {
      const resource = url.searchParams.get('resource');
      assert.ok(['skills', 'agents'].includes(resource));
      state.manageReads.push(resource);
      await respond({ ok: true, data: resource === 'skills' ? state.skillInventory : state.agentInventory });
    } else {
      assert.equal(request.method(), 'POST');
      const body = request.postDataJSON();
      state.manageActions.push(body);
      if (body.resource === 'agents') {
        assert.deepEqual(body, { resource: 'agents', action: 'doctor' });
        await respond({ ok: true, data: state.agentInventory });
      } else {
        assert.equal(body.resource, 'skills');
        assert.ok(['install', 'sync', 'remove'].includes(body.action));
        if (!body.dryRun) {
          assert.equal(body.confirm, true);
          assert.equal(body.expectedRevision, skillReport(body).revision);
        }
        await respond({ ok: true, data: skillReport(body, body.dryRun) });
      }
    }
    return true;
  }
  if (url.pathname === '/api/mcp/presets') {
    assert.equal(request.method(), 'GET');
    state.presetReads += 1;
    if (state.failPreset) await fail({ ok: false, error: 'fixture search preset unavailable' }, state.failPreset);
    else await respond({ ok: true, preset: state.preset });
    return true;
  }
  if (url.pathname === '/api/mcp') {
    if (request.method() === 'GET') {
      state.mcpReads += 1;
      await respond({ ok: true, rows: [], summary: { landings: 3 } });
      return true;
    }
    if (request.method() === 'DELETE') {
      const body = request.postDataJSON();
      assert.deepEqual(Object.keys(body), ['previewId']);
      assert.equal(typeof body.previewId, 'string');
      state.mcpCancellations.push(body.previewId);
      if (body.previewId === state.mcpPreview?.id) {
        state.mcpPreview = null;
        state.mcpPreviewRevision = null;
        state.mcpPreviewRequest = null;
      }
      await respond({ ok: true });
      return true;
    }
    assert.equal(request.method(), 'POST');
    const body = request.postDataJSON();
    state.mcpActions.push(body);
    assert.equal(body.action, 'add');
    assert.equal(body.name, 'aios-search');
    assert.deepEqual(body.entry, { type: 'stdio', ...state.preset.entry });
    assert.equal(Object.hasOwn(body.entry, 'env'), false, 'the Search preset must never write a secret');
    if (body.dryRun) {
      assert.equal(body.confirm, undefined);
      assert.equal(body.expectedRevision, undefined);
      assert.equal(body.previewId, undefined);
      state.mcpPreviewRevision = state.failMcpPreview ? null : (++state.mcpPreviewCount).toString(16).padStart(64, '0');
      state.mcpPreview = state.failMcpPreview ? null : {
        id: `00000000-0000-4000-8000-${state.mcpPreviewCount.toString().padStart(12, '0')}`, expiresAt: Date.now() + 300_000,
      };
      state.mcpPreviewRequest = state.failMcpPreview ? null : structuredClone(body);
    } else {
      const preview = state.mcpPreview;
      const revision = state.mcpPreviewRevision;
      const previewRequest = state.mcpPreviewRequest;
      // The API holds the CLI revision; the browser receives only a single-use opaque approval.
      state.mcpPreview = null;
      state.mcpPreviewRevision = null;
      state.mcpPreviewRequest = null;
      assert.ok(preview && revision && previewRequest, 'a consumed preview cannot authorize another write');
      assert.deepEqual(body, { ...previewRequest, dryRun: false, confirm: true, previewId: preview.id });
      assert.ok(preview.expiresAt > Date.now());
      state.mcpInstallRevisions.push(revision);
      if (state.failMcp) {
        await fail({ ok: false, error: 'fixture MCP install transport failure' }, state.failMcp);
        return true;
      }
    }
    const failed = body.dryRun ? state.failMcpPreview : state.failMcpVerdict;
    await respond({ ok: !failed, preview: body.dryRun ? state.mcpPreview : undefined, refreshRequired: !body.dryRun,
      argv: ['aios', 'mcp', 'add', body.name, ...(body.dryRun ? ['--dry-run'] : ['--confirm'])],
      exitCode: state.failMcpPreview && body.dryRun ? 1 : 0, stderr: '', result: { schema: 'mcp.action.v1', command: 'add', serverName: body.name,
        dryRun: Boolean(body.dryRun), exitCode: state.failMcpPreview && body.dryRun ? 1 : 0, status: failed ? 'error' : body.dryRun ? 'planned' : 'installed',
        landing: { clientId: body.client, scope: body.scope, file: '/fixture/claude/config.json', format: 'json', entryPath: 'mcpServers' },
        classification: { status: 'absent' },
        ...(failed ? { reason: body.dryRun ? 'fixture unsafe Search preview rejected' : 'fixture MCP install rejected after partial work' } : {}),
        planned: { file: '/fixture/claude/config.json', entryPath: 'mcpServers.aios-search', bytes: 123 } } });
    return true;
  }
  return false;
}
