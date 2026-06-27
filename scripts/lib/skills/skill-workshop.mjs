/**
 * Skill Workshop — 受控技能自生成闭环
 *
 * Pure file ops + JSON bookkeeping. No LLM calls, no background processes.
 *
 * Commands:
 *   propose  <description>     — Create a new skill proposal
 *   review   <id> --approve|--reject|--quarantine  — Set proposal status
 *   apply    <id>              — Copy approved proposal into skill-sources/
 *   rollback <name>            — Restore previous version from lock history
 *   index    --scan            — Rebuild .aios/skills/index.json from skill-sources/
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { scanSkillsSources } from './source-tree.mjs';
import { readInstallPolicy, checkPolicy, policyDenialError } from './install-policy.mjs';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/** Workshop root inside .aios/ */
export function workshopRoot(rootDir) {
  return path.join(rootDir, '.aios', 'skills');
}

/** Proposals directory */
export function proposalsDir(rootDir) {
  return path.join(workshopRoot(rootDir), 'proposals');
}

/** Index file path */
export function indexFilePath(rootDir) {
  return path.join(workshopRoot(rootDir), 'index.json');
}

// ---------------------------------------------------------------------------
// Index helpers
// ---------------------------------------------------------------------------

const INDEX_SCHEMA = {
  format_version: 1,
  skills: [],
};

/** Read the current index (empty if missing or corrupt). */
export function readIndex(rootDir) {
  const indexFile = indexFilePath(rootDir);
  if (!fs.existsSync(indexFile)) {
    return { ...INDEX_SCHEMA, skills: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(indexFile, 'utf8'));
  } catch {
    return { ...INDEX_SCHEMA, skills: [] };
  }
}

/** Write index atomically (tmp + rename). */
export function writeIndex(rootDir, index) {
  const p = indexFilePath(rootDir);
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(index, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, p);
}

/** Compute SHA-256 hex of a file. */
function sha256File(filePath) {
  if (!fs.existsSync(filePath)) return '';
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

// ---------------------------------------------------------------------------
// skillIndexScan — rebuild index.json from skill-sources/
// ---------------------------------------------------------------------------

export function skillIndexScan({ rootDir, stdout = process.stdout } = {}) {
  const scanned = scanSkillsSources(rootDir);
  const skills = scanned.map((entry) => {
    const skillDir = path.join(rootDir, 'skill-sources', entry.relativeSkillPath);
    const skillMd = path.join(skillDir, 'SKILL.md');
    const hash = sha256File(skillMd);
    return {
      name: entry.installCatalogName || entry.relativeSkillPath.split('/').pop(),
      path: skillMd.startsWith(rootDir + '/') ? skillMd.slice(rootDir.length + 1) : skillMd,
      hash,
      origin: 'vendored',
    };
  });

  const index = { format_version: 1, skills };
  writeIndex(rootDir, index);
  stdout.write(`[ok] skill index scanned: ${skills.length} skills written to .aios/skills/index.json\n`);
  return { exitCode: 0 };
}

// ---------------------------------------------------------------------------
// propose — create a new skill proposal
// ---------------------------------------------------------------------------

export function propose({ rootDir, description = '', stdout = process.stdout } = {}) {
  const propsDir = proposalsDir(rootDir);
  if (!fs.existsSync(propsDir)) {
    fs.mkdirSync(propsDir, { recursive: true });
  }

  const id = `prop-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const proposalPath = path.join(propsDir, id);
  fs.mkdirSync(proposalPath, { recursive: true });

  const proposal = {
    id,
    status: 'pending',
    createdAt: new Date().toISOString(),
    description: description || '(no description)',
  };

  fs.writeFileSync(
    path.join(proposalPath, 'proposal.json'),
    JSON.stringify(proposal, null, 2) + '\n',
    'utf8',
  );

  // Write a draft SKILL.md as a starting point
  fs.writeFileSync(
    path.join(proposalPath, 'SKILL.md'),
    `---\nname: ${proposal.id}\ndescription: ${description || 'New skill proposal'}\nclients: [codex]\nscopes: [global, project]\n---\n\n# ${description || 'New Skill'}\n\n<!-- Edit this file to define the skill behavior -->\n`,
    'utf8',
  );

  stdout.write(`[ok] proposal created: ${id}\n`);
  stdout.write(`     ${proposalPath}\n`);
  return { exitCode: 0, proposal };
}

