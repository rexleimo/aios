// scripts/lib/judgment/availability.mjs — "这个判定闸门现在能用吗"的单一判据。
//
// 所有消费方（MCP 工具表、rex stage 闸门、CLI）都必须用这一个函数回答同一个问题，
// 否则就会出现"工具没注册但某个路径仍然出网"的第二条调用通道。
//
// fail closed 的三个前提同时成立才算可用：
//   1. 配置里该 vendor 的 enabled === true（只有 `aios judgment enable` 能写）；
//   2. 该 vendor 的凭据在进程环境里存在（只查存在性，值不进内存快照、不进日志）；
//   3. 配置能被解析（读不动 / 坏 JSON ⇒ 一律按未开启处理）。
//
// 预算（maxCallsPerSession / maxInputChars）由会话对象在调用点执行，不在这里判断，
// 因为预算是有状态的、每次调用都在变。
import { readJudgmentConfig, resolveVendorConfig, resolveJudgmentConfigPath } from './config.mjs';
import { hasCredential, resolveVendor } from './jev-client.mjs';

/**
 * @returns {{
 *   available: boolean, enabled: boolean, credentialPresent: boolean, reason: string,
 *   vendor: string, vendorConfig: object, vendorEntry: object,
 *   configPath: string, configExists: boolean, warnings: string[]
 * }}
 */
export function resolveJudgmentAvailability({
  vendor = 'typesafe',
  env = process.env,
  homeDir,
  config,
  configPath,
} = {}) {
  const vendorEntry = resolveVendor(vendor);
  const loaded = config
    ? { config, warnings: [], path: configPath || resolveJudgmentConfigPath({ env, homeDir }), exists: true }
    : readJudgmentConfig({ configPath, env, homeDir });

  const vendorConfig = resolveVendorConfig(loaded.config, vendor);
  const enabled = vendorConfig.enabled === true;
  const credentialPresent = hasCredential(vendorEntry, env);

  // reason 只在不可用时非空，且必须是调用方可以直接判等的稳定值。
  const reason = !enabled
    ? 'judgment-disabled'
    : (credentialPresent ? '' : 'credential-missing');

  return {
    available: enabled && credentialPresent,
    enabled,
    credentialPresent,
    reason,
    vendor,
    vendorConfig,
    vendorEntry,
    configPath: loaded.path,
    configExists: loaded.exists,
    warnings: loaded.warnings,
  };
}

// 给 CLI / 日志用的一行说明。不包含任何凭据值。
export function describeAvailability(availability) {
  const { vendor, vendorConfig, vendorEntry, configPath: file } = availability;
  if (!availability.enabled) return `judgment disabled for "${vendor}" (config: ${file})`;
  if (!availability.credentialPresent) {
    return `judgment enabled for "${vendor}" but ${vendorEntry.credentialEnvVar} is not set in this process`;
  }
  return `judgment enabled for "${vendor}" (model ${vendorConfig.model}, config: ${file})`;
}
