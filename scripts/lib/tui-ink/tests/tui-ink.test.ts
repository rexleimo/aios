// scripts/lib/tui-ink/tests/tui-ink.test.ts

import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  MemoryGenealogyGraph,
  MemoryGenealogyNode,
  MemoryGenealogyRisk,
} from '../../../../mcp-server/src/contextdb/genealogy.ts';

// Note: Full Ink component tests require special terminal handling.
// These tests verify the modules can be imported correctly.

test('useSetupOptions hook can be imported', async () => {
  const mod = await import('../hooks/useSetupOptions.ts');
  assert.ok(mod.useSetupOptions, 'useSetupOptions should be exported');
  assert.equal(typeof mod.useSetupOptions, 'function', 'useSetupOptions should be a function');
});

test('components can be imported', async () => {
  const header = await import('../components/Header.tsx');
  const footer = await import('../components/Footer.tsx');
  const checkbox = await import('../components/Checkbox.tsx');
  const scrollable = await import('../components/ScrollableSelect.tsx');

  assert.ok(header.Header, 'Header component should be exported');
  assert.ok(footer.Footer, 'Footer component should be exported');
  assert.ok(checkbox.Checkbox, 'Checkbox component should be exported');
  assert.ok(scrollable.ScrollableSelect, 'ScrollableSelect component should be exported');
});

test('screens can be imported', async () => {
  const main = await import('../screens/MainScreen.tsx');
  const setup = await import('../screens/SetupScreen.tsx');
  const update = await import('../screens/UpdateScreen.tsx');
  const uninstall = await import('../screens/UninstallScreen.tsx');
  const doctor = await import('../screens/DoctorScreen.tsx');
  const skills = await import('../screens/SkillPickerScreen.tsx');
  const confirm = await import('../screens/ConfirmScreen.tsx');
  const genealogy = await import('../screens/MemoryGenealogyScreen.tsx');

  assert.ok(main.MainScreen, 'MainScreen should be exported');
  assert.ok(setup.SetupScreen, 'SetupScreen should be exported');
  assert.ok(update.UpdateScreen, 'UpdateScreen should be exported');
  assert.ok(uninstall.UninstallScreen, 'UninstallScreen should be exported');
  assert.ok(doctor.DoctorScreen, 'DoctorScreen should be exported');
  assert.ok(skills.SkillPickerScreen, 'SkillPickerScreen should be exported');
  assert.ok(confirm.ConfirmScreen, 'ConfirmScreen should be exported');
  assert.ok(genealogy.MemoryGenealogyScreen, 'MemoryGenealogyScreen should be exported');
  assert.ok(genealogy.clampGenealogyCursor, 'clampGenealogyCursor should be exported');
  assert.ok(genealogy.shouldShowGenealogyEmptyState, 'shouldShowGenealogyEmptyState should be exported');
  assert.ok(genealogy.formatGenealogyRefreshStatus, 'formatGenealogyRefreshStatus should be exported');
});

test('native preview helper can be imported', async () => {
  const preview = await import('../native-preview.ts');
  assert.ok(preview.getNativePreview, 'getNativePreview should be exported');
  assert.equal(typeof preview.getNativePreview, 'function', 'getNativePreview should be a function');
});

test('native preview includes Kiro deep outputs', async () => {
  const preview = await import('../native-preview.ts');
  assert.deepEqual(preview.getNativePreview('kiro'), {
    tier: 'deep',
    lines: ['kiro: .kiro/steering/AIOS.md + .kiro/settings/mcp.json + .kiro/agents + .kiro/skills'],
  });
  assert.match(preview.getNativePreview('all').tier, /kiro/);
  assert.ok(preview.getNativePreview('all').lines.some((line: string) => line.startsWith('kiro: ')));
});

test('genealogy view formatter can be imported', async () => {
  const view = await import('../genealogy-view.ts');
  assert.ok(view.formatGenealogyRows, 'formatGenealogyRows should be exported');
  assert.ok(view.formatNodeDetails, 'formatNodeDetails should be exported');
  assert.ok(view.formatRiskSummary, 'formatRiskSummary should be exported');
});

test('App and runInteractiveSession can be imported', async () => {
  const app = await import('../App.tsx');
  const index = await import('../index.tsx');

  assert.ok(app.App, 'App component should be exported');
  assert.ok(index.runInteractiveSession, 'runInteractiveSession should be exported');
  assert.equal(typeof index.runInteractiveSession, 'function', 'runInteractiveSession should be a function');
});

