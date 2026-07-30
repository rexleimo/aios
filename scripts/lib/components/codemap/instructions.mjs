import fs from 'node:fs';
import path from 'node:path';

import { AGENTS_MD_MARKERS, CLIENT_INSTRUCTION_FILES } from './constants.mjs';
import { normalizeClientList } from './selection.mjs';

const AGENTS_MD_CRG_SECTION = `## MCP Tools: code-review-graph

This project has a structural knowledge graph. **Use it at each decision point in your workflow.**

### Decision checkpoints (mandatory)

| When | Call | Why |
|------|------|-----|
| Before doing anything | \`get_minimal_context(task="...")\` | Project context + suggested next steps |
| Before modifying code | \`get_impact_radius(detail_level="minimal")\` | Check blast radius; if risk=high, re-evaluate plan |
| Before modifying code | \`query_graph(pattern="tests_for", target="...")\` | Confirm tests exist; if not, write tests first |
| After modifying code | \`detect_changes(detail_level="minimal")\` | Verify actual impact matches expected |
| Before submitting | \`get_affected_flows()\` + \`get_suggested_questions()\` | Final safety net |

### Search rules

- Finding code: \`semantic_search_nodes\` before grep
- Understanding relationships: \`query_graph\` (callers_of/callees_of/tests_for) before reading files
- Code review: \`detect_changes\` → \`get_review_context\` before reading entire files

### Parameters

- Always use \`detail_level="minimal"\`; escalate to "standard" only when insufficient
- Follow \`next_tool_suggestions\` from each response for the next tool to call

### Planning context proposals

- When an active structured-plan task has implementation targets, call AIOS MCP \`aios_plan_task\` with \`action="propose_context"\`, its \`task_id\`, and workspace-relative \`targets\` if the task has none.
- The tool derives target, caller, callee, and test candidates from this codemap, but it **does not** modify the active plan.
- Present the proposed refs to a human and have that person activate selected refs with \`aios plan task <id> --confirm-context-candidates\` (optionally repeat \`--candidate-ref <ref>\`).
- Do not claim that context will be delivered, or invoke context-dependent orchestration, until that explicit confirmation succeeds.`;

export function getCodemapInstructionSection() {
  return AGENTS_MD_CRG_SECTION;
}

export function inspectCodemapInstructionMarkers(raw = '') {
  const beginCount = String(raw).split(AGENTS_MD_MARKERS.begin).length - 1;
  const endCount = String(raw).split(AGENTS_MD_MARKERS.end).length - 1;
  const beginIndex = String(raw).indexOf(AGENTS_MD_MARKERS.begin);
  const endIndex = String(raw).indexOf(AGENTS_MD_MARKERS.end);
  return {
    beginCount,
    endCount,
    ordered: beginIndex >= 0 && endIndex > beginIndex,
    valid: beginCount === 1 && endCount === 1 && beginIndex >= 0 && endIndex > beginIndex,
  };
}

export function collectCodemapInstructionFiles(client = 'all') {
  const enabled = new Set(normalizeClientList(client));
  const seen = new Set();
  const targets = [];
  for (const target of CLIENT_INSTRUCTION_FILES) {
    if (!target.clientKeys.some((clientKey) => enabled.has(clientKey))) continue;
    if (seen.has(target.fileName)) continue;
    seen.add(target.fileName);
    targets.push(target);
  }
  return targets;
}

function injectCrgIntoInstructionFile(projectRoot, fileName, { dryRun = false, io = console } = {}) {
  const docPath = path.join(projectRoot, fileName);
  if (!fs.existsSync(docPath)) {
    if (dryRun) {
      io.log(`PLAN codemap would create ${docPath} with CRG section`);
      return;
    }
    const content = `${AGENTS_MD_MARKERS.begin}\n${AGENTS_MD_CRG_SECTION}\n${AGENTS_MD_MARKERS.end}\n`;
    fs.writeFileSync(docPath, content, 'utf8');
    io.log(`OK   codemap created ${docPath} with CRG section`);
    return;
  }

  const raw = fs.readFileSync(docPath, 'utf8');
  const beginIndex = raw.indexOf(AGENTS_MD_MARKERS.begin);
  const endIndex = raw.indexOf(AGENTS_MD_MARKERS.end);

  if (beginIndex !== -1 && endIndex !== -1) {
    const before = raw.slice(0, beginIndex);
    const after = raw.slice(endIndex + AGENTS_MD_MARKERS.end.length);
    const newSection = `${AGENTS_MD_MARKERS.begin}\n${AGENTS_MD_CRG_SECTION}\n${AGENTS_MD_MARKERS.end}`;
    const nextRaw = `${before}${newSection}${after}`;
    if (nextRaw === raw) {
      io.log(`OK   codemap ${fileName} CRG section unchanged`);
      return;
    }
    if (dryRun) {
      io.log(`PLAN codemap would update ${fileName} CRG section`);
      return;
    }
    fs.writeFileSync(docPath, nextRaw, 'utf8');
    io.log(`OK   codemap updated ${fileName} CRG section`);
    return;
  }

  const nextRaw = `${raw.replace(/\n*$/u, '')}\n\n${AGENTS_MD_MARKERS.begin}\n${AGENTS_MD_CRG_SECTION}\n${AGENTS_MD_MARKERS.end}\n`;
  if (dryRun) {
    io.log(`PLAN codemap would append CRG section to ${fileName}`);
    return;
  }
  fs.writeFileSync(docPath, nextRaw, 'utf8');
  io.log(`OK   codemap appended CRG section to ${fileName}`);
}

export function injectCrgIntoInstructionFiles(projectRoot, { dryRun = false, io = console, client = 'all' } = {}) {
  for (const target of collectCodemapInstructionFiles(client)) {
    injectCrgIntoInstructionFile(projectRoot, target.fileName, { dryRun, io });
  }
}

function removeCrgFromInstructionFile(projectRoot, fileName, { io = console } = {}) {
  const docPath = path.join(projectRoot, fileName);
  if (!fs.existsSync(docPath)) return;

  const raw = fs.readFileSync(docPath, 'utf8');
  const beginIndex = raw.indexOf(AGENTS_MD_MARKERS.begin);
  const endIndex = raw.indexOf(AGENTS_MD_MARKERS.end);
  if (beginIndex === -1 || endIndex === -1) return;

  const before = raw.slice(0, beginIndex);
  const after = raw.slice(endIndex + AGENTS_MD_MARKERS.end.length);
  let nextRaw = `${before}${after}`;
  nextRaw = nextRaw.replace(/\n{3,}/gu, '\n\n').replace(/^\s*\n/u, '').replace(/\n\s*$/u, '\n');
  fs.writeFileSync(docPath, nextRaw, 'utf8');
  io.log(`OK   codemap removed CRG section from ${fileName}`);
}

export function removeCrgFromInstructionFiles(projectRoot, { io = console, client = 'all' } = {}) {
  for (const target of collectCodemapInstructionFiles(client)) {
    removeCrgFromInstructionFile(projectRoot, target.fileName, { io });
  }
}
