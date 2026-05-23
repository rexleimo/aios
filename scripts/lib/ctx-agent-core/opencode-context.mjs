import { promises as fs } from 'node:fs';
import path from 'node:path';
import { resolveContextDbRoot } from '../aios/state-root.mjs';
import { ctx } from './contextdb-cli.mjs';

export const DEFAULT_HANDOFF_PROMPT = 'Continue from this state. Preserve constraints, avoid repeating completed work, and update the next checkpoint when done.';

export function buildOpenCodePrompt({ contextPacketPath = '', contextText = '', prompt = '', injectContext = true, promptKind = 'request' } = {}) {
  const requestText = String(prompt || '').trim();
  const inlineContext = String(contextText || '').trim();
  if (!injectContext) return requestText;

  if (contextPacketPath) {
    const handoffText = requestText || (promptKind === 'handoff' ? DEFAULT_HANDOFF_PROMPT : '');
    if (!handoffText) return `Read the context packet at "${contextPacketPath}" first.`;
    if (promptKind === 'handoff') return `Read the context packet at "${contextPacketPath}" first.\n\n${handoffText}`;
    return `Read the context packet at "${contextPacketPath}" first.\n\nThen continue with this request:\n${handoffText}`;
  }

  if (!inlineContext) return requestText || (promptKind === 'handoff' ? DEFAULT_HANDOFF_PROMPT : '');
  const handoffText = requestText || (promptKind === 'handoff' ? DEFAULT_HANDOFF_PROMPT : '');
  if (!handoffText) return inlineContext;
  if (promptKind === 'handoff') return `${inlineContext}\n\n${handoffText}`;
  return `${inlineContext}\n\n## New User Request\n${handoffText}`;
}

export async function ensureOpenCodeContextPacket({ workspaceRoot, sessionId, packAbs, contextText, baseContextText }) {
  const effectiveContext = String(contextText || '').trim();
  if (!effectiveContext) return '';
  const baseText = String(baseContextText || '').trim();
  if (packAbs && effectiveContext === baseText) return packAbs;

  const exportsDir = packAbs ? path.dirname(packAbs) : path.join(resolveContextDbRoot(workspaceRoot), 'exports');
  await fs.mkdir(exportsDir, { recursive: true });
  const filePath = packAbs ? packAbs.replace(/\.md$/u, '-opencode.md') : path.join(exportsDir, `${sessionId}-opencode-context.md`);
  await fs.writeFile(filePath, effectiveContext.endsWith('\n') ? effectiveContext : `${effectiveContext}\n`, 'utf8');
  return filePath;
}

export async function safeContextPack(workspaceRoot, { sessionId, eventLimit, packPath }, { strict = false } = {}) {
  const packAbs = path.join(workspaceRoot, packPath);
  try {
    ctx(workspaceRoot, 'context:pack', ['--session', sessionId, '--limit', eventLimit, '--out', packPath]);
    const contextText = await fs.readFile(packAbs, 'utf8');
    return { ok: true, mode: 'fresh', packAbs, contextText };
  } catch (error) {
    if (strict) throw error;
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[warn] contextdb context:pack failed: ${reason}`);
    try {
      const contextText = await fs.readFile(packAbs, 'utf8');
      if (String(contextText).trim()) {
        console.warn(`[warn] using last context packet: ${packAbs}`);
        return { ok: true, mode: 'stale', packAbs, contextText };
      }
    } catch {
      // 没有旧包时继续启动，让用户至少能进入客户端。
    }
    console.warn('[warn] continuing without context packet.');
    return { ok: false, mode: 'none', packAbs, contextText: '' };
  }
}
