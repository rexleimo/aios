import fs from 'node:fs';
import path from 'node:path';

import { AGENTS_MD_MARKERS, CLIENT_INSTRUCTION_FILES } from './constants.mjs';
import { normalizeClientList } from './selection.mjs';

const AGENTS_MD_CRG_SECTION = `## MCP Tools: code-review-graph

This project exposes a structural knowledge graph via the \`code-review-graph\` MCP. Use it only when structural relationships materially affect the current decision; do not turn routine work into a graph-tool loop.

### Bounded checkpoints

- Initial orientation: call \`get_minimal_context(task="...")\` at most once when repository structure is not already clear.
- Before a risky or multi-file change: use \`get_impact_radius(detail_level="minimal")\`; call \`query_graph(pattern="tests_for", target="...")\` only for the concrete target being changed.
- After edits: call \`detect_changes(detail_level="minimal")\` once when the graph was used or the change has meaningful blast radius.
- Before submitting: use \`get_affected_flows()\` or \`get_suggested_questions()\` only if unresolved structural risk remains.
- Finding code: prefer \`semantic_search_nodes\` when semantic graph search is likely to beat a direct repository search.
- Budget: no more than three graph calls per work item. Treat \`next_tool_suggestions\` as optional hints and never follow them recursively.

### Planning context proposals

When an active structured-plan task has implementation targets, call AIOS MCP \`aios_plan_task\` with \`action="propose_context"\`, the task id, and workspace-relative targets when the task has none. The tool derives target, caller, callee, and test candidates from codemap, but it does not modify the active plan. Present the candidate refs to a human. An explicit human-controlled CLI confirmation with \`aios plan task <id> --confirm-context-candidates\` (optionally repeated \`--candidate-ref <ref>\`) activates selected refs for orchestration; it is a process boundary, not an identity/authentication boundary. Do not claim context will be delivered before that command succeeds.`;

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
