# Console 产品交互原型验证（2026-11-06）

交付范围：已确认的 A“本机 AI 工具管理器”交互原型。入口 `/prototype`，正式 Console 侧栏提供“新版交互预览”。所有项目、工具、记忆和执行结果均为受控示例；操作只改变页面内状态，刷新可重置。

真实私人项目的记忆读取、项目注册、MCP 配置写入和连接测试尚未接入。本原型不能作为这些后端功能已交付的证据。

## 入口与结构

运行 `npm run ui`，从启动器打开的 Console 点击“新版交互预览”；已登录同一服务时可直接访问 `/prototype`。

```text
/prototype
  首页 → 指定工具详情 / 指定记忆 / 待处理问题
  AI 工具 → 配置范围、文件与连接状态
  记忆 → 项目 → 最近记录 / 搜索 → 正文 / 来源 / 原文 / 更新关系
  MCP → 工具与范围 → 配置 → 预览 → 模拟写入 → 测试 / 重试 / 冲突
  活动记录 / 外观设置
```

实现按框架、示例模型、项目记忆、服务列表和独立流程拆分。每个目录不超过 8 项，每个新代码文件小于 400 行。

## 验证命令与观测

| 检查 | 结果 | 实测证据 |
|---|---|---|
| `npm --prefix apps/shell/ui run typecheck` | PASS | `tsc --noEmit`，exit 0 |
| `npm --prefix apps/shell/ui run build` | PASS | Next 构建路由包括 `○ /prototype` |
| `node E:/Temp/console-prototype-http-smoke.mjs` | PASS | `PASS: authenticated /prototype is available and identifies memory/prototype scope` |
| `npm run test:shell` | PASS | `tests 94 / pass 94 / fail 0` |
| `node scripts/design.mjs check` | PASS | DESIGN 与 MOTION 均 faithful and answered |
| `node scripts/check-motion-contract.mjs --json` | PASS | `blocking: 0` |
| 浏览器主流程 | PASS | Chromium；1440、1024、390px；无横向溢出、运行时错误或生产 API 写请求 |
| 实际页面帧测量 | PASS | 记忆页 74 帧，最多 99 个元素；findings 与 recorderErrors 均为空 |
| 补充浏览器走查 | PASS | 配置冲突保留输入且不新增安装条目；Escape 与焦点恢复；新旧记忆双向跳转；同名项目路径；跨项目更新隔离；手机弹窗 |
| 首页导航与跨页状态 | PASS | 指定工具详情；从私人项目阅读返回首页后仍直达正确项目的指定记忆；服务恢复同步首页与活动记录 |
| 默认环境 `npm run test:regression` | PASS | `tests 2757 / pass 2745 / fail 0 / skipped 12`；286 文件，468185ms，沙箱已删除 |

浏览器证据位于 `temp/console-product-prototype/`（会话临时产物，不包含私人数据）：首页、记忆详情、私人项目示例、MCP 预览/失败/冲突、1024px、390px、深色模式截图，以及 `browser-results.json`、`extended-results.json`、`frame-results.json`。走查脚本位于 `E:/Temp/console-prototype-{browser,extended}.mjs`。

已观测的主流程：免关键词浏览；私人项目切换；同事件 ID 不共享“有用”状态；未知来源保持未知且原文可读；空与不可访问项目的不同状态及恢复；旧记忆跳到新记忆；搜索无结果恢复；包含空格的完整参数在预览中保持为一个参数；配置已写入但尚未测试→测试失败→修复重试→通过。全部为页面内模拟。

## 回归环境说明

第一次全量回归显式把 TEMP/TMP/TMPDIR 指向 E 盘，出现多项失败与耗时异常；该次运行已终止，不作为通过证据。最小复核：默认临时根下 Pi doctor 与 Headroom 共 16 项全部通过；指定 E 盘临时根后 Pi doctor 的 10 项失败，说明这批失败对临时目录设置敏感。另行重跑 Headroom 与 learn-eval 的 29 项通过。

