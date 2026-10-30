// scripts/lib/foundation/agents/brief/index.mjs
//
// Dispatch brief: the self-contained packet a subagent can work from when it
// starts with a fresh context window. This module is the single owner of the
// brief shape; it never reads the conversation, the session, or the filesystem.
// Everything it emits comes from the structured input the caller passes in.
//
// Why this exists: a harness that forks the parent conversation hides the
// problem; a harness that starts fresh needs the facts spelled out. If the
// brief is incomplete, inspect authorized sources before reporting `blocked`;
// never invent missing task facts or reconstruct a parent transcript.

export const DISPATCH_BRIEF_SCHEMA_VERSION = 1;
export const DISPATCH_BRIEF_SCHEMA_REL_PATH = 'scripts/lib/tooling/specs/registry/dispatch-brief.schema.v1.json';
export const DEFAULT_HANDOFF_SCHEMA_REL_PATH = 'scripts/lib/tooling/specs/registry/agent-handoff.schema.json';

export const DISPATCH_BRIEF_FORBIDDEN_DEFAULTS = Object.freeze([
  'relying on implicit parent conversation history',
  'reading the parent transcript',
  'inventing unverified task facts',
]);

function asStringList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? '').trim()).filter(Boolean);
}

function normalizeUpstreamRef(ref = {}) {
  const kind = String(ref?.kind || '').trim().toLowerCase();
  const path = String(ref?.path || '').trim();
  const sha = String(ref?.sha || '').trim();
  const note = String(ref?.note || '').trim();
  // 中文注释：不完整或不认识的 ref 原样返回（只做 trim），让 validateDispatchBrief
  // 报出精确原因；在这里静默丢掉会让调用方以为 brief 是完整的。
  return {
    kind,
    ...(path ? { path } : {}),
    ...(sha ? { sha } : {}),
    ...(note ? { note } : {}),
  };
}

/**
 * Pure: structured input in, validated brief out. Throws on input that cannot
 * produce a workable brief, so a caller can never ship a half-brief silently.
 */
export function buildDispatchBrief({
  workItemId = '',
  objective = '',
  role = '',
  ownedPathPrefixes = [],
  acceptance = [],
  upstreamRefs = [],
  forbidden = [],
  outputSchema = DEFAULT_HANDOFF_SCHEMA_REL_PATH,
  schemaVersion = DISPATCH_BRIEF_SCHEMA_VERSION,
} = {}) {
  const brief = {
    schemaVersion,
    workItemId: String(workItemId || '').trim(),
    objective: String(objective || '').trim(),
    ...(role ? { role: String(role).trim() } : {}),
    ownedPathPrefixes: asStringList(ownedPathPrefixes),
    acceptance: asStringList(acceptance),
    upstreamRefs: (Array.isArray(upstreamRefs) ? upstreamRefs : []).map(normalizeUpstreamRef),
    forbidden: [...DISPATCH_BRIEF_FORBIDDEN_DEFAULTS, ...asStringList(forbidden)],
    outputSchema: String(outputSchema || DEFAULT_HANDOFF_SCHEMA_REL_PATH).trim(),
  };
  const result = validateDispatchBrief(brief);
  if (!result.ok) {
    throw new Error(`invalid dispatch brief: ${result.errors.join('; ')}`);
  }
  return brief;
}

// 纯函数：只查结构事实，不猜语义。缺字段就是缺字段，不补默认值把它变成"看起来完整"。
export function validateDispatchBrief(brief = {}) {
  const errors = [];
  if (Number(brief?.schemaVersion) !== DISPATCH_BRIEF_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${DISPATCH_BRIEF_SCHEMA_VERSION}`);
  }
  if (!String(brief?.objective || '').trim()) {
    errors.push('objective is required');
  }
  if (!Array.isArray(brief?.ownedPathPrefixes)) {
    errors.push('ownedPathPrefixes must be an array');
  }
  if (!Array.isArray(brief?.acceptance)) {
    errors.push('acceptance must be an array');
  }
  const refs = Array.isArray(brief?.upstreamRefs) ? brief.upstreamRefs : null;
  if (!refs) {
    errors.push('upstreamRefs must be an array');
  } else {
    refs.forEach((ref, index) => {
      if (!ref || typeof ref !== 'object') {
        errors.push(`upstreamRefs[${index}] must be an object`);
        return;
      }
      if (!String(ref.kind || '').trim()) errors.push(`upstreamRefs[${index}].kind is required`);
      if (!String(ref.path || '').trim() && !String(ref.sha || '').trim()) {
        errors.push(`upstreamRefs[${index}] needs path or sha`);
      }
    });
  }
  if (!Array.isArray(brief?.forbidden) || brief.forbidden.length === 0) {
    errors.push('forbidden must list at least one rule');
  }
  if (!String(brief?.outputSchema || '').trim()) {
    errors.push('outputSchema is required');
  }
  return { ok: errors.length === 0, errors };
}
