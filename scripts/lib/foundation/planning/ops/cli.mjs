import fs from 'node:fs';
import path from 'node:path';

import {
  addPlanEvidence,
  canonicalWorkItemId,
  evaluateDoneGate,
  openWorkItemPlan,
  readActivePlan,
  setPlanStatus,
  startPlan,
  summarizePlanProgress,
  updatePlanTask,
} from '../contract/contract.mjs';
import {
  buildAlwaysOnPlanningDirective,
  runAutoGate,
} from '../flow/auto-gate.mjs';
import { runUserPromptSubmitHook } from '../flow/user-prompt-submit.mjs';
import {
  confirmTaskContextCandidates,
  proposeTaskContextCandidates,
} from './context-candidates.mjs';
import { recordAiosCapabilityEvidence } from '../../../execution/workflows/adapters/rex-capability-runtime.mjs';

function isContainedPath(rootPath, candidatePath) {
  const relative = path.relative(rootPath, candidatePath);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

// 中文注释：本函数是 plan CLI 子命令词汇表的唯一 owner（下面的分支就是实现）。
// 解析层不再维护副本，而是把声明的名字原样递到这里，未识别的就在这里拒绝。
export const PLAN_SUBCOMMANDS = Object.freeze([
  'start',
  'status',
  'show',
  'review',
  'set-status',
  'task',
  'add-evidence',
  'capability-evidence',
  'gate',
  'check-done',
  'inject',
  'auto-gate',
  'always-on',
  'hook-user-prompt',
  'statusline',
]);

function invalidTestabilityPath() {
  const error = new Error('testability file must resolve inside the selected workspace');
  error.code = 'AIOS_INVALID_TESTABILITY_PATH';
  return error;
}

function resolveTestabilityDecisionPath(source, rootDir) {
  const rootPath = path.resolve(rootDir);
  const targetPath = path.resolve(rootPath, String(source || '').trim());
  if (!isContainedPath(rootPath, targetPath)) throw invalidTestabilityPath();
  try {
    const realRoot = fs.realpathSync(rootPath);
    const realTarget = fs.realpathSync(targetPath);
    if (!isContainedPath(realRoot, realTarget)) throw invalidTestabilityPath();
    return realTarget;
  } catch (error) {
    if (error?.code === 'AIOS_INVALID_TESTABILITY_PATH') throw error;
    if (error?.code === 'ENOENT') return targetPath;
    throw invalidTestabilityPath();
  }
}

function readTestabilityDecision(source, rootDir) {
  if (!source) return undefined;
  let target;
  try {
    target = resolveTestabilityDecisionPath(source, rootDir);
  } catch (error) {
    throw new Error(`invalid --testability-file: ${error.message}`, { cause: error });
  }
  try {
    const content = fs.readFileSync(target, 'utf8');
    const verifiedTarget = resolveTestabilityDecisionPath(source, rootDir);
    if (verifiedTarget !== target) throw invalidTestabilityPath();
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`invalid --testability-file: ${target}: ${error.message}`, { cause: error });
  }
}

function readRequirementsDecision(source, rootDir) {
  if (!source) return undefined;
  let target;
  try {
    target = resolveTestabilityDecisionPath(source, rootDir);
  } catch (error) {
    throw new Error(`invalid --requirements-file: ${error.message}`, { cause: error });
  }
  try {
    const content = fs.readFileSync(target, 'utf8');
    const verifiedTarget = resolveTestabilityDecisionPath(source, rootDir);
    if (verifiedTarget !== target) throw invalidTestabilityPath();
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`invalid --requirements-file: ${target}: ${error.message}`, { cause: error });
  }
}

function readWorkspaceArtifact(source, rootDir, label) {
  if (!source) return undefined;
  let target;
  try {
    target = resolveTestabilityDecisionPath(source, rootDir);
  } catch (error) {
    throw new Error(`invalid --${label}-file: ${error.message}`, { cause: error });
  }
  try {
    const content = fs.readFileSync(target, 'utf8');
    const verifiedTarget = resolveTestabilityDecisionPath(source, rootDir);
    if (verifiedTarget !== target) throw invalidTestabilityPath();
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`invalid --${label}-file: ${target}: ${error.message}`, { cause: error });
  }
}

