// scripts/lib/clients/core/ordering.mjs — 客户端列表的“成员 vs 优先级”分离。
// 成员集合归注册表（重复维护必然漂移），相对顺序归人（如 team 里 zcode 刻意排在 pi 前，
// 推导不出来）。priority 只需列到第一个偏离注册表顺序的客户端为止，其余自动按注册表顺序
// 追加——新客户端进 CLIENT_DEFINITIONS 即可，不必改任何 priority 列表。

// 纯函数：members 必须已是注册表顺序；priority 中不属于 members 的名字按无效处理并忽略。
export function orderByPriority(members, priority = []) {
  const memberSet = new Set(members);
  const known = priority.filter((client) => memberSet.has(client));
  const seen = new Set(known);
  return Object.freeze([...known, ...members.filter((client) => !seen.has(client))]);
}
