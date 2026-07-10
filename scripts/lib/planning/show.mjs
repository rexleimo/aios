/**
 * P11 — human review surface for the active plan.
 */

import fs from 'node:fs';
import path from 'node:path';

import { evaluateDoneGate, readActivePlan, summarizePlanProgress } from './contract.mjs';

function statusIcon(status) {
  switch (status) {
    case 'done': return '✅';
    case 'in_progress': return '🔄';
    case 'blocked': return '⛔';
    case 'skipped': return '⏭';
    default: return '☐';
  }
}

/**
 * Render plain-text plan board for terminals.
 */
export function formatPlanShowText(plan) {
  if (!plan) return 'No active plan.\n';
  const progress = summarizePlanProgress(plan);
  const gate = evaluateDoneGate(plan);
  const lines = [
    '╔══════════════════════════════════════════╗',
    '║         AIOS PLAN REVIEW (v2)            ║',
    '╚══════════════════════════════════════════╝',
    '',
    `Title:    ${plan.title}`,
    `Status:   ${plan.status}`,
    `Route:    ${plan.route || 'unknown'}`,
    `Path:     ${plan.relativePath || '(none)'}`,
    `Progress: ${progress.tasksDone}/${progress.tasksTotal} tasks · evidence=${progress.evidenceCount}`,
    `Gate:     ${gate.ok ? 'READY for done' : `NOT READY — ${gate.reasons.join('; ')}`}`,
    '',
    'Skills:',
    ...(Array.isArray(plan.skills) ? plan.skills.map((s) => `  · ${s}`) : ['  · (none)']),
    '',
    'Tasks:',
  ];

  for (const task of plan.tasks || []) {
    lines.push(`  ${statusIcon(task.status)} ${task.id}  ${task.title}  [${task.status}]`);
    if (task.acceptance) lines.push(`       acceptance: ${task.acceptance}`);
  }

  lines.push('', 'Evidence:');
  if (!plan.evidence?.length) {
    lines.push('  (none)');
  } else {
    for (const e of plan.evidence.slice(-12)) {
      lines.push(`  · [${e.kind}] ${e.value}${e.at ? ` @ ${e.at}` : ''}`);
    }
  }

  if (progress.nextTask) {
    lines.push('', `Next: ${progress.nextTask.id} — ${progress.nextTask.title}`);
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Minimal self-contained HTML board (no external assets).
 */
export function formatPlanShowHtml(plan) {
  if (!plan) {
    return '<!doctype html><meta charset="utf-8"><title>AIOS Plan</title><p>No active plan.</p>';
  }
  const progress = summarizePlanProgress(plan);
  const gate = evaluateDoneGate(plan);
  const tasks = (plan.tasks || []).map((t) => `
    <tr>
      <td>${escapeHtml(statusIcon(t.status))}</td>
      <td><code>${escapeHtml(t.id)}</code></td>
      <td>${escapeHtml(t.title)}</td>
      <td><span class="st st-${escapeHtml(t.status)}">${escapeHtml(t.status)}</span></td>
      <td>${escapeHtml(t.acceptance || '')}</td>
    </tr>`).join('');
  const evidence = (plan.evidence || []).slice(-20).map((e) => `
    <li><strong>${escapeHtml(e.kind)}</strong> — ${escapeHtml(e.value)}
    <small>${escapeHtml(e.at || '')}</small></li>`).join('') || '<li>(none)</li>';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>AIOS Plan — ${escapeHtml(plan.title)}</title>
<style>
  :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, sans-serif; }
  body { max-width: 960px; margin: 2rem auto; padding: 0 1rem; line-height: 1.45; }
  h1 { font-size: 1.4rem; margin-bottom: .25rem; }
  .meta { color: #666; margin-bottom: 1rem; }
  .badge { display:inline-block; padding:.15rem .5rem; border-radius:999px; background:#eef; margin-right:.35rem; font-size:.85rem; }
  .badge.ok { background:#dcfce7; }
  .badge.bad { background:#fee2e2; }
  table { width:100%; border-collapse: collapse; margin: 1rem 0; }
  th, td { border-bottom: 1px solid #ddd; padding: .45rem .35rem; text-align:left; vertical-align:top; }
  th { font-size: .8rem; text-transform: uppercase; letter-spacing: .04em; color:#666; }
  .st-done { color: #15803d; }
  .st-blocked { color: #b91c1c; }
  .st-in_progress { color: #1d4ed8; }
  code { font-size: .9em; }
</style>
</head>
<body>
  <h1>${escapeHtml(plan.title)}</h1>
  <div class="meta">
    <span class="badge">status: ${escapeHtml(plan.status)}</span>
    <span class="badge">route: ${escapeHtml(plan.route || 'unknown')}</span>
    <span class="badge">progress: ${progress.tasksDone}/${progress.tasksTotal}</span>
    <span class="badge">evidence: ${progress.evidenceCount}</span>
    <span class="badge ${gate.ok ? 'ok' : 'bad'}">gate: ${gate.ok ? 'READY' : 'NOT READY'}</span>
  </div>
  <p><strong>Objective:</strong> ${escapeHtml(plan.objective || '')}</p>
  <p><strong>Path:</strong> <code>${escapeHtml(plan.relativePath || '')}</code></p>
  ${gate.ok ? '' : `<p class="badge bad">${escapeHtml(gate.reasons.join('; '))}</p>`}
  <h2>Tasks</h2>
  <table>
    <thead><tr><th></th><th>ID</th><th>Title</th><th>Status</th><th>Acceptance</th></tr></thead>
    <tbody>${tasks}</tbody>
  </table>
  <h2>Evidence</h2>
  <ul>${evidence}</ul>
  ${progress.nextTask ? `<p><strong>Next:</strong> <code>${escapeHtml(progress.nextTask.id)}</code> ${escapeHtml(progress.nextTask.title)}</p>` : ''}
</body>
</html>`;
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Write HTML board under .aios/planning/review.html
 */
export function writePlanShowHtml(rootDir, plan) {
  const outRel = path.join('.aios', 'planning', 'review.html');
  const outAbs = path.join(rootDir, outRel);
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });
  const html = formatPlanShowHtml(plan);
  fs.writeFileSync(outAbs, html, 'utf8');
  return { relativePath: outRel.split(path.sep).join('/'), absolutePath: outAbs };
}

export function showActivePlan(rootDir, { format = 'text' } = {}) {
  const plan = readActivePlan(rootDir);
  if (!plan) {
    return { ok: false, plan: null, text: 'No active plan.\n', htmlPath: null };
  }
  const text = formatPlanShowText(plan);
  let htmlPath = null;
  if (format === 'html' || format === 'both') {
    htmlPath = writePlanShowHtml(rootDir, plan);
  }
  return {
    ok: true,
    plan,
    progress: summarizePlanProgress(plan),
    gate: evaluateDoneGate(plan),
    text,
    htmlPath,
  };
}
