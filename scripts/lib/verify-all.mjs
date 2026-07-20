import { resolveSoloBackoffState, shouldAbortForConsecutiveFailures } from './harness/solo-runtime/backoff.mjs';
import { computeCompactAction } from './offload/mermaid-canvas.mjs';
import { evaluateDryRunReadiness, formatDryRunReadiness } from './harness/solo-runtime/dry-run-readiness.mjs';
import { resolveRuntimeDirectiveInjections } from './lifecycle/harness/directive-inject.mjs';
import { buildIterationPrompt } from './lifecycle/harness/prompt.mjs';
import { runDream } from './lifecycle/dream/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS:', name); }
  else { fail++; console.error('  FAIL:', name, detail || ''); }
}

console.log('=== Final Verification: A1+A2+A3+B1+B2+B3 ===\n');

// ── A1: backoff.mjs ──
console.log('--- A1: backoff.mjs ---');
let s = resolveSoloBackoffState({ previous: { consecutiveFailures: 3, consecutiveInfraFailures: 2, nextDelayMs: 120000 }, outcome: { outcome: 'success' } });
check('success resets consecutiveFailures', s.consecutiveFailures === 0);
check('success resets consecutiveInfraFailures', s.consecutiveInfraFailures === 0);
s = resolveSoloBackoffState({ previous: { consecutiveFailures: 1, consecutiveInfraFailures: 1, nextDelayMs: 30000 }, outcome: { outcome: 'infra-retry', failureClass: 'runtime-error' } });
check('infra-retry increments both', s.consecutiveFailures === 2 && s.consecutiveInfraFailures === 2);
check('infra-retry doubles backoff', s.nextDelayMs === 60000);
s = resolveSoloBackoffState({ previous: { consecutiveFailures: 0, consecutiveInfraFailures: 0, nextDelayMs: 0 }, outcome: { outcome: 'blocked', failureClass: 'no-progress' } });
check('blocked increments consecutiveFailures only', s.consecutiveFailures === 1 && s.consecutiveInfraFailures === 0 && s.nextDelayMs === 0);
check('abort at 5', shouldAbortForConsecutiveFailures({ consecutiveFailures: 5 }));
check('no abort at 4', !shouldAbortForConsecutiveFailures({ consecutiveFailures: 4 }));
s = resolveSoloBackoffState({ previous: { consecutiveFailures: 10, consecutiveInfraFailures: 10, nextDelayMs: 200000 }, outcome: { outcome: 'infra-retry', failureClass: 'runtime-error' } });
check('backoff caps at 300000', s.nextDelayMs === 300000);

// ── A2: mermaid-canvas.mjs ──
console.log('--- A2: mermaid-canvas.mjs ---');
check('none < 20', computeCompactAction(0) === 'none');
check('none at 19', computeCompactAction(19) === 'none');
check('mild at 20', computeCompactAction(20) === 'mild');
check('mild at 49', computeCompactAction(49) === 'mild');
check('aggressive at 50', computeCompactAction(50) === 'aggressive');
check('aggressive at 99', computeCompactAction(99) === 'aggressive');
check('emergency at 100', computeCompactAction(100) === 'emergency');
check('emergency at 150', computeCompactAction(150) === 'emergency');

// ── A3: dry-run readiness ──
console.log('--- A3: dry-run-readiness.mjs ---');
const tmp = path.join(os.tmpdir(), 'final-verify-' + Date.now());
fs.mkdirSync(tmp, { recursive: true });
const blocked = evaluateDryRunReadiness(tmp, { sessionId: 's1', provider: 'test', worktree: true });
check('blocked worktree-no-git', blocked.level === 'blocked');
check('has git fail check', blocked.checks.some(c => c.label === 'git' && c.status === 'fail'));
fs.mkdirSync(path.join(tmp, '.git'), { recursive: true });
fs.mkdirSync(path.join(tmp, '.aios', 'context-db'), { recursive: true });
fs.writeFileSync(path.join(tmp, '.aios', 'context-db', 'index.json'), '{}');
const ready = evaluateDryRunReadiness(tmp, { sessionId: 's1', provider: 'test', worktree: true });
check('ready with .git+ctxdb+provider', ready.level === 'ready');
fs.writeFileSync(path.join(tmp, '.aios', 'context-db', 'index.json'), '{bad}');
const badIdx = evaluateDryRunReadiness(tmp, { sessionId: 's1', provider: 'test', worktree: true });
check('corrupt index warning', badIdx.level === 'warning');
const noProv = evaluateDryRunReadiness(tmp, { sessionId: 's1', provider: '', worktree: true });
check('missing provider warning', noProv.checks.some(c => c.label === 'provider' && c.status === 'warn'));
fs.writeFileSync(path.join(tmp, '.aios', 'context-db', 'index.json'), '{}');
const fmtOk = evaluateDryRunReadiness(tmp, { sessionId: 's1', provider: 'test', worktree: true });
check('format returns string', typeof formatDryRunReadiness(fmtOk) === 'string');

// ── B1: directive-inject + prompt.mjs ──
console.log('--- B1: directive-inject + prompt.mjs ---');
fs.writeFileSync(path.join(tmp, '.aios', 'config.json'), JSON.stringify({ default_mode: 'strict-primary' }));
const inj = resolveRuntimeDirectiveInjections(tmp);
check('strict-primary modeName', inj?.modeName === 'strict-primary');
check('strict-primary label', inj?.label === 'Strict AIOS Primary Agent');
check('strict-primary skills', inj?.skills?.length === 0);
check('strict-primary additions', inj?.systemPromptAdditions?.length === 2);
const prompt = buildIterationPrompt({ objective: 'test', iteration: 1, rootDir: tmp });
check('prompt has Runtime Directive', prompt.includes('--- Runtime Directive ---'));
check('prompt has workflow policy', prompt.includes('AIOS workflow policy'));
check('prompt has End Directive', prompt.includes('--- End Runtime Directive ---'));
const promptNoDir = buildIterationPrompt({ objective: 'test', iteration: 1, rootDir: null });
check('no rootDir no directive', !promptNoDir.includes('--- Runtime Directive ---'));

// ── B2: autodream ──
console.log('--- B2: autodream ---');
const dreamResult = await runDream({ rootDir: tmp, mode: 'preview', spaces: ['default'] });
check('preview returns object', dreamResult !== null && typeof dreamResult === 'object');
check('preview has summary', typeof dreamResult.summary === 'object');
check('preview totalEvents >= 0', dreamResult.summary?.totalEvents >= 0);
const applyResult = await runDream({ rootDir: tmp, mode: 'apply', spaces: ['default'] });
check('apply returns object', applyResult !== null && typeof applyResult === 'object');
check('apply applied=true', applyResult.applied === true);

// ── B3: skill-workshop (import only, logic tested in prior commit) ──
console.log('--- B3: skill-workshop.mjs ---');
const { apply: skillApply, rollback: skillRollback } = await import('./skills/skill-workshop.mjs');
check('apply function exists', typeof skillApply === 'function');
check('rollback function exists', typeof skillRollback === 'function');

console.log('');
console.log('=== Final Results:', pass, 'pass,', fail, 'fail ===');
if (fail > 0) process.exit(1);
console.log('All A+B features verified.');
