# AIOS Console product redesign: audit existing user flows; design task-o...

> AIOS Planning Contract (schema v3)
> created: 2026-11-06T04:04:15.016Z
> client: cli
> source: aios plan auto-gate
> route: implement

## Objective

AIOS Console 按已确认的 A“本机 AI 工具管理器”方向制作可交互原型，覆盖工具管理、私人项目记忆浏览与 MCP 配置和恢复。当前交付范围为受控示例原型；真实后端接线单列后续工作。

## Route skills

1. `rex-planning`

## Tasks

- [x] **t1-understand**: 用户方向与范围已确认 — A，本机工具管理器；私人项目记忆可达、可读。
- [x] **t2-plan**: 审计、方向、原型和后端接线分为独立工作项。
- [x] **t3-implement**: `/prototype` 页面与正式 Console 的“新版交互预览”入口已实现。
- [x] **t4-verify**: 类型检查、构建、Shell 94/94、全量回归 2745/0/12、浏览器主流程与补充场景通过；证据见原型验证记录。

## Progress

- 用户已确认 A（本机 AI 工具管理器）。
- 新增约束：私人项目记忆必须可达，记忆必须人类可理解。
- 已审计记忆读路径：`apps/shell/ui/src/app/api/memory/route.ts` 将启动根作为项目根并寻找项目内 CLI；普通项目不满足。UI 空查询不列记忆，只提供 10 条文本搜索；详情以 ID/时间为中心。
- 更新后的产品与记忆设计见 `docs/plans/2026-11-06-console-product-direction.md`。
- 用户随后授权“可以，制作一下”；已实现独立 `/prototype`，只使用 fixture 和页面状态。

## Decision Log

- 2026-11-06：用户选择 A“本机 AI 工具管理器”；首页、导航与全局工具管理按 A 收敛。
- 2026-11-06：用户补充私人项目记忆不可达、现有记忆难读；记忆提升为一级入口与 P0，设计必须分离本机阅读范围和 AI 召回权限。
- 2026-11-06：用户授权制作交互原型；保持原有脏改动，新增原型页面并在现有侧栏增加预览入口。真实记忆读取和 MCP 写入不在原型范围。

## Acceptance

- Complete planned tasks and record verification evidence.

## Next Actions

- 原型交付完成：`docs/plans/2026-11-06-console-prototype-verification.md`；本机预览 `/prototype`。
- 当前设计：`docs/plans/2026-11-06-console-product-direction.md`。
- 真实后端接线保留为独立后续工作，不视为已交付。

## Delivery Ticket