// ---------------------------------------------------------------------------
// review — approve, reject, or quarantine a proposal
// ---------------------------------------------------------------------------

export function review({ rootDir, id, action = '', stdout = process.stdout, stderr = process.stderr } = {}) {
  const validActions = new Set(['approve', 'reject', 'quarantine']);
  if (!validActions.has(action)) {
    stderr.write(`[err] review action must be one of: ${[...validActions].join(', ')}\n`);
    return { exitCode: 1 };
  }

  const proposalPath = path.join(proposalsDir(rootDir), id);
  const propFile = path.join(proposalPath, 'proposal.json');
  if (!fs.existsSync(propFile)) {
    stderr.write(`[err] proposal not found: ${id}\n`);
    return { exitCode: 1 };
  }

  const proposal = JSON.parse(fs.readFileSync(propFile, 'utf8'));
  if (proposal.status !== 'pending') {
    stderr.write(`[err] proposal ${id} already has status "${proposal.status}" — can only review pending proposals\n`);
    return { exitCode: 1 };
  }

  proposal.status = action;
  proposal.reviewedAt = new Date().toISOString();
  fs.writeFileSync(propFile, JSON.stringify(proposal, null, 2) + '\n', 'utf8');

  stdout.write(`[ok] proposal ${id} → ${action}\n`);
  return { exitCode: 0, proposal };
}

// ---------------------------------------------------------------------------
// apply — copy an approved proposal into skill-sources/ and update lock
// ---------------------------------------------------------------------------

