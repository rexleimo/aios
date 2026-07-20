import {
  addPlanEvidence,
  evaluateDoneGate,
  readActivePlan,
  setPlanStatus,
  startPlan,
  summarizePlanProgress,
  updatePlanTask,
} from './contract.mjs';
import {
  buildAlwaysOnPlanningDirective,
  runAutoGate,
  runClaudeUserPromptSubmitHook,
} from './auto-gate.mjs';
import { recordAiosCapabilityEvidence } from '../workflows/rex-capability-runtime.mjs';

function readTestabilityDecision(source, rootDir) {
  if (!source) return undefined;
  const target = path.resolve(rootDir, source);
  try {
    return JSON.parse(fs.readFileSync(target, 'utf8'));
  } catch (error) {
    throw new Error(`invalid --testability-file: ${target}: ${error.message}`, { cause: error });
  }
}

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
      sessionId: options.sessionId || '',
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

  if (sub === 'show' || sub === 'review') {
    const { showActivePlan } = await import('./show.mjs');
    const format = options.format === 'html' || options.html ? 'both' : (options.format || 'text');
    const shown = showActivePlan(rootDir, { format: format === 'json' ? 'text' : format });
    if (json) {
      stdout.write(`${JSON.stringify({
        ok: shown.ok,
        progress: shown.progress,
        gate: shown.gate,
        htmlPath: shown.htmlPath,
        plan: shown.plan,
      }, null, 2)}\n`);
    } else {
      stdout.write(shown.text || 'No active plan.\n');
      if (shown.htmlPath?.relativePath) {
        stdout.write(`\nHTML review: ${shown.htmlPath.relativePath}\n`);
      }
    }
    return { exitCode: shown.ok ? 0 : 1, ...shown };
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

  if (sub === 'capability-evidence') {
    if (!options.activationId || !options.commandToken || !options.evidenceKind || !options.evidenceRef) {
      stderr.write('[err] plan capability-evidence requires --activation, --command-token, --evidence-kind, and --evidence-ref\n');
      return { exitCode: 1 };
    }
    try {
      const result = recordAiosCapabilityEvidence({
        rootDir,
        activationId: options.activationId,
        commandToken: options.commandToken,
        evidence: [{ kind: options.evidenceKind, refs: [options.evidenceRef] }],
        testabilityDecision: readTestabilityDecision(options.testabilityFile, rootDir),
      });
      stdout.write(json
        ? `${JSON.stringify(result, null, 2)}\n`
        : `capability evidence -> ${result.outcome}; activation=${result.activationId}\n`);
      return { exitCode: 0, result };
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
    const directive = buildAlwaysOnPlanningDirective({
      rootDir,
      message: options.task || options.objective || options.title || '',
      client: (options.client && options.client !== 'all') ? options.client : 'cli',
      sessionId: options.sessionId || '',
      policyMode: options.policyMode,
    });
    stdout.write(directive.text || '');
    return { exitCode: 0, text: directive.text, plan: directive.plan, decision: directive.decision };
  }

  if (sub === 'auto-gate' || sub === 'always-on') {
    const message = options.task || options.objective || options.title || options.message || '';
    const result = runAutoGate({
      rootDir,
      message,
      client: (options.client && options.client !== 'all') ? options.client : 'cli',
      sessionId: options.sessionId || '',
      source: options.source || 'aios plan auto-gate',
      policyMode: options.policyMode,
      dryRun: Boolean(options.dryRun),
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

  stderr.write(`[err] unknown plan subcommand: ${sub}\n`);
  return { exitCode: 1 };
}

import fs from 'node:fs';
import path from 'node:path';
