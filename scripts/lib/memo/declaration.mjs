/* Memory declaration protocol.
 *
 * The automatic-memory loop runs inside the LLM agent's own session: the model
 * sees the recalled memos and the task. Judging whether a turn is verified,
 * which recalled memo it actually used, and what the one-line takeaway is —
 * those are *semantic* decisions the agent is best placed to make, so instead
 * of guessing them with regex against free-form output, we ask the agent to
 * declare them in a small structured block appended to its reply.
 *
 * Protocol (append at the end of the reply):
 *   <!--memory: verified=yes, useful=memo:default:abc,memo:default:def, conclusion=一句话 -->
 *
 *   verified   = yes | no   (did this turn produce a verified, durable fact?)
 *   useful     = comma-separated eventIds the agent actually referenced
 *   conclusion = optional one-line takeaway used to lead the memo excerpt
 *
 * The harness only *parses* this block. If the agent emits none, the harness
 * falls back to deterministic signals (exit code / status) and never attempts
 * to infer semantics from prose.
 */
export const MEMORY_DECL_OPEN = '<!--memory:';
export const MEMORY_DECL_CLOSE = '-->';

/* Parse the trailing memory declaration block out of an agent reply.
 * Returns { verified, useful, conclusion, found } where:
 *   - found      true when a declaration block was present and parsed
 *   - verified   true|false|undefined (undefined = not declared)
 *   - useful     array of eventId strings
 *   - conclusion string | undefined
 * Deliberately conservative: malformed blocks yield found=false so the caller
 * can fall back to deterministic signals. No semantic regex guessing. */
export function parseMemoryDeclaration(output = '') {
  const source = String(output || '');
  const openIdx = source.lastIndexOf(MEMORY_DECL_OPEN);
  if (openIdx === -1) return { found: false, verified: undefined, useful: [], conclusion: undefined };
  const afterOpen = openIdx + MEMORY_DECL_OPEN.length;
  const closeIdx = source.indexOf(MEMORY_DECL_CLOSE, afterOpen);
  if (closeIdx === -1) return { found: false, verified: undefined, useful: [], conclusion: undefined };
  const body = source.slice(afterOpen, closeIdx).trim();
  // Reject a clearly truncated/malformed body.
  if (!body) return { found: false, verified: undefined, useful: [], conclusion: undefined };

  const verified = parseVerifiedField(body);
  const useful = parseUsefulField(body);
  const conclusion = parseConclusionField(body);
  return { found: true, verified, useful, conclusion };
}

/* Remove the trailing memory declaration block from an agent reply so the
 * protocol metadata never leaks into persisted memory text or excerpts. */
export function stripMemoryDeclaration(output = '') {
  const source = String(output || '');
  const openIdx = source.lastIndexOf(MEMORY_DECL_OPEN);
  if (openIdx === -1) return source;
  const afterOpen = openIdx + MEMORY_DECL_OPEN.length;
  const closeIdx = source.indexOf(MEMORY_DECL_CLOSE, afterOpen);
  if (closeIdx === -1) return source;
  // Keep anything before the block; drop the block and any trailing whitespace.
  return source.slice(0, openIdx).trimEnd();
}

function parseVerifiedField(body) {
  const m = body.match(/verified\s*[:=]\s*([^\s,;|}]+)/iu);
  if (!m) return undefined;
  const value = m[1].trim().toLowerCase();
  if (['yes', 'true', 'y', '1', 'ok', 'verified'].includes(value)) return true;
  if (['no', 'false', 'n', '0', 'unverified', 'not'].includes(value)) return false;
  return undefined;
}

function parseUsefulField(body) {
  const m = body.match(/useful\s*[:=]\s*([^\s|}]+(?:\s*,\s*[^\s|}]+)*)/iu);
  if (!m) return [];
  return m[1]
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

function parseConclusionField(body) {
  const m = body.match(/conclusion\s*[:=]\s*([^|}]*)/iu);
  if (!m) return undefined;
  const value = m[1].trim();
  return value || undefined;
}

/* Instruction block injected into the agent's prompt so it knows to emit the
 * declaration. Attached after the recall block so the agent sees what memos
 * it may reference. Compact, single source of truth for the protocol. */
export function buildMemoryDeclarationInstruction() {
  return [
    '',
    '## AIOS MEMORY DECLARATION',
    'When you finish, append a single trailing line declaring what this turn',
    'produced, so project memory can be updated accurately. The model that wrote',
    'this reply is the only one who knows the truth — do not let a fallback guess.',
    `Format (exactly one block, at the very end of your reply):`,
    `  ${MEMORY_DECL_OPEN} verified=yes|no, useful=<eventId1,eventId2>, conclusion=<one-line takeaway> ${MEMORY_DECL_CLOSE}`,
    '- verified=yes only when this turn produced a confirmed, durable fact',
    '  (e.g. a fix you ran and verified, a root cause you established).',
    '- useful: list the recalled eventIds above that you actually referenced. Omit if none.',
    '- conclusion: one line capturing the takeaway; omit if nothing durable.',
    '',
  ].join('\n');
}
