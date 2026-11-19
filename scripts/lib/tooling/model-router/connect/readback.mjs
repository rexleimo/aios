import fs from 'node:fs';
import path from 'node:path';
import { clientConfigPaths } from './editors.mjs';
import { connectLaunchCommand } from './artifacts.mjs';
import { CONNECT_CLIENTS, artifactModelForClient, connectCapabilities, persistedConnectTarget } from './targets.mjs';
import { parseWireTarget } from '../routing/targets.mjs';
import { inspectInplaceEntry } from './config/inplace-ownership.mjs';
import { isolatedArtifactPath, isolatedOwnership } from './isolated.mjs';
import { parseConnectState, parseConnectBackup } from './config/journals.mjs';
import YAML from 'yaml';

// 新增客户端的接入态读取：直接按各自格式读原文，不套用旧的 JSON.parse 通用分支。
const GENERIC_CLIENTS = new Set(['opencode', 'zcode', 'qoder', 'gemini', 'hermes', 'grok', 'workbuddy']);
function genericObserved(client, home, fsImpl) {
  const file = home ? clientConfigPaths(home)[client]?.[0] : null;
  let text;
  try { text = file ? fsImpl.readFileSync(file, 'utf8') : null; }
  catch (error) { if (error?.code !== 'ENOENT') return { status: 'unknown', connected: false }; }
  if (text === null || text === undefined) return { status: 'missing', connected: false };
  let base, model, selected;
  try {
    if (client === 'hermes') {
      const doc = YAML.parse(text);
      selected = doc?.model?.provider === 'aios';
      base = doc?.providers?.aios?.base_url;
      model = doc?.model?.default;
    } else if (client === 'grok') {
      selected = /\[model\."aios\//u.test(text);
      base = text.match(/base_url\s*=\s*"([^"]+)"/u)?.[1];
      model = text.match(/default\s*=\s*"aios\/([^"]+)"/u)?.[1];
    } else if (client === 'workbuddy') {
      const doc = JSON.parse(text);
      const list = Array.isArray(doc) ? doc : doc?.models || [];
      const entry = list.find((item) => item?.vendor === 'aios');
      selected = Boolean(entry);
      base = entry?.url?.replace(/\/v1\/chat\/completions$/u, '');
      model = entry?.id?.startsWith('aios/') ? entry.id.slice(5) : entry?.id;
    } else {
      const doc = JSON.parse(text);
      if (client === 'gemini') {
        base = doc?.env?.GOOGLE_GEMINI_BASE_URL;
        model = doc?.model?.name;
        selected = doc?.security?.auth?.selectedType === 'gemini-api-key' && Boolean(doc?.env?.GEMINI_API_KEY);
      } else {
        const provider = client === 'qoder' ? doc?.providers?.aios : doc?.provider?.aios;
        base = provider?.options?.baseURL || provider?.baseUrl;
        selected = Boolean(provider);
        model = client === 'qoder' ? provider?.model : doc?.model;
      }
    }
  } catch {
    return { status: 'malformed', connected: false };
  }
  const url = safeUrl(base);
  const gateway = Boolean(url && /^http:\/\/127\.0\.0\.1:/u.test(url));
  const target = targetFromWire(model);
  const connected = Boolean(selected && gateway && target);
  return { status: connected ? 'connected' : selected && (gateway || target) ? 'partial' : 'disconnected', connected, target,
    ...(url ? { baseUrl: url } : {}), identity: connected ? 'verified' : 'absent' };
}

const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const LF = String.fromCharCode(10), DQ = String.fromCharCode(34), SQ = String.fromCharCode(39), BS = String.fromCharCode(92);
function read(file, fsImpl, parser = JSON.parse) {
  if (!file) return { status: 'unknown' };
  let text;
  try { text = fsImpl.readFileSync(file, 'utf8'); }
  catch (error) { return { status: error?.code === 'ENOENT' ? 'missing' : 'unreadable' }; }
  try {
    const value = parser(text);
    if (!record(value)) throw new SyntaxError();
    return { status: 'ok', value };
  } catch (error) { return { status: error?.code === 'UNSUPPORTED_TOML' ? 'unknown' : 'malformed' }; }
}

