// scripts/lib/clients/plugins/provider-host.mjs — G2 宿主进程（P2）。
// 联网插件（登录/声明模型/拿额度）在独立 Node 子进程跑，stdio JSON-RPC，与网关不共享内存。
// 不可信来源必须经进程隔离——这是 ADR 0007 §9 的硬约束。
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { match } from 'ts-pattern';

import { attempt } from '../core/result.mjs';

export const DEFAULT_RPC_TIMEOUT_MS = 11000;

export class ProviderHostError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = 'ProviderHostError';
  }
}

/**
 * 启动一个插件子进程并做一次 JSON-RPC 往返。
 * 子进程从 stdin 读一行 JSON 请求，向 stdout 写一行 JSON 响应。
 * @param {{entry:absolutePath, method:string, params?:object, timeoutMs?:number, spawnImpl?:Function}}
 */
export function callProviderHost({ entry, method, params = {}, timeoutMs = DEFAULT_RPC_TIMEOUT_MS, spawnImpl = spawn } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(process.execPath, [String(entry)], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, AIOS_PLUGIN_RPC: '1' },
      windowsHide: true,
    });
    let settled = false;
    let stdout = '';
    let stderr = '';
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      attempt(() => child.kill()); // 进程可能已退出，fail-open
      if (error) reject(error);
      else resolve(value);
    };
    const timer = setTimeout(() => finish(new ProviderHostError(`provider host timed out after ${timeoutMs}ms`)), timeoutMs);
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk);
      const line = stdout.split('\n').find((item) => item.trim());
      if (line) {
        const parsed = attempt(() => JSON.parse(line));
        match(parsed)
          .with({ ok: true }, ({ value }) => finish(null, value))
          .with({ ok: false }, () => finish(new ProviderHostError('provider host returned invalid JSON')))
          .exhaustive();
      }
    });
    child.stderr?.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', (error) => finish(new ProviderHostError('provider host failed to start', error)));
    child.on('exit', (code) => {
      if (!settled) finish(new ProviderHostError(`provider host exited (code ${code}) before responding: ${stderr.slice(0, 300)}`));
    });
    child.stdin?.write(`${JSON.stringify({ method, params })}\n`);
    child.stdin?.end();
  });
}

/**
 * 反射令牌：账号用不透明 32-hex ref 代替 email/id，插件记忆账号而不接触 PII。
 * 同一账号跨请求稳定，不同插件不同（pluginId 参与派生）。
 */
export function accountRef(pluginId, accountId) {
  return createHash('sha256').update(`${pluginId}\0${accountId}`).digest('hex').slice(0, 32);
}