function stringDeclarations(values, optionName) {
  const normalized = (Array.isArray(values) ? values : []).map((value) => String(value || '').trim());
  if (normalized.some((value) => !value)) {
    throw new Error(`${optionName} requires a non-empty value`);
  }
  return [...new Set(normalized)];
}

function parseContextDeclaration(value) {
  const declaration = String(value || '').trim();
  const separator = declaration.indexOf(':', path.win32.isAbsolute(declaration) ? 2 : 0);
  const ref = (separator < 0 ? declaration : declaration.slice(0, separator)).trim();
  if (!ref) throw new Error('--context requires a non-empty ref');
  const reason = separator < 0 ? '' : declaration.slice(separator + 1).trim();
  return {
    ref,
    reason: reason || 'Declared via aios plan task',
    required: true,
  };
}

function taskDeclarations(options) {
  const contextValues = stringDeclarations(options.contextRequirements, '--context');
  const targets = stringDeclarations(options.targets, '--target');
  const allowedWrites = stringDeclarations(options.allowedWrites, '--allow-write');
  return {
    contextRequirements: contextValues.length ? contextValues.map(parseContextDeclaration) : undefined,
    targets: targets.length ? targets : undefined,
    allowedWrites: allowedWrites.length ? allowedWrites : undefined,
  };
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
    // A22: `--work-item <id>` declares the identity, so a repeat registration reuses the ledger
    // instead of reserving a `-2` sibling. Presence is what counts: a declared-but-blank id is
    // refused, never collapsed into "flag absent" and quietly routed to the unkeyed path.
    const declaredId = typeof options.workItem === 'string' ? options.workItem : null;
    const base = {
      rootDir,
      title,
      objective: options.objective || options.task || title,
      client: (options.client && options.client !== 'all') ? options.client : 'cli',
      sessionId: options.sessionId || '',
      source: options.source || 'aios plan start',
    };
    let state;
    let created = true;
    let recovered = false;
    try {
      if (declaredId !== null) {
        const opened = openWorkItemPlan({ ...base, workItemId: declaredId });
        state = opened.plan;
        created = opened.created;
        recovered = opened.recovered;
      } else {
        state = startPlan(base);
      }
    } catch (error) {
      // An unsafe id is refused, not sanitised into a different ledger.
      stderr.write(`[err] ${error.message}\n`);
      return { exitCode: 1 };
    }
    const label = created ? 'started' : recovered ? 'recovered' : 'reused';
    stdout.write(json
      ? `${JSON.stringify(declaredId !== null ? { ...state, ledger: { created, recovered } } : state, null, 2)}\n`
      : `plan ${label}: ${state.relativePath}\n`);
    return { exitCode: 0, state, created, recovered };
  }

  if (sub === 'status') {
    // 中文注释：status 是只读视图，写入口是 set-status。以前这里收到 --status/--note/--force
    // 会静默忽略并 exit 0，调用方以为计划已关闭而帐目根本没动（已完成的计划长期停在 executing）。
    // 写声明必须命中写入口，不能跌到只读视图。
    if (options.status || options.note || options.force) {
      stderr.write('[err] plan status is read-only; use: aios plan set-status --status <active|approved|executing|done|blocked> [--note <text>] [--force]\n');
      return { exitCode: 1 };
    }
    const state = readActivePlan(rootDir);
    if (!state) {
      stdout.write(json ? `${JSON.stringify({ active: null }, null, 2)}\n` : 'no active plan\n');
      return { exitCode: 0, state: null };
    }
    stdout.write(json ? `${JSON.stringify(state, null, 2)}\n` : `active plan [${state.status}]: ${state.relativePath}\n`);
    return { exitCode: 0, state };
  }

  /* 中文注释：Claude Code 状态栏入口。与 `status` 的区别只在输出形态：一行、短路径，
   * 无计划时也 exit 0 并给文案（状态栏空行会被当成渲染故障）。徽章由本命令合成，
   * 因为 statusLine 只有一个槽位，徽章和计划状态不能各占一个。 */
  if (sub === 'statusline') {
    const { composeStatusline, readCavemanMode } = await import('./statusline.mjs');
    const state = readActivePlan(rootDir);
    const line = composeStatusline({
      cavemanMode: readCavemanMode(),
      planState: state,
      progress: state ? summarizePlanProgress(state) : null,
    });
    stdout.write(`${line}\n`);
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
    if (options.proposeContext && options.confirmContextCandidates) {
      stderr.write('[err] plan task cannot propose and confirm context candidates in one command\n');
      return { exitCode: 1 };
    }
    try {
      if (options.proposeContext) {
        const proposal = await proposeTaskContextCandidates({
          rootDir,
          taskId,
          targets: options.targets,
          proposedBy: 'cli:aios-plan-task',
        });
        const payload = { proposal, confirmationRequired: true };
        stdout.write(json
          ? `${JSON.stringify(payload, null, 2)}\n`
          : 'context candidates proposed; confirm the reviewed proposal with aios plan task <task-id> --confirm-context-candidates\n');
        return { exitCode: 0, ...payload };
      }
      if (options.confirmContextCandidates) {
        const confirmed = await confirmTaskContextCandidates({
          rootDir,
          taskId,
          refs: options.candidateRefs,
          confirmedBy: options.confirmedBy || 'human-cli',
        });
        const progress = summarizePlanProgress(confirmed.state);
        const payload = { state: confirmed.state, proposal: confirmed.proposal, progress };
        stdout.write(json
          ? `${JSON.stringify(payload, null, 2)}\n`
          : `context candidates confirmed for ${taskId}; progress ${progress.tasksDone}/${progress.tasksTotal}\n`);
        return { exitCode: 0, ...payload };
      }
      const declarations = taskDeclarations(options);
      const hasDeclarations = Object.values(declarations).some((value) => Array.isArray(value) && value.length > 0);
      if (!options.status && !options.taskTitle && options.acceptance === undefined && !hasDeclarations) {
        stderr.write('[err] plan task requires --status, --title/--acceptance, context declarations, --propose-context, or --confirm-context-candidates\n');
        return { exitCode: 1 };
      }
      const state = updatePlanTask(rootDir, taskId, {
        status: options.status,
        title: options.taskTitle,
        acceptance: options.acceptance,
        ...declarations,
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
        requirementsDecision: readRequirementsDecision(options.requirementsFile, rootDir),
        wayfinderArtifact: readWorkspaceArtifact(options.wayfinderFile, rootDir, 'wayfinder'),
        planningArtifact: readWorkspaceArtifact(options.planningFile, rootDir, 'planning'),
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
    // A23: an auto-gate ledger may be declared with the same identity as `plan start`. Presence is
    // what counts (a blank declaration is refused, not treated as absent), and an unsafe id is
    // rejected before anything is written.
    const declaredGateId = typeof options.workItem === 'string' ? options.workItem : null;
    // Two declarations that contradict each other are refused, not resolved by precedence: the id
    // names one ledger while --new-work-item asks for a different one. Silently picking a side would
    // leave two ledgers answering to a single activation key.
    if (declaredGateId !== null && options.newWorkItem) {
      stderr.write('[err] plan auto-gate cannot combine --new-work-item with --work-item: the id names one ledger, --new-work-item declares another\n');
      return { exitCode: 1 };
    }
    if (declaredGateId !== null) {
      try {
        canonicalWorkItemId(declaredGateId);
      } catch (error) {
        stderr.write(`[err] ${error.message}\n`);
        return { exitCode: 1 };
      }
    }
    const result = runAutoGate({
      rootDir,
      message,
      client: (options.client && options.client !== 'all') ? options.client : 'cli',
      sessionId: options.sessionId || '',
      source: options.source || 'aios plan auto-gate',
      policyMode: options.policyMode,
      explicitIntent: options.intent || options.explicitIntent || null,
      newWorkItem: Boolean(options.newWorkItem),
      workItem: declaredGateId || '',
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
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const stdinText = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
    const { exitCode, output } = await runUserPromptSubmitHook({
      rootDir,
      stdinText,
      client: options.client,
    });
    stdout.write(`${JSON.stringify(output)}\n`);
    return { exitCode };
  }

  stderr.write(`[err] unknown plan subcommand: ${sub}\n`);
  stderr.write(`[err] valid subcommands: ${PLAN_SUBCOMMANDS.join(' | ')}\n`);
  return { exitCode: 1 };
}
