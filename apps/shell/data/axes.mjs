// apps/shell/data/axes.mjs — 轴词表的进程入口：把 owner 模块的导出打成 JSON。
//
// 为什么单开一个入口而不是让调用方 import：轴的所有者是
// `scripts/client-capability-scorecard.mjs`，而界面与它的路由都在 Turbopack 的项目根内，
// 不能把 `scripts/lib/**` 拖进打包图（实测会要求整仓 trace）。子进程通道是唯一能同时
// 满足「只有一个所有者」与「不污染打包图」的做法——和 load.mjs 同一条规矩。
import { isDirectModuleInvocation } from '../../../scripts/lib/foundation/platform/module-entry.mjs';
import { CAPABILITY_AXES } from '../../../scripts/client-capability-scorecard.mjs';

export { CAPABILITY_AXES };

if (isDirectModuleInvocation(import.meta.url)) {
  process.stdout.write(`${JSON.stringify([...CAPABILITY_AXES], null, 2)}\n`);
}