test('genealogy view formatter creates readable hierarchy rows and details', async () => {
  const {
    formatGenealogyRows,
    formatNodeDetails,
    formatRiskSummary,
  } = await import('../genealogy-view.ts');

  const graph: MemoryGenealogyGraph = {
    schemaVersion: 1,
    generatedAt: '2026-05-14T00:00:00.000Z',
    project: 'aios',
    root: 'project:aios',
    limits: {
      requestedLimit: 40,
      includeEvents: false,
      eventsPerSession: 10,
    },
    summary: {
      nodes: 4,
      edges: 3,
      sessions: 1,
      checkpoints: 1,
      events: 0,
      refs: 1,
      hiddenEvents: 2,
      risks: {
        none: 2,
        stale: 0,
        blocked: 0,
        failed: 0,
        'missing-evidence': 1,
      },
    },
    nodes: [
      {
        id: 'project:aios',
        type: 'project',
        label: 'aios',
        summary: 'AIOS project memory.',
        project: 'aios',
        trust: 1,
        risk: 'none',
        refs: [],
      },
      {
        id: 'session:s1',
        type: 'session',
        label: 's1',
        summary: 'Build memory genealogy TUI.',
        sessionId: 's1',
        project: 'aios',
        agent: 'codex-cli',
        status: 'running',
        ts: '2026-05-14T01:00:00.000Z',
        trust: 0.8,
        risk: 'none',
        refs: ['scripts/lib/tui-ink/App.tsx'],
      },
      {
        id: 'checkpoint:s1:1',
        type: 'checkpoint',
        label: 'checkpoint 1',
        summary: 'Formatter designed.',
        sessionId: 's1',
        status: 'done',
        ts: '2026-05-14T01:05:00.000Z',
        trust: 0.7,
        risk: 'missing-evidence',
        refs: ['scripts/lib/tui-ink/genealogy-view.ts'],
      },
      {
        id: 'ref:scripts-lib-tui-ink-genealogy-view.ts',
        type: 'ref',
        label: 'scripts/lib/tui-ink/genealogy-view.ts',
        summary: 'Referenced TUI formatter file.',
        sourcePath: 'scripts/lib/tui-ink/genealogy-view.ts',
        trust: 0.6,
        risk: 'none',
        refs: [],
      },
    ],
    edges: [
      { source: 'project:aios', target: 'session:s1', type: 'contains', strength: 1 },
      { source: 'session:s1', target: 'checkpoint:s1:1', type: 'summarizes', strength: 1 },
      { source: 'checkpoint:s1:1', target: 'ref:scripts-lib-tui-ink-genealogy-view.ts', type: 'references', strength: 1 },
    ],
    warnings: [],
  };

  const rows = formatGenealogyRows(graph);
  assert.deepEqual(
    rows.map(({ nodeId, depth }) => [nodeId, depth]),
    [
      ['project:aios', 0],
      ['session:s1', 1],
      ['checkpoint:s1:1', 2],
      ['ref:scripts-lib-tui-ink-genealogy-view.ts', 3],
    ],
  );

  const details = formatNodeDetails(graph.nodes[2]);
  assert.equal(details.some((line) => line.includes('Risk: missing-evidence')), true);
  assert.equal(details.some((line) => line.includes('scripts/lib/tui-ink/genealogy-view.ts')), true);

  assert.equal(formatRiskSummary(graph.summary.risks), 'none 2 | missing-evidence 1');
});

test('genealogy view formatter handles malformed partial graph inputs', async () => {
  const {
    formatGenealogyRows,
    formatNodeDetails,
    formatRiskSummary,
  } = await import('../genealogy-view.ts');

  const graph = {
    schemaVersion: 1,
    root: 'project:missing',
    nodes: [null],
    edges: [null],
  } as unknown as MemoryGenealogyGraph;

  assert.deepEqual(formatGenealogyRows(graph), []);
  assert.equal(formatRiskSummary(undefined as unknown as Record<MemoryGenealogyRisk, number>), 'none 0');

  const details = formatNodeDetails({
    id: 'partial',
    type: 'checkpoint',
    label: 'partial',
    summary: 'Partial node.',
    risk: 'none',
  } as unknown as MemoryGenealogyNode);

  assert.equal(details.some((line) => line.includes('NaN%')), false);
});

test('memory genealogy screen helpers gate empty and refresh states', async () => {
  const {
    clampGenealogyCursor,
    formatGenealogyRefreshStatus,
    shouldShowGenealogyEmptyState,
  } = await import('../screens/MemoryGenealogyScreen.tsx');

  assert.equal(
    shouldShowGenealogyEmptyState({ hasLoaded: false, isLoading: true, rowCount: 0, error: '' }),
    false,
    'initial empty state should be hidden while loading',
  );
  assert.equal(
    shouldShowGenealogyEmptyState({ hasLoaded: false, isLoading: false, rowCount: 0, error: '' }),
    false,
    'initial empty state should be hidden before first load completes',
  );
  assert.equal(
    shouldShowGenealogyEmptyState({ hasLoaded: true, isLoading: true, rowCount: 0, error: '' }),
    false,
    'empty state should be hidden during refresh',
  );
  assert.equal(
    shouldShowGenealogyEmptyState({ hasLoaded: true, isLoading: false, rowCount: 0, error: '' }),
    true,
    'empty state should show only after load completes with no rows or error',
  );
  assert.equal(
    shouldShowGenealogyEmptyState({ hasLoaded: true, isLoading: false, rowCount: 0, error: 'boom' }),
    false,
    'empty state should be hidden when an error exists',
  );
  assert.equal(
    shouldShowGenealogyEmptyState({ hasLoaded: true, isLoading: false, rowCount: 1, error: '' }),
    false,
    'empty state should be hidden when rows exist',
  );

  assert.equal(formatGenealogyRefreshStatus(true, false, ''), 'Loading...');
  assert.equal(formatGenealogyRefreshStatus(true, true, '2026-05-14T00:00:00.000Z'), 'Refreshing...');
  assert.equal(
    formatGenealogyRefreshStatus(false, true, '2026-05-14T00:00:00.000Z'),
    'Last refresh: 2026-05-14T00:00:00.000Z.',
  );
  assert.equal(formatGenealogyRefreshStatus(false, true, ''), '');

  assert.equal(clampGenealogyCursor(-1, 3), 0);
  assert.equal(clampGenealogyCursor(1, 3), 1);
  assert.equal(clampGenealogyCursor(8, 3), 2);
  assert.equal(clampGenealogyCursor(8, 0), 0);
});
