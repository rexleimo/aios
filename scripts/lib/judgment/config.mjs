// scripts/lib/judgment/config.mjs — opt-in 判定闸门的配置层。
//
// 设计约束（来自 docs/plans/2026-09-18-optin-judgment-gate.md）：
// 默认关闭、fail closed。配置缺失 / 读不动 / 字段非法时一律当"未开启"处理，
// 绝不因为解析失败而放行一次外部付费调用。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const JUDGMENT_CONFIG_SCHEMA_VERSION = 1;
export const JUDGMENT_DIRNAME = 'judgment';
export const JUDGMENT_CONFIG_FILENAME = 'config.json';

// 阈值取值约定：confirmFloor <= actFloor。
// actFloor 是"无需确认即可行动"的门槛，confirmFloor 是"低于就放弃"的门槛，
// 中间地带要求人工确认。默认值偏保守，由用户在 enable 时显式覆盖。
export const DEFAULT_VENDOR_CONFIG = Object.freeze({
  enabled: false,
  model: 'jev-latest',
  actFloor: 0.8,
  confirmFloor: 0.5,
  maxCallsPerSession: 20,
  maxInputChars: 20000,
  timeoutMs: 10000,
  // 闸门开着但问不到判定方（网络不通 / 401 / 429 退避后仍失败）时的取向。
  // 默认 hold：用户既然主动开了闸门，就不应该因为厂商抖动而静默放行。
  onJudgmentError: 'hold',
});

const FLOOR_KEYS = Object.freeze(['actFloor', 'confirmFloor']);
const ON_ERROR_VALUES = Object.freeze(['hold', 'allow']);

function resolveStateHome(env, homeDir) {
  const raw = String(env.AIOS_HOME || '').trim();
  if (raw && path.isAbsolute(raw)) return raw;
  return path.join(homeDir, '.aios');
}

