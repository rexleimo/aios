import {
  addPlanEvidence,
  checkPlanningSkillDiscovery,
  evaluateDoneGate,
  formatActivePlanInjection,
  readActivePlan,
  setPlanStatus,
  startPlan,
  summarizePlanProgress,
  updatePlanTask,
} from './contract.mjs';
import { projectPlanningSkills } from './project-skills.mjs';
import {
  buildAlwaysOnPlanningDirective,
  runAutoGate,
  runClaudeUserPromptSubmitHook,
} from './auto-gate.mjs';

export async function runPlanCommand(options = {}, { rootDir = process.cwd(), stdout = process.stdout, stderr = process.stderr } = {}) {
  const sub = String(options.subcommand || 'status').trim();
  const json = Boolean(options.json || options.format === 'json');

  if (sub === 'start') {
    const title = options.title || options.task || options.objective || '';
    if (!title) {
      stderr.write('[err] plan start requires --title or --task\n');
      return { exitCode: 1 };
    }
    const state = startPlan({
      rootDir,
      title,
      objective: options.objective || options.task || title,
      client: (options.client && options.client !== 'all') ? options.client : 'cli',
      source: options.source || 'aios plan start',
    });
    stdout.write(json ? `${JSON.stringify(state, null, 2)}\n` : `plan started: ${state.relativePath}\n`);
    return { exitCode: 0, state };
  }

  if (sub === 'status') {
    const state = readActivePlan(rootDir);
    if (!state) {
      stdout.write(json ? `${JSON.stringify({ active: null }, null, 2)}\n` : 'no active plan\n');
      return { exitCode: 0, state: null };
    }
    stdout.write(json ? `${JSON.stringify(state, null, 2)}\n` : `active plan [${state.status}]: ${state.relativePath}\n`);
    return { exitCode: 0, state };
  }

  if (sub === 'set-status') {
    if (!options.status) {
      stderr.write('[err] plan set-status requires --status\n');
      return { exitCode: 1 };
    }
    try {
      const state = setPlanStatus(rootDir, options.status, {
        note: options.note || '',
        force: Boolean(options.force),
      });
      stdout.write(json ? `${JSON.stringify(state, null, 2)}\n` : `plan status -> ${state.status}\n`);
      return { exitCode: 0, state };
    } catch (error) {
      stderr.write(`[err] ${error.message}\n`);
      return { exitCode: 1 };
    }
  }

  if (sub === 'task') {
    const taskId = options.taskId || options.title;
    if (!taskId) {
      stderr.write('[err] plan task requires task id (first arg or --task-id)\n');
      return { exitCode: 1 };
    }
    if (!options.status && !options.taskTitle && options.acceptance === undefined) {
      stderr.write('[err] plan task requires --status and/or --title/--acceptance\n');
      return { exitCode: 1 };
    }
    try {
      const state = updatePlanTask(rootDir, taskId, {
        status: options.status,
        title: options.taskTitle,
        acceptance: options.acceptance,
      });
      const progress = summarizePlanProgress(state);
      stdout.write(json
        ? `${JSON.stringify({ state, progress }, null, 2)}\n`
        : `task ${taskId} updated; progress ${progress.tasksDone}/${progress.tasksTotal}\n`);
      return { exitCode: 0, state };
    } catch (error) {
      stderr.write(`[err] ${error.message}\n`);
      return { exitCode: 1 };
    }
  }

  if (sub === 'add-evidence') {
    if (!options.value && !options.task) {
      stderr.write('[err] plan add-evidence requires --value (or --task as value)\n');
      return { exitCode: 1 };
    }
    try {
      const state = addPlanEvidence(rootDir, {
        kind: options.kind || 'note',
        value: options.value || options.task,
      });
      stdout.write(json
        ? `${JSON.stringify(state, null, 2)}\n`
        : `evidence added (${state.evidence.length} total)\n`);
      return { exitCode: 0, state };
    } catch (error) {
      stderr.write(`[err] ${error.message}\n`);
      return { exitCode: 1 };
    }
  }

  if (sub === 'gate' || sub === 'check-done') {
    const state = readActivePlan(rootDir);
    if (!state) {
      stderr.write('[err] no active plan\n');
      return { exitCode: 1 };
    }
    const gate = evaluateDoneGate(state);
    const progress = summarizePlanProgress(state);
    const payload = { ok: gate.ok, reasons: gate.reasons, progress, status: state.status };
    stdout.write(json ? `${JSON.stringify(payload, null, 2)}\n` : (
      gate.ok
        ? `plan ready for done (tasks ${progress.tasksDone}/${progress.tasksTotal}, evidence=${progress.evidenceCount})\n`
        : `plan NOT ready: ${gate.reasons.join('; ')}\n`
    ));
    return { exitCode: gate.ok ? 0 : 1, ...payload };
  }

  if (sub === 'inject') {
    // Always-on: inject creates/refreshes plan from --task if provided
    if (options.task || options.objective || options.title) {
      const directive = buildAlwaysOnPlanningDirective({
        rootDir,
        message: options.task || options.objective || options.title || '',
        client: (options.client && options.client !== 'all') ? options.client : 'cli',
      });
      stdout.write(directive.text || '');
      return { exitCode: 0, text: directive.text, plan: directive.plan };
    }
    const text = formatActivePlanInjection(rootDir)
      || buildAlwaysOnPlanningDirective({ rootDir, message: '', client: 'cli' }).text;
    stdout.write(text || '');
    return { exitCode: 0, text };
  }

  if (sub === 'auto-gate' || sub === 'always-on') {
    const message = options.task || options.objective || options.title || options.message || '';
    const result = runAutoGate({
      rootDir,
      message,
      client: (options.client && options.client !== 'all') ? options.client : 'cli',
      json,
    });
    if (json) {
      stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      stdout.write(result.injection || '');
    }
    return { exitCode: 0, result };
  }

  if (sub === 'hook-user-prompt') {
    // Claude UserPromptSubmit: read stdin, write hook JSON
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const stdinText = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
    const { exitCode, output } = await runClaudeUserPromptSubmitHook({
      rootDir,
      stdinText,
      client: 'claude',
    });
    stdout.write(`${JSON.stringify(output)}\n`);
    return { exitCode };
  }

  if (sub === 'project-skills') {
    const result = projectPlanningSkills({
      rootDir,
      client: options.client || 'all',
      force: Boolean(options.force),
      io: { log: (line) => stderr.write(`${line}\n`) },
    });
    stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `planning skills projected: ok=${result.ok} source=${result.sourceRoot}\n`);
    return { exitCode: result.ok ? 0 : 1, result };
  }

  if (sub === 'repair-skills') {
    const { repairStalePlanningSkills } = await import('./repair-skills.mjs');
    const result = repairStalePlanningSkills({
      rootDir,
      client: options.client || 'all',
      force: Boolean(options.force) || true,
      io: { log: (line) => stderr.write(`${line}\n`) },
    });
    stdout.write(json
      ? `${JSON.stringify(result, null, 2)}\n`
      : `planning skill repair: ok=${result.ok} removed=${result.removed?.length || 0}\n`);
    return { exitCode: result.ok ? 0 : 1, result };
  }

  if (sub === 'doctor' || sub === 'discovery') {
    const clientOpt = String(options.client || 'all').trim();
    const knownClients = new Set(['codex', 'claude', 'gemini', 'opencode', 'hermes', 'grok']);
    const report = checkPlanningSkillDiscovery({
      rootDir,
      clients: clientOpt && clientOpt !== 'all' && knownClients.has(clientOpt)
        ? [clientOpt]
        : undefined,
    });
    stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : formatDiscoveryText(report));
    return { exitCode: report.ok ? 0 : 1, report };
  }

  stderr.write(`[err] unknown plan subcommand: ${sub}\n`);
  return { exitCode: 1 };
}

function formatDiscoveryText(report) {
  const lines = [`planning skill discovery: ${report.ok ? 'ok' : 'MISSING'}`];
  for (const item of report.reports || []) {
    const projectOk = item.project?.ok ? 'ok' : `missing ${item.project?.missing?.length || '?'}`;
    const homeOk = item.home?.ok ? 'ok' : `missing ${item.home?.missing?.length || '?'}`;
    lines.push(`- ${item.clientId}: project=${projectOk} home=${homeOk}`);
    if (item.recommendation) lines.push(`  fix: ${item.recommendation}`);
  }
  return `${lines.join('\n')}\n`;
}
