import { createHash } from 'node:crypto';
import { GatewayRouteError } from '../router.mjs';
import { selectGroupMember, GROUP_ROUTING_MODES } from '../../routing/groups.mjs';

export function boundedCache({ maxEntries = 1024, ttlMs = 30 * 60_000, now = Date.now } = {}) {
  const entries = new Map();
  return {
    get(key) {
      const hit = entries.get(key);
      if (!hit) return null;
      if (now() - hit.at >= ttlMs) { entries.delete(key); return null; }
      entries.delete(key);
      entries.set(key, hit);
      return hit.value;
    },
    set(key, value) {
      if (!key) return;
      entries.delete(key);
      entries.set(key, { at: now(), value });
      while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
    },
    delete(key) { entries.delete(key); },
  };
}

// Only a digest is retained; credentials and registry contents never enter pins
// or decision logs. Stable key order avoids invalidation on JSON key reordering.
export function configurationFingerprint(registry, env = {}) {
  const refs = new Set();
  const canonical = (value) => {
    if (typeof value === 'string' && /^env:[A-Za-z_][A-Za-z0-9_]*$/u.test(value)) refs.add(value.slice(4));
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
    return value;
  };
  const document = canonical(registry);
  for (const key of Object.keys(env)) if (key.startsWith('AIOS_MODEL_')) refs.add(key);
  const referencedEnv = [...refs].sort().map((key) => [key, env[key] || '']);
  return createHash('sha256').update(JSON.stringify([document, referencedEnv])).digest('hex');
}

const safeId = (value) => typeof value === 'string' && value.length > 0 && value.length <= 512 ? value : null;
const array = (value) => Array.isArray(value) ? value : [];
const sameRoute = (a, b) => a.modelId === b.modelId && a.providerId === b.providerId && a.targetProtocol === b.targetProtocol;
const samePin = (a, b) => sameRoute(a, b) && a.account === b.account && a.targetRef === b.targetRef && a.fingerprint === b.fingerprint;
const TOOL_CONFLICT = Symbol('tool affinity conflict');

function continuationIds(body, protocol) {
  if (protocol === 'openai-response') return array(body.input).filter((item) => item?.type === 'function_call_output').map((item) => item.call_id);
  if (protocol === 'gemini') return array(array(body.contents).at(-1)?.parts).filter((part) => part?.functionResponse).map((part) => part.functionResponse.id);
  const messages = array(body.messages);
  const last = messages.at(-1);
  if (protocol === 'claude') return array(last?.content).filter((item) => item?.type === 'tool_result').map((item) => item.tool_use_id);
  const ids = [];
  for (let i = messages.length - 1; i >= 0 && ['tool', 'function'].includes(messages[i]?.role); i--) ids.push(messages[i].tool_call_id);
  return ids;
}

function outputIds(json, protocol) {
  if (protocol === 'claude') return array(json?.content).filter((item) => item?.type === 'tool_use').map((item) => item.id);
  if (protocol === 'openai-response') return array(json?.output).filter((item) => item?.type === 'function_call').map((item) => item.call_id);
  if (protocol === 'openai-chat') return array(json?.choices?.[0]?.message?.tool_calls).map((item) => item.id);
  if (protocol === 'gemini') return array(json?.candidates?.[0]?.content?.parts).filter((part) => part?.functionCall).map((part) => part.functionCall.id);
  return [];
}