// 解析顺序：显式 configPath > AIOS_JUDGMENT_CONFIG > AIOS_HOME/judgment/config.json
// > ~/.aios/judgment/config.json。AIOS_JUDGMENT_CONFIG 的存在是为了让测试有确定性，
// 不需要去写用户的真实 home。
export function resolveJudgmentConfigPath({ env = process.env, homeDir = os.homedir() } = {}) {
  const override = String(env.AIOS_JUDGMENT_CONFIG || '').trim();
  if (override) return path.resolve(override);
  return path.join(resolveStateHome(env, homeDir), JUDGMENT_DIRNAME, JUDGMENT_CONFIG_FILENAME);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isUnitInterval(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isPositiveInt(value) {
  return Number.isInteger(value) && value > 0;
}

// 严格校验一个 vendor 条目。返回 {ok, errors, value}；value 只在 ok 时可信。
export function validateVendorConfig(raw) {
  const errors = [];
  if (!isPlainObject(raw)) {
    return { ok: false, errors: ['vendor entry must be an object'], value: null };
  }
  if (typeof raw.enabled !== 'boolean') errors.push('enabled must be a boolean');
  if (typeof raw.model !== 'string' || !raw.model.trim()) errors.push('model must be a non-empty string');
  for (const key of FLOOR_KEYS) {
    if (!isUnitInterval(raw[key])) errors.push(`${key} must be a number in [0, 1]`);
  }
  if (isUnitInterval(raw.actFloor) && isUnitInterval(raw.confirmFloor) && raw.confirmFloor > raw.actFloor) {
    errors.push('confirmFloor must be <= actFloor');
  }
  for (const key of ['maxCallsPerSession', 'maxInputChars', 'timeoutMs']) {
    if (!isPositiveInt(raw[key])) errors.push(`${key} must be a positive integer`);
  }
  // onJudgmentError 是后加的可选键：缺失时取默认值，而不是让整条 vendor 配置失效。
  // 否则升级后旧配置文件会把用户已经打开的闸门静默关掉。
  const onJudgmentError = raw.onJudgmentError === undefined
    ? DEFAULT_VENDOR_CONFIG.onJudgmentError
    : raw.onJudgmentError;
  if (!ON_ERROR_VALUES.includes(onJudgmentError)) {
    errors.push(`onJudgmentError must be one of: ${ON_ERROR_VALUES.join(', ')}`);
  }
  if (errors.length > 0) return { ok: false, errors, value: null };

  return {
    ok: true,
    errors: [],
    value: {
      enabled: raw.enabled,
      model: raw.model.trim(),
      actFloor: raw.actFloor,
      confirmFloor: raw.confirmFloor,
      maxCallsPerSession: raw.maxCallsPerSession,
      maxInputChars: raw.maxInputChars,
      timeoutMs: raw.timeoutMs,
      onJudgmentError,
    },
  };
}

export function defaultJudgmentConfig() {
  return {
    schemaVersion: JUDGMENT_CONFIG_SCHEMA_VERSION,
    vendors: { typesafe: { ...DEFAULT_VENDOR_CONFIG } },
  };
}

// 读取配置。文件不存在 ⇒ 全默认（关闭）。文件坏了 ⇒ 仍返回默认（关闭）+ warnings，
// 这样任何解析失败都不会变成一次放行。
export function readJudgmentConfig({ configPath, env = process.env, homeDir = os.homedir() } = {}) {
  const file = configPath || resolveJudgmentConfigPath({ env, homeDir });
  const warnings = [];
  if (!existsSync(file)) {
    return { path: file, exists: false, config: defaultJudgmentConfig(), warnings };
  }

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    warnings.push(`judgment config is not valid JSON (${error.message}); treating every vendor as disabled`);
    return { path: file, exists: true, config: defaultJudgmentConfig(), warnings };
  }

  if (!isPlainObject(parsed)) {
    warnings.push('judgment config must be a JSON object; treating every vendor as disabled');
    return { path: file, exists: true, config: defaultJudgmentConfig(), warnings };
  }

  const config = defaultJudgmentConfig();
  if (parsed.schemaVersion !== undefined && parsed.schemaVersion !== JUDGMENT_CONFIG_SCHEMA_VERSION) {
    warnings.push(`unknown schemaVersion ${parsed.schemaVersion}; expected ${JUDGMENT_CONFIG_SCHEMA_VERSION}`);
  }

  const vendors = isPlainObject(parsed.vendors) ? parsed.vendors : {};
  for (const [vendor, entry] of Object.entries(vendors)) {
    const result = validateVendorConfig(entry);
    if (!result.ok) {
      warnings.push(`ignoring invalid vendor config "${vendor}": ${result.errors.join('; ')}`);
      continue;
    }
    config.vendors[vendor] = result.value;
  }

  return { path: file, exists: true, config, warnings };
}

export function writeJudgmentConfig(config, { configPath, env = process.env, homeDir = os.homedir() } = {}) {
  const file = configPath || resolveJudgmentConfigPath({ env, homeDir });
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return file;
}

// 取出某个 vendor 的有效配置（未知 vendor ⇒ 默认关闭）。
export function resolveVendorConfig(config, vendor) {
  const entry = isPlainObject(config?.vendors) ? config.vendors[vendor] : undefined;
  const result = validateVendorConfig(entry);
  return result.ok ? result.value : { ...DEFAULT_VENDOR_CONFIG, enabled: false };
}

// 用户可覆盖的字段白名单。enable/disable 只碰这些键，其他键原样保留。
export const VENDOR_OVERRIDE_KEYS = Object.freeze([
  'enabled', 'model', 'actFloor', 'confirmFloor', 'maxCallsPerSession', 'maxInputChars', 'timeoutMs', 'onJudgmentError',
]);

export function applyVendorOverride(config, vendor, overrides = {}) {
  const current = resolveVendorConfig(config, vendor);
  const next = { ...current };
  for (const key of VENDOR_OVERRIDE_KEYS) {
    if (overrides[key] !== undefined) next[key] = overrides[key];
  }
  const validated = validateVendorConfig(next);
  if (!validated.ok) {
    const error = new Error(`invalid judgment config for "${vendor}": ${validated.errors.join('; ')}`);
    error.code = 'invalid-config';
    throw error;
  }
  const result = {
    ...config,
    schemaVersion: JUDGMENT_CONFIG_SCHEMA_VERSION,
    vendors: { ...(isPlainObject(config?.vendors) ? config.vendors : {}), [vendor]: validated.value },
  };
  return result;
}