```json
{
  "schema": "rex.delivery-ticket.v1",
  "decisionTicketRef": "docs/plans/2026-11-06-console-product-direction.md",
  "completionClaim": "soft",
  "workItems": [
    {
      "id": "work-audit",
      "dependsOn": [],
      "outcome": "现有导航与操作障碍有源码证据，形成两个产品方向",
      "completionCriteria": "问题、证据、推荐理由与限制可评审",
      "verification": "核对 sections.ts、overview.tsx、app-shell.tsx、mcp-object-table.tsx 与 ADR 0008",
      "evidenceRefs": ["docs/plans/2026-11-06-console-product-direction.md"],
      "status": "done"
    },
    {
      "id": "work-direction",
      "dependsOn": ["work-audit"],
      "outcome": "私人项目记忆可达、可读，且不扩大 AI 召回权限",
      "completionCriteria": "项目选择、免关键词浏览、来源与更新状态、隔离和恢复路径可评审",
      "verification": "实施后以受控项目 fixture 做读取、隔离与原文一致验证；桌面走查缺失/不可达状态",
      "evidenceRefs": ["docs/plans/2026-11-06-console-product-direction.md"],
      "status": "done"
    },
    {
      "id": "work-prototype",
      "dependsOn": ["work-direction"],
      "outcome": "首页、工具详情、MCP 新增、项目记忆浏览和错误恢复可交互评审",
      "completionCriteria": "正常、空白、加载、失败、冲突、跨项目隔离路径都有设计",
      "verification": "桌面走查；验证参数空格、私人项目可读、跨项目同 id、不串请求和摘要与原文区分",
      "evidenceRefs": ["docs/plans/2026-11-06-console-prototype-verification.md", "docs/plans/2026-11-06-console-prototype-review.md"],
      "status": "done"
    },
    {
      "id": "work-delivery",
      "dependsOn": ["work-prototype"],
      "outcome": "设计接到真实后端，工具管理与记忆浏览闭环",
      "completionCriteria": "设计稿 MCP 与记忆验收场景通过，未具备的动作无假按钮",
      "verification": "相关测试、UI 类型检查、真实桌面走查与项目记忆隔离验证",
      "evidenceRefs": [],
      "status": "pending"
    }
  ],
  "frontier": {
    "ready": [],
    "blocked": [{"id":"work-delivery","reason":"真实后端接线需在原型评审后独立实施，不属于本轮示例原型交付","evidenceRefs":["docs/plans/2026-11-06-console-product-direction.md"]}]
  },
  "parallelGroups": [],
  "convergenceGate": {
    "criteria": "已选方向、原型走查、真实后端闭环与项目记忆隔离证据齐备",
    "verification": "核对产品设计稿中的 MCP 与记忆验收场景，失败项保留原文",
    "requiredEvidenceRefs": ["docs/plans/2026-11-06-console-product-direction.md"]
  },
  "ledger": {
    "is_complete": false,
    "in_progress": [],
    "facts": [{"work":"work-audit","evidenceRef":"docs/plans/2026-11-06-console-product-direction.md"},{"work":"work-direction","evidenceRef":"docs/plans/2026-11-06-console-product-direction.md"},{"work":"work-prototype","evidenceRef":"docs/plans/2026-11-06-console-prototype-verification.md"}],
    "assignment": {"work-audit":"complete", "work-direction":"complete by user confirmation", "work-prototype":"complete; fixture-only interactive prototype", "work-delivery":"future backend integration after prototype review"}
  }
}
```

## Verification evidence

- Attach via `aios plan add-evidence --kind command|path|test --value "..."`
- Plan cannot be `done` without evidence and completed tasks

## 原型测试范围（2026-11-06）

目标：独立 `/prototype` 页面呈现可交互产品样稿，复用现有 Next/React、token 与 Radix Dialog。数据全部为明确标注的示例，操作只改变页面内状态。现有 Console 页面和后端 API 保留。

非目标：读取私人目录、写真实记忆或 MCP 配置、项目注册/同步、客户端安装、正式后端接线。禁止从原型调用生产写 API。

允许改动：`apps/shell/ui/src/app/prototype/**`，现有 shell 的预览入口；设计与验证记录。目录 ≤8 项、文件 <400 行，按交互职责分为框架、记忆、MCP 流程与示例模型。

公共测试缝与验收映射：
- HTTP GET `/prototype` 返回样稿；浏览器可找到首页、AI 工具、MCP、记忆、活动记录。
- 浏览器选择项目后列表与详情同属所选项目；空项目显示空状态、不可达项目显示恢复入口；搜索不要求预先输入。
- 记忆可查看来源、原文、更新关系，未知状态不伪造。
- MCP 向导逐步选择工具和范围→配置→预览→模拟结果；空格参数不被拆开；失败后可重试；未验证不可标为连接成功。
- 浏览器请求日志无生产 API 写请求，操作不改变真实文件。
- 桌面与窄窗 DOM 检查无横向溢出，Dialog 可用键盘关闭；TypeScript 通过；适用的 motion/设计检查保留实测结果。

验证优先真实浏览器走查，原型只使用 fixture 的事实必须显式说明。不得删断言、放宽期望、跳过失败以获得通过。

## Status

- status: active