// Conservative subset: unsupported TOML is unknown, never a regex-only connection.
function codexDocument(text) {
  const result = Object.create(null), tables = new Set();
  let table = '';
  const unknown = () => { throw Object.assign(new Error(), { code: 'UNSUPPORTED_TOML' }); };
  for (const raw of text.split(LF)) {
    let quote = '', escaped = false, line = '';
    for (const ch of raw) {
      if (!quote && ch === '#') break;
      line += ch;
      if (escaped) { escaped = false; continue; }
      if (quote === DQ && ch === BS) { escaped = true; continue; }
      if (quote && ch === quote) quote = '';
      else if (!quote && (ch === DQ || ch === SQ)) quote = ch;
    }
    line = line.trim();
    if (!line) continue;
    if (quote) { if (line.includes(DQ.repeat(3)) || line.includes(SQ.repeat(3))) unknown(); throw new SyntaxError(); }
    if (line.startsWith('[')) {
      if (line.startsWith('[[')) unknown();
      if (!line.endsWith(']')) throw new SyntaxError();
      const parts = line.slice(1, -1).split('.').map((part) => part.trim());
      if (parts.some((part) => !/^(?:[A-Za-z0-9_-]+|"[A-Za-z0-9_-]+"|'[A-Za-z0-9_-]+')$/u.test(part))) unknown();
      table = parts.map((part) => part.replace(/^["']|["']$/gu, '')).join('.');
      if (tables.has(table) || table.split('.').some((_part, index, parts) => Object.hasOwn(result, parts.slice(0, index + 1).join('.')))) throw new SyntaxError();
      tables.add(table);
      continue;
    }
    const equal = line.indexOf('=');
    if (equal < 1) throw new SyntaxError();
    let name = line.slice(0, equal).trim();
    if ((name.startsWith(DQ) && name.endsWith(DQ)) || (name.startsWith(SQ) && name.endsWith(SQ))) name = name.slice(1, -1);
    if (!/^[A-Za-z0-9_-]+$/u.test(name)) unknown();
    const key = table ? `${table}.${name}` : name;
    if (Object.hasOwn(result, key) || [...tables].some((name) => name === key || name.startsWith(`${key}.`))) throw new SyntaxError();
    const value = line.slice(equal + 1).trim();
    if (value.startsWith(DQ.repeat(3)) || value.startsWith(SQ.repeat(3))) unknown();
    if (value.startsWith(DQ) && value.endsWith(DQ)) {
      try { result[key] = JSON.parse(value); } catch { throw new SyntaxError(); }
    } else if (value.startsWith(SQ) && value.endsWith(SQ)) {
      if (value.slice(1, -1).includes(SQ)) throw new SyntaxError();
      result[key] = value.slice(1, -1);
    } else if (/^(true|false)$/u.test(value)) result[key] = value === 'true';
    else if (/^[+-]?(0|[1-9][0-9]*)([.][0-9]+)?$/u.test(value)) result[key] = Number(value);
    else if (!value) throw new SyntaxError();
    else unknown();
  }
  return result;
}

// Allowlist only routing facts. Never return tokens, other headers or raw config.
function safeUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return `${url.origin}${url.pathname}`.replace(/[/]+$/u, '');
  } catch { return null; }
}
function targetFromWire(value) {
  try { return parseWireTarget(value)?.ref || (typeof value === 'string' && value ? 'auto' : null); } catch { return null; }
}
function observed(client, files, mode, state) {
  const failure = files.find((file) => !['ok', 'missing'].includes(file.status));
  if (failure) return { status: failure.status, connected: false };
  if (files.every((file) => file.status === 'missing')) return { status: 'missing', connected: false };
  if (files.some((file) => file.status === 'missing')) return { status: 'partial', connected: false };
  let base, model, identity, selected = true;
  if (client === 'claude') {
    const doc = files[0].value;
    if (doc.env !== undefined && !record(doc.env)) return { status: 'malformed', connected: false };
    if (doc.env?.ANTHROPIC_CUSTOM_HEADERS !== undefined && typeof doc.env.ANTHROPIC_CUSTOM_HEADERS !== 'string') return { status: 'malformed', connected: false };
    base = doc.env?.ANTHROPIC_BASE_URL;
    model = doc.env?.ANTHROPIC_MODEL ?? doc.model;
    const identities = String(doc.env?.ANTHROPIC_CUSTOM_HEADERS || '').split(LF).flatMap((line) => {
      const colon = line.indexOf(':');
      return line.slice(0, colon).trim().toLowerCase() === 'x-gateway-client' ? [line.slice(colon + 1).trim()] : [];
    });
    identity = identities.length === 1 && identities[0] === 'claude';
  } else if (client === 'codex') {
    const doc = files[0].value;
    selected = doc.model_provider === 'aios-gateway';
    base = doc['model_providers.aios-gateway.base_url'];
    model = doc.model;
    identity = doc['model_providers.aios-gateway.http_headers.x-gateway-client'] === 'codex';
  } else {
    const settings = mode === 'inplace' ? files[0].value : null;
    const doc = files.at(-1).value;
    if (doc.providers !== undefined && !record(doc.providers)) return { status: 'malformed', connected: false };
    const provider = doc.providers?.['aios-gateway'];
    if (provider !== undefined && !record(provider)) return { status: 'malformed', connected: false };
    selected = mode === 'inplace' ? settings.defaultProvider === 'aios-gateway' : Boolean(provider);
    base = provider?.baseUrl;
    model = settings?.defaultModel ?? (state ? artifactModelForClient(state, 'pi') : provider?.models?.[0]?.id);
    identity = provider?.headers?.['x-gateway-client'] === 'pi';
    if (selected && (!provider || !Array.isArray(provider.models) || !provider.models.some((item) => item?.id === model))) return { status: 'partial', connected: false };
  }
  const url = safeUrl(base);
  const suffix = `/clients/${client}${client === 'codex' ? '/v1' : ''}`;
  const gateway = url?.endsWith(suffix);
  const target = targetFromWire(model);
  const connected = Boolean(selected && gateway && identity && target);
  const partial = selected && (gateway || identity) && !connected;
  return { status: connected ? 'connected' : partial ? 'partial' : 'disconnected', connected, target,
    ...(url ? { baseUrl: url } : {}), identity: identity ? 'verified' : 'absent' };
}

export function readConnectStatus({ stateDir, home, fsImpl = fs, mode: requestedMode, clients = CONNECT_CLIENTS } = {}) {
  const stateRead = read(path.join(stateDir, 'connect-state.json'), fsImpl, parseConnectState);
  const backupRead = read(path.join(stateDir, 'connect-backup.json'), fsImpl, parseConnectBackup);
  const state = stateRead.status === 'ok' ? stateRead.value : null;
  const backup = backupRead.status === 'ok' && Array.isArray(backupRead.value.entries) ? backupRead.value : null;
  const mode = requestedMode || (backup || state?.mode === 'inplace' || !state && home ? 'inplace' : 'isolated');
  const clientStatuses = clients.map((client) => {
    const entries = backup?.entries.filter((entry) => entry.client === client) || [];
    const paths = mode === 'inplace' ? (home ? clientConfigPaths(home)[client] : client === 'pi'
      ? ['settings', 'models'].map((role) => entries.find((entry) => entry.role === role)?.file) : [entries[0]?.file])
      : [isolatedArtifactPath(stateDir, client)];
    let facts, files;
    if (GENERIC_CLIENTS.has(client) && mode === 'inplace') {
      try { facts = genericObserved(client, home, fsImpl); } catch { facts = { status: 'unknown', connected: false }; }
      const status = facts.status === 'unknown' ? 'unreadable' : facts.status === 'missing' ? 'missing' : 'ok';
      files = [{ status }];
    } else {
      files = paths.map((file) => read(file, fsImpl, client === 'codex' ? codexDocument : JSON.parse));
      try { facts = observed(client, files, mode, state); } catch { facts = { status: 'unknown', connected: false }; }
    }
    const journalStatuses = [stateRead.status, backupRead.status];
    let ownership = { status: 'unowned' }, pending = false;
    try {
      if (mode === 'inplace' && entries.length) {
        const inspected = entries.map((entry) => inspectInplaceEntry(entry, backup, fsImpl));
        pending = inspected.some((entry) => entry.pending);
        ownership = { status: inspected.every((entry) => entry.matches || entry.original) ? 'owned' : 'drift' };
      } else if (mode === 'isolated' && state?.clients?.includes(client)) {
        const inspected = isolatedOwnership(paths[0], client, state, fsImpl);
        pending = inspected.pending;
        ownership = { status: inspected.matches ? 'owned' : 'drift' };
      } else if (journalStatuses.some((status) => !['ok', 'missing'].includes(status))) ownership = { status: 'unknown' };
    } catch { ownership = { status: 'unknown' }; }
    if (ownership.status === 'drift' && ['connected', 'disconnected'].includes(facts.status)) facts.status = 'drift';
    const errorStatus = journalStatuses.find((status) => !['ok', 'missing'].includes(status));
    let defaultTarget = null;
    try {
      const entry = entries.find((item) => item.target !== undefined);
      const value = entry?.target ?? backup?.targets?.[client] ?? state?.targets?.[client];
      const version = entry?.targetRefVersion ?? (backup?.targets?.[client] !== undefined ? backup.targetRefVersion : state?.targetRefVersion);
      const legacy = client === 'pi' ? entries.find((item) => item.modelId !== undefined)?.modelId ?? state?.piModel ?? backup?.modelId : client === 'codex' ? state?.codexModel : undefined;
      defaultTarget = persistedConnectTarget(value ?? legacy, value === undefined ? undefined : version);
    } catch { ownership = { status: 'unknown' }; }
    const recovery = { status: pending || state?.codexDefaultStatus === 'pending' && client === 'codex' ? 'pending' : entries.length || state?.clients?.includes(client) ? 'available' : errorStatus ? 'unknown' : 'none' };
    let piModel = 'aios-auto';
    try { if (client === 'pi') piModel = artifactModelForClient(state, client) || piModel; } catch { /* Invalid journal targets do not break other clients. */ }
    return { client, mode, connected: facts.connected, target: facts.target || null, defaultTarget,
      capabilities: connectCapabilities(client), readback: { ...facts, files: files.map((file, index) => ({ role: client === 'pi' && mode === 'inplace' ? index === 0 ? 'settings' : 'models' : 'main', status: file.status })) },
      ownership, recovery, launch: mode === 'inplace' ? client : connectLaunchCommand(client, stateDir, { piModel }),
      artifactExists: mode === 'isolated' && files[0].status !== 'missing' && files[0].status !== 'unreadable' };
  });
  return { mode, connected: clientStatuses.some((client) => client.connected), clients: clientStatuses, gatewayUrl: safeUrl(backup?.gatewayUrl || state?.gatewayUrl) };
}