export function createRoutingAffinity(options = {}) {
  const cache = boundedCache(options);
  // State for stateful group modes (rotate/usage), keyed by configuration fingerprint
  // + group id. Bounded and in-memory only; never persisted or logged.
  const groupState = boundedCache(options);
  return function requestAffinity({ protocol, client, role, sessionId, body, fingerprint }) {
    const key = (kind, id) => safeId(id) ? JSON.stringify([protocol, client, role, kind, id]) : null;
    const sessionKey = key('session', sessionId);
    const opaque = protocol === 'openai-response' && Boolean(body.previous_response_id || body.conversation);
    const conversationId = typeof body.conversation === 'string' ? body.conversation : body.conversation?.id;
    const opaqueKeys = opaque ? [body.previous_response_id && key('response', body.previous_response_id), body.conversation && key('conversation', conversationId)].filter((item) => item !== undefined && item !== false && item !== '') : [];
    const tools = continuationIds(body, protocol);
    const toolPins = tools.map((id) => cache.get(key('tool', id)));
    if (toolPins.includes(TOOL_CONFLICT)) throw new GatewayRouteError('Tool continuation ID has conflicting owners', 'AFFINITY_TARGET_CONFLICT', 400);
    const opaquePins = opaqueKeys.map((id) => cache.get(id));
    const pins = [...opaquePins, ...toolPins].filter(Boolean);
    const hardPin = pins[0];
    if (pins.some((pin) => !samePin(pin, hardPin))) throw new GatewayRouteError('Continuation IDs refer to incompatible routes', 'AFFINITY_TARGET_CONFLICT', 400);
    const sessionPin = cache.get(sessionKey);
    return {
      opaque,
      sessionKey,
      select(candidates) {
        const selected = candidates[0]?.selected;
        const grouped = selected?.groupId !== null && selected?.groupId !== undefined;
        if (grouped && sessionPin?.targetRef === selected.targetRef && hardPin && !samePin(sessionPin, hardPin)) {
          throw new GatewayRouteError('Continuation IDs conflict with the bound session', 'AFFINITY_TARGET_CONFLICT', 400);
        }
        if (grouped && opaque && (!opaquePins.length || opaquePins.some((pin) => !pin))) {
          throw new GatewayRouteError('Unknown opaque Responses continuation; select its concrete model or restart the conversation', 'RESPONSE_AFFINITY_UNKNOWN', 400);
        }
        if (grouped && toolPins.some((pin, index) => !pin && (safeId(tools[index]) || !sessionPin || sessionPin.targetRef !== selected.targetRef))) {
          throw new GatewayRouteError('Unknown grouped tool continuation', 'TOOL_AFFINITY_UNKNOWN', 400);
        }
        const pin = hardPin || (grouped && sessionPin?.targetRef === selected.targetRef ? sessionPin : null);
        if (!pin) {
          if (grouped && tools.length) throw new GatewayRouteError('Unknown grouped tool continuation', 'TOOL_AFFINITY_UNKNOWN', 400);
          let ordered = candidates;
          // Stateful group modes pick a member when there is no continuation pin.
          // A pinned session keeps its member, so a conversation stays on one model.
          const mode = selected?.routing;
          if (grouped && GROUP_ROUTING_MODES.has(mode) && (mode === 'rotate' || mode === 'usage')) {
            const key = JSON.stringify(['group-mode', fingerprint, selected.groupId]);
            const memberIds = candidates.map((item) => item.selected?.modelId);
            const current = groupState.get(key) || {};
            const chosen = selectGroupMember(memberIds, mode, current);
            groupState.set(key, chosen.state);
            const index = memberIds.indexOf(chosen.member);
            if (index > 0) ordered = [candidates[index], ...candidates.filter((_, i) => i !== index)];
          }
          return { candidates: ordered, pin: opaque ? { account: ordered[0]?.accounts[0] } : null };
        }
        if (pin.targetRef !== selected?.targetRef) throw new GatewayRouteError('A continuation cannot change its target', 'AFFINITY_TARGET_CONFLICT', 400);
        const candidate = candidates.find((item) => sameRoute(item.selected, pin));
        if (pin.fingerprint !== fingerprint || !candidate || !candidate.accounts.includes(pin.account)) {
          throw new GatewayRouteError('The continuation cannot move to a different configuration/model/provider/account', 'AFFINITY_ROUTE_UNAVAILABLE', 503);
        }
        return { candidates: [candidate], pin };
      },
      remember(route, account, json) {
        if (json?.error || ['failed', 'cancelled', 'incomplete', 'in_progress', 'queued'].includes(json?.status)) return;
        const pin = { targetRef: route.targetRef, modelId: route.modelId, providerId: route.providerId, targetProtocol: route.targetProtocol, groupId: route.groupId, account, fingerprint };
        if (route.groupId !== null && route.groupId !== undefined) cache.set(sessionKey, pin);
        if (protocol === 'openai-response') {
          cache.set(key('response', json?.id), pin);
          cache.set(key('conversation', typeof json?.conversation === 'string' ? json.conversation : json?.conversation?.id), pin);
          cache.set(key('conversation', conversationId), pin);
        }
        for (const id of outputIds(json, protocol).slice(0, 256)) {
          const toolKey = key('tool', id);
          const previous = cache.get(toolKey);
          // Ambiguous provider IDs stay conflicted in the same bounded TTL cache.
          const conflict = previous && (previous === TOOL_CONFLICT || !samePin(previous, pin));
          cache.set(toolKey, conflict ? TOOL_CONFLICT : pin);
        }
      },
    };
  };
}

