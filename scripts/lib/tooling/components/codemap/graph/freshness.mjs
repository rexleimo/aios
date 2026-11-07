/* 中文注释：图陈旧判定。install 原先只在图**不存在**时构建，于是图会静默落后于仓库
   ——CRG 读的是旧结构，"改这个会影响谁"的答案就不可信。这里把「陈旧」定义成一条
   可注入、可测的纯判定：graph.db 的 mtime 早于 HEAD commit 时间即陈旧。

   判定只看 mtime vs commit 时间，不去解析图内容：图内容是否包含某个文件属于 CRG
   自己的职责，AIOS 只负责回答"这份图是不是在最近一次提交之前生成的"。 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { CRG_DATA_DIR } from '../constants.mjs';

const GRAPH_DB_NAME = 'graph.db';

export function resolveGraphDbPath(projectRoot) {
  return path.join(projectRoot, CRG_DATA_DIR, GRAPH_DB_NAME);
}

/** 读取 HEAD commit 时间（秒）；非 git 仓库或无提交时返回 null。 */
export function readHeadCommitTime(projectRoot, { execFileSyncImpl = execFileSync } = {}) {
  try {
    const out = execFileSyncImpl('git', ['log', '-1', '--format=%ct'], {
      windowsHide: true,
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const seconds = Number(String(out).trim());
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  } catch {
    return null;
  }
}

/**
 * 纯判定：图是否陈旧。返回 { stale, reason, graphMtimeMs, commitMs, graphAgeDays, behindHeadDays }。
 *
 * 两个天数含义不同，不要混用：
 *   graphAgeDays   —— 图距现在多久没重建（回答"这图有多旧"）
 *   behindHeadDays —— 图比 HEAD commit 晚了多久（回答"错过了多少历史"，即陈旧程度）
 *
 * 任一输入缺失（图不存在 / 拿不到 commit 时间）都不算陈旧 —— 那种情况由 doctor 的
 * 「图目录缺失」步骤负责报告，避免同一问题报两次。
 */
export function evaluateGraphFreshness({
  graphMtimeMs = null,
  commitTimeSeconds = null,
  now = Date.now(),
} = {}) {
  if (!Number.isFinite(graphMtimeMs) || !Number.isFinite(commitTimeSeconds)) {
    return { stale: false, reason: 'unknown', graphMtimeMs, commitMs: null, graphAgeDays: 0, behindHeadDays: 0 };
  }
  const commitMs = commitTimeSeconds * 1000;
  const graphAgeDays = Math.max(0, Math.floor((now - graphMtimeMs) / 86400_000));
  if (graphMtimeMs >= commitMs) {
    return { stale: false, reason: 'fresh', graphMtimeMs, commitMs, graphAgeDays, behindHeadDays: 0 };
  }
  const behindHeadDays = Math.max(0, Math.floor((commitMs - graphMtimeMs) / 86400_000));
  return { stale: true, reason: 'behind-head', graphMtimeMs, commitMs, graphAgeDays, behindHeadDays };
}

/** 组合入口：读盘 + 取 commit 时间 + 判定，供 install / doctor 共用。 */
export function inspectGraphFreshness(projectRoot, {
  fsImpl = fs,
  execFileSyncImpl = execFileSync,
  now = Date.now(),
} = {}) {
  const graphDbPath = resolveGraphDbPath(projectRoot);
  let graphMtimeMs = null;
  try {
    graphMtimeMs = fsImpl.statSync(graphDbPath).mtimeMs;
  } catch {
    graphMtimeMs = null;
  }
  const commitTimeSeconds = readHeadCommitTime(projectRoot, { execFileSyncImpl });
  const evaluation = evaluateGraphFreshness({ graphMtimeMs, commitTimeSeconds, now });
  return { ...evaluation, graphDbPath, commitTimeSeconds };
}
