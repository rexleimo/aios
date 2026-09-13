/**
 * 宿主适配探针（借鉴 LoopX "checked against the host itself, not transcribed"，
 * 见 research/upstream/loopx-analysis.md §4.7 宿主集成矩阵的精简版）。
 *
 * registry 是数据表：host → 探测命令 + 断言。给 harness 实际驱动的宿主加一行
 * registry 即完成接入，不需要 per-host 定制代码路径。
 *
 * 语义：
 * - registered  : 对宿主本身执行廉价探测命令并断言输出；断言失败 → fail-closed
 *                 （failureClass host-unsupported，对应 turn contract 的 host_unsupported）。
 * - unregistered: 该宿主暂无探针（返回 unsupported=no），由调用方决定是否告警。
 * 纯探测；不做任何关键词猜测——断言对象是宿主自己声明的版本输出。
 */

import { captureCommand } from '../platform/process.mjs';

const VERSIONISH = /\d+\.\d+/u;

export const HOST_PROBE_REGISTRY = Object.freeze({
  codex: Object.freeze({
    mode: 'one-shot',
    executable: 'codex',
    args: ['--version'],
    assert: (stdout) => VERSIONISH.test(String(stdout || '')),
    describe: (stdout) => `codex ${String(stdout || '').trim().split(/\r?\n/u)[0] || '(no version output)'}`,
  }),
  pi: Object.freeze({
    mode: 'managed-runner',
    executable: 'pi',
    args: ['--version'],
    assert: (stdout) => VERSIONISH.test(String(stdout || '')),
    describe: (stdout) => `pi ${String(stdout || '').trim().split(/\r?\n/u)[0] || '(no version output)'}`,
  }),
});

export function listProbedHosts() {
  return Object.freeze(Object.keys(HOST_PROBE_REGISTRY));
}

/**
 * 探测单个宿主。
 * @returns {{ host, registered, ok, status: 'ok'|'unsupported'|'unprobed'|'error', detail }}
 */
export function probeHost({ host = '', run = captureCommand } = {}) {
  const name = String(host || '').trim();
  const entry = HOST_PROBE_REGISTRY[name];
  if (!entry) {
    return { host: name, registered: false, ok: true, status: 'unprobed', detail: `no probe registered for host "${name}"` };
  }

  let result;
  try {
    result = run(entry.executable, entry.args, { encoding: 'utf8' });
  } catch (error) {
    return {
      host: name,
      registered: true,
      ok: false,
      status: 'error',
      detail: `probe for ${name} could not start: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (result.error) {
    return {
      host: name,
      registered: true,
      ok: false,
      status: 'unsupported',
      detail: `${name} is not runnable on this machine (host_unsupported): ${result.error.message}`,
    };
  }

  const output = `${result.stdout || ''}${result.stderr || ''}`;
  if (!entry.assert(output)) {
    return {
      host: name,
      registered: true,
      ok: false,
      status: 'unsupported',
      detail: `${name} returned an unparsable version contract (host_unsupported): ${output.trim().slice(0, 200)}`,
    };
  }

  return { host: name, registered: true, ok: true, status: 'ok', detail: entry.describe(output) };
}