// Bounded line/frame state survives arbitrary byte and CRLF fragmentation. Only
// terminal, successful EOF publishes metadata; cancellation never calls flush.
export function observeAffinityStream(body, protocol, remember) {
  const decoder = new TextDecoder();
  let line = '';
  let lines = [];
  let size = 0;
  let overflow = false;
  let lastCR = false;
  let lineHasData = false;
  let failed = false;
  let completed = false;
  const chatTools = new Map();
  const metadata = { content: [], output: [], choices: [{ message: { tool_calls: [] } }], candidates: [{ content: { parts: [] } }] };
  const accept = () => {
    const data = lines.filter((entry) => entry.startsWith('data:')).map((entry) => entry.slice(5).trimStart()).join('\n');
    if (data === '[DONE]') { if (protocol === 'openai-chat') completed = true; return; }
    let json;
    try { json = JSON.parse(data); } catch { if (data) failed = true; return; }
    if (!json || typeof json !== 'object') { failed = true; return; }
    if (json?.error || ['error', 'response.failed', 'response.incomplete', 'response.cancelled'].includes(json?.type)
      || ['failed', 'cancelled', 'incomplete'].includes(json.response?.status)) failed = true;
    if (protocol === 'openai-response') {
      if (safeId(json.response?.id)) metadata.id = json.response.id;
      if (json.type === 'response.completed' && [undefined, 'completed'].includes(json.response?.status)) completed = true;
      const conversation = typeof json.response?.conversation === 'string' ? json.response.conversation : json.response?.conversation?.id;
      if (safeId(conversation)) metadata.conversation = conversation;
      if (json.item?.type === 'function_call' && metadata.output.length < 256) metadata.output.push({ type: 'function_call', call_id: json.item.call_id });
      if (Array.isArray(json.response?.output)) metadata.output = json.response.output.filter((item) => item?.type === 'function_call').slice(0, 256).map((item) => ({ type: 'function_call', call_id: item.call_id }));
    } else if (protocol === 'claude') {
      if (json.type === 'message_stop') completed = true;
      if (json.content_block?.type === 'tool_use' && metadata.content.length < 256) metadata.content.push({ type: 'tool_use', id: json.content_block.id });
    } else if (protocol === 'openai-chat') {
      // Chat IDs are fragments, just like names/arguments in ProtocolInput.chat.
      for (const call of array(json.choices?.[0]?.delta?.tool_calls)) {
        if (!Number.isSafeInteger(call?.index) || call.index < 0 || (call.id !== undefined && typeof call.id !== 'string')) { failed = true; return; }
        if (!chatTools.has(call.index)) {
          if (chatTools.size >= 256) { failed = true; return; }
          const tool = { id: '' };
          chatTools.set(call.index, tool);
          metadata.choices[0].message.tool_calls.push(tool);
        }
        const tool = chatTools.get(call.index);
        const fragment = call.id ?? '';
        if (tool.id.length + fragment.length > 512) { failed = true; return; }
        tool.id += fragment;
      }
    } else if (protocol === 'gemini') {
      if (json.candidates?.some((candidate) => candidate.finishReason)) completed = true;
      for (const part of array(json.candidates?.[0]?.content?.parts)) {
        if (safeId(part?.functionCall?.id) && metadata.candidates[0].content.parts.length < 256) metadata.candidates[0].content.parts.push({ functionCall: { id: part.functionCall.id } });
      }
    }
  };
  const endLine = () => {
    if (!lineHasData) {
      if (!overflow) accept();
      lines = []; size = 0; overflow = false;
    } else if (!overflow) lines.push(line);
    line = '';
    lineHasData = false;
  };
  const consume = (text) => {
    for (const char of text) {
      if (char === '\n' && lastCR) { lastCR = false; continue; }
      lastCR = char === '\r';
      if (char === '\r' || char === '\n') endLine();
      else {
        lineHasData = true;
        if (++size > 65_536) { line = ''; lines = []; overflow = true; failed = true; }
        if (!overflow) line += char;
      }
    }
  };
  return body.pipeThrough(new TransformStream({
    transform(chunk, controller) { controller.enqueue(chunk); consume(decoder.decode(chunk, { stream: true })); },
    flush() {
      consume(decoder.decode());
      if (line) endLine();
      if (!overflow && lines.length) accept();
      if ([...chatTools.values()].some((tool) => !safeId(tool.id))) failed = true;
      if (!failed && completed) remember(metadata);
    },
  }));
}
