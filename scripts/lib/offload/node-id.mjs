import crypto from 'node:crypto';

const NODE_ID_PATTERN = /^n(\d{4,})-([a-f0-9]{6})$/;

export function formatNodeId(seq, hash) {
  const safeSeq = String(Math.max(1, Math.floor(Number(seq) || 1))).padStart(4, '0');
  const safeHash = String(hash || '').toLowerCase().replace(/[^a-f0-9]/g, '').slice(0, 6).padEnd(6, '0');
  return `n${safeSeq}-${safeHash}`;
}

export function parseNodeId(value) {
  const match = NODE_ID_PATTERN.exec(String(value || '').trim());
  if (!match) return null;
  return { seq: Number(match[1]), hash: match[2] };
}

export function isNodeId(value) {
  return parseNodeId(value) !== null;
}

export function hashInput(...parts) {
  const hasher = crypto.createHash('sha1');
  for (const part of parts) {
    hasher.update(typeof part === 'string' ? part : JSON.stringify(part ?? null));
    hasher.update('\0');
  }
  return hasher.digest('hex').slice(0, 6);
}

export function nextNodeId({ seq, toolName, toolInput }) {
  return formatNodeId(seq, hashInput(toolName, toolInput));
}