export function apply({ rootDir, id, policyCheck = false, stdout = process.stdout, stderr = process.stderr } = {}) {
  const proposalPath = path.join(proposalsDir(rootDir), id);
  const propFile = path.join(proposalPath, 'proposal.json');
  if (!fs.existsSync(propFile)) {
    stderr.write(`[err] proposal not found: ${id}\n`);
    return { exitCode: 1 };
  }

  const proposal = JSON.parse(fs.readFileSync(propFile, 'utf8'));
  if (proposal.status !== 'approve') {
    stderr.write(`[err] proposal ${id} status is "${proposal.status}" — only approved proposals can be applied\n`);
    return { exitCode: 1 };
  }

  // Read draft SKILL.md frontmatter to get the skill name
  const draftSkillMd = path.join(proposalPath, 'SKILL.md');
  if (!fs.existsSync(draftSkillMd)) {
    stderr.write(`[err] proposal ${id} has no SKILL.md\n`);
    return { exitCode: 1 };
  }

  // Use the ID as skill name; user can rename later
  const skillName = id;

  // --- Operator install policy check -------------------------------------
  // The policy gates which skills may be installed. The name checked against
  // the allow/deny globs is the destination path prefix `skill-sources/<id>`,
  // matching the default allow pattern `skill-sources/*`.
  const policyName = `skill-sources/${skillName}`;
  const policy = readInstallPolicy(rootDir);
  const hasProvenance = Boolean(proposal.provenance);
  const decision = checkPolicy(policyName, policy, { hasProvenance });

  if (policyCheck) {
    // Dry-run: report the decision without applying.
    if (decision.allowed) {
      stdout.write(`[policy] skill "${skillName}" would be ALLOWED by install policy\n`);
      stdout.write(`         ${decision.reason}\n`);
    } else {
      stdout.write(`[policy] skill "${skillName}" would be DENIED by install policy\n`);
      stdout.write(`         ${decision.reason}\n`);
    }
    return { exitCode: decision.allowed ? 0 : 1, decision };
  }

  if (!decision.allowed) {
    const err = policyDenialError(skillName, decision.reason);
    stderr.write(`[err] ${err.message}\n`);
    return { exitCode: 1, decision };
  }

  // Destination: skill-sources/<skillName>/
  const destDir = path.join(rootDir, 'skill-sources', skillName);
  if (fs.existsSync(destDir)) {
    stderr.write(`[err] skill-sources/${skillName} already exists\n`);
    return { exitCode: 1 };
  }

  fs.mkdirSync(destDir, { recursive: true });
  fs.cpSync(proposalPath, destDir, { recursive: true });

  // Update skills-lock.json
  const lockPath = path.join(rootDir, 'skills-lock.json');
  const lock = fs.existsSync(lockPath) ? JSON.parse(fs.readFileSync(lockPath, 'utf8')) : { version: 1, skills: {} };

  const skillMdPath = path.join(destDir, 'SKILL.md');
  const hash = sha256File(skillMdPath);

  // Save current lock entry for rollback
  const previousEntry = lock.skills[skillName] ? { ...lock.skills[skillName] } : null;

  lock.skills[skillName] = {
    source: 'aios-workshop',
    sourceType: 'agent-generated',
    version: '1.0.0',
    path: `skill-sources/${skillName}/SKILL.md`,
    origin: 'agent-generated',
    appliedAt: new Date().toISOString(),
    computedHash: hash,
    history: previousEntry ? [previousEntry] : [],
  };

  fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n', 'utf8');

  // Mark proposal as applied
  proposal.status = 'applied';
  proposal.appliedAt = new Date().toISOString();
  fs.writeFileSync(propFile, JSON.stringify(proposal, null, 2) + '\n', 'utf8');

  stdout.write(`[ok] proposal ${id} applied → skill-sources/${skillName}/\n`);
  stdout.write(`     lock updated with hash ${hash.slice(0, 16)}...\n`);
  return { exitCode: 0 };
}

// ---------------------------------------------------------------------------
// rollback — restore previous version from lock history
// ---------------------------------------------------------------------------

export function rollback({ rootDir, name, stdout = process.stdout, stderr = process.stderr } = {}) {
  const lockPath = path.join(rootDir, 'skills-lock.json');
  if (!fs.existsSync(lockPath)) {
    stderr.write('[err] skills-lock.json not found\n');
    return { exitCode: 1 };
  }

  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  const entry = lock.skills[name];
  if (!entry) {
    stderr.write(`[err] skill "${name}" not found in skills-lock.json\n`);
    return { exitCode: 1 };
  }

  const history = entry.history;
  if (!history || history.length === 0) {
    stderr.write(`[err] skill "${name}" has no previous version to roll back to\n`);
    return { exitCode: 1 };
  }

  // Get the most recent history entry
  const previous = history.pop();

  // Restore previous lock metadata
  entry.version = previous.version;
  entry.computedHash = previous.computedHash;
  entry.path = previous.path;
  entry.appliedAt = new Date().toISOString();
  entry.history = previous.history || [];

  // If the old path was different, copy files back
  const currentDir = path.join(rootDir, path.dirname(entry.path));
  // We don't have the old files stored — the history just has metadata.
  // For a real rollback, we'd need to keep snapshots. For now:
  // Remove the current version SKILL.md and replace with a marker
  // The lock metadata is restored so the next sync can re-derive.

  fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n', 'utf8');

  stdout.write(`[ok] skill "${name}" rolled back to previous version (metadata only)\n`);
  stdout.write(`     previous hash: ${previous.computedHash?.slice(0, 16)}...\n`);
  stdout.write(`     [warn] file content not restored — run "aios skill index --scan" to rebuild from sources\n`);
  return { exitCode: 0 };
}
