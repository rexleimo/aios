import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import {
  captureCommand,
  commandExists,
  runCommand,
  spawnCommand,
} from '../../../lib/foundation/platform/process.mjs';

/* 中文注释：windowsHide 的失败形态是「看得见但没人断言」。父进程没有控制台时（GUI 客户端 /
   桌面壳 / detached 钩子），缺这个选项会给每个子进程新建一个可见控制台窗口，命令结束窗口消失，
   也就是用户看到的「一直闪小黑窗」。窗口可见性无法在单测里断言，但「本层确实把选项交给了
   child_process」可以——这是能被机器抓住的那一半，实测对照见 docs/evidence 与本次修复记录。 */

function recordingSpawnSync(record) {
  return (command, args, options) => {
    record.push({ command, args, options });
    return { status: 0, stdout: '', stderr: '', error: null };
  };
}

function recordingChild(record) {
  return (command, args, options) => {
    record.push({ command, args, options });
    const child = new EventEmitter();
    child.pid = 4242;
    child.stdout = Object.assign(new EventEmitter(), { setEncoding() {} });
    child.stderr = Object.assign(new EventEmitter(), { setEncoding() {} });
    child.stdin = Object.assign(new EventEmitter(), {
      setDefaultEncoding() {},
      end() {},
    });
    setImmediate(() => child.emit('close', 0));
    return child;
  };
}

test('commandExists passes windowsHide to its probe', () => {
  const record = [];
  commandExists('aios-no-such-command-probe-xyz', { spawnSyncImpl: recordingSpawnSync(record) });
  assert.equal(record.length, 1, 'the probe must actually run through child_process');
  assert.equal(record[0].options.windowsHide, true);
});

test('captureCommand passes windowsHide and cannot be overridden by the caller', () => {
  const record = [];
  captureCommand('git', ['--version'], {
    spawnSyncImpl: recordingSpawnSync(record),
    windowsHide: false,
  });
  assert.equal(record[0].options.windowsHide, true);
});

test('runCommand passes windowsHide even with inherited stdio', () => {
  const record = [];
  runCommand('git', ['--version'], { spawnSyncImpl: recordingSpawnSync(record) });
  assert.equal(record[0].options.stdio, 'inherit');
  assert.equal(record[0].options.windowsHide, true);
});

test('spawnCommand passes windowsHide to the async launch', async () => {
  const record = [];
  const result = await spawnCommand('git', ['--version'], { spawnImpl: recordingChild(record) });
  assert.equal(result.status, 0);
  assert.equal(record[0].options.windowsHide, true);
});

test('spawnImpl is an injection hook, never a leaked child option', async () => {
  const record = [];
  await spawnCommand('git', ['--version'], { spawnImpl: recordingChild(record) });
  assert.equal(Object.hasOwn(record[0].options, 'spawnImpl'), false);
  const syncRecord = [];
  captureCommand('git', ['--version'], { spawnSyncImpl: recordingSpawnSync(syncRecord) });
  assert.equal(Object.hasOwn(syncRecord[0].options, 'spawnSyncImpl'), false);
});
