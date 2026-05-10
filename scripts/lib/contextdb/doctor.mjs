import { promises as fs } from 'node:fs';
import path from 'node:path';

export async function runDoctorChecks(workspaceRoot) {
  const root = path.resolve(workspaceRoot || process.cwd());
  const wsDir = path.join(root, 'memory', 'workspace');
  const checks = await Promise.all([
    checkWorkspaceMeta(wsDir),
    checkSkillIndexDrift(root, wsDir),
    checkConflictMarkers(wsDir),
  ]);

  const status = checks.some(c => c.status === 'fail')
    ? 'unhealthy'
    : checks.some(c => c.status === 'warn')
    ? 'warning'
    : 'healthy';

  return { status, checks, runAt: new Date().toISOString() };
}

async function checkWorkspaceMeta(wsDir) {
  const id = 'workspace-meta';
  const label = 'Workspace meta.json exists with required fields';
  try {
    const raw = await fs.readFile(path.join(wsDir, 'meta.json'), 'utf8');
    const meta = JSON.parse(raw);
    if (meta.schemaVersion == null || meta.workspaceVersion == null) {
      return { id, label, status: 'fail', detail: 'meta.json missing schemaVersion or workspaceVersion' };
    }
    return { id, label, status: 'pass', detail: `schemaVersion=${meta.schemaVersion} workspaceVersion=${meta.workspaceVersion}` };
  } catch {
    return { id, label, status: 'warn', detail: 'meta.json not found — workspace not initialized' };
  }
}

async function checkSkillIndexDrift(root, wsDir) {
  const id = 'skill-index-drift';
  const label = 'Skill index matches files in memory/skills/';
  const skillsDir = path.join(root, 'memory', 'skills');

  let fileCount = 0;
  try {
    const files = await fs.readdir(skillsDir);
    fileCount = files.filter(f => f.endsWith('.json')).length;
  } catch { /* dir missing = 0 files */ }

  let indexCount = 0;
  try {
    const raw = await fs.readFile(path.join(wsDir, 'active-skills.json'), 'utf8');
    const data = JSON.parse(raw);
    indexCount = Array.isArray(data.skills) ? data.skills.length : 0;
  } catch { /* missing index = 0 entries */ }

  if (fileCount !== indexCount) {
    return { id, label, status: 'warn', detail: `${fileCount} skill file(s) vs ${indexCount} index entry(ies)` };
  }
  return { id, label, status: 'pass', detail: `${fileCount} skill(s) in sync` };
}

async function checkConflictMarkers(wsDir) {
  const id = 'conflict-markers';
  const label = 'No unresolved conflict markers';
  const conflictsDir = path.join(wsDir, 'conflicts');
  try {
    const files = await fs.readdir(conflictsDir);
    const count = files.filter(f => f.endsWith('.json')).length;
    if (count > 0) {
      return { id, label, status: 'warn', detail: `${count} unresolved conflict file(s)` };
    }
  } catch { /* dir missing = no conflicts */ }
  return { id, label, status: 'pass', detail: 'No conflict markers found' };
}