随后使用未覆盖临时环境变量的默认 runner 重跑全量回归：2745 pass、0 fail、12 skipped；286 文件，468185ms；`temp_sandbox=removed`。全量完成后仅统一了原型新增记忆的本地时间格式，并对此重新运行 UI 检查、构建与浏览器记忆场景。

## 标准与测试差异审查

使用复制的临时 Git index 将原型未跟踪文件纳入测量，没有改动共享 worktree 的暂存状态。

- `directoryEntries`: blocking=0。
- `fileLines`: blocking=6，均为原有路径；原型文件无违规。
- `duplicateLines`: measured=631，与本轮前记录一致；原型文件无新增违规。
- CRG 后检查覆盖声明的 12 个路径；其聚合包含原有 MCP 变更，不能将 0 affected flows 作为浏览器隔离证明。
- TDD：固定 HTTP 场景在 RED 阶段失败，新增 `/prototype` 后以相同断言通过。没有删除或放宽失败断言。
- 为满足文件职责与行数预算，拆出 MCP 向导、状态模型、记忆详情和项目按钮；继续执行相同公共场景与浏览器行为走查。
- 浏览器实际暴露了无 Trigger 的受控 Dialog 焦点恢复缺口；共享 Modal 显式保存 opener，并在关闭时恢复焦点，复测已通过。
- 新增记忆最初使用 UTC，而 fixture 使用本地时间；已统一本地时间，避免“最近记录”的排序受格式时区混用影响。

## 版本评估

Version Impact: minor

Recommended Version: v7.0.1 -> v7.1.0（如将该新增预览入口纳入正式发布；本轮未提交或发布，版本文件不变）

Why: 新增独立产品预览能力，现有 Console 与后端 API 契约保持兼容。

Release Notes:
- 新增本机工具管理器交互预览。
- 演示私人项目记忆的阅读范围、来源、原文与更新关系。
- 演示 MCP 目标、预览、分离结果与失败恢复。

## Verification Loop verdict

源码、类型和浏览器场景已核对，完成范围仅为 fixture 交互原型。

```text
VERDICT:
retry_budget: 3 remaining: 1
FILES_REVIEWED:
  - apps/shell/ui/src/app/prototype/console-prototype.tsx: lines 1-300 (new)
  - apps/shell/ui/src/app/prototype/demo-data.ts: lines 1-161 (new)
  - apps/shell/ui/src/app/prototype/home-workspace.tsx: lines 1-231 (new)
  - apps/shell/ui/src/app/prototype/memory-workspace.tsx: lines 1-387 (new)
  - apps/shell/ui/src/app/prototype/mcp-workspace.tsx: lines 1-175 (new)
  - apps/shell/ui/src/app/prototype/prototype-ui.tsx: lines 1-127 (new)
  - apps/shell/ui/src/app/prototype/flows/: all four typed flow modules reviewed (new)
  - apps/shell/ui/src/app/prototype/page.tsx: lines 1-11 (new)
  - apps/shell/ui/src/components/app-shell.tsx: preview Link block reviewed (changed)
CHECKS:
  - npm --prefix apps/shell/ui run typecheck: PASS
  - npm --prefix apps/shell/ui run build: PASS
  - npm run test:shell: PASS 94/94
  - npm run test:regression: PASS 2745 / FAIL 0 / SKIP 12
  - Browser main, extended and navigation scenarios: PASS; productionWrites=[]
  - DESIGN/MOTION declarations and 74-frame actual page measurement: PASS
  - Standards: no prototype violations; repository stock fileLines=6 and duplicateLines=631 remain
CODE:
  > const memoryKey = (memory: Pick<DemoMemory, 'project' | 'id'>) => `${memory.project}:${memory.id}`;
  > date: new Date().toLocaleString('sv-SE', { hour12: false }).slice(0, 16),
VALIDATION:
  APPROVED — score: 1.0, complete: true, missing: []
```

该 verdict 的 complete 指本轮原型，不代表后端或所有私人项目问题完成。
