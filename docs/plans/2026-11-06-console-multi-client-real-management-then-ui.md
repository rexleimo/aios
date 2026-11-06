# Console multi-client real management then UI

工作项：console-multi-client-management。用户确认 ADR 0009、内置与外部技能完整范围，并明确要求开始实现。disposition=planned；task-type=implementation。

## 范围与决定

A → B：先真实管理引擎，再接线界面。覆盖权威注册表全部客户端，不复制另一份能力事实。MCP 沿用既有落点与所有权引擎。技能包含查看来源/版本/生效范围、安装、更新/同步、分发、移除、诊断。集成接既有 list/add/remove/doctor；agent 接已有定义管理能力，不启动模型任务。

非目标：聊天、市场、网关、自动启动 agent、管理客户端程序的下载安装、绕过配置归属保护。测试不修改用户真实配置。

## 验收与公共测试缝

1. 客户端事实来自注册表；全部十家可见，不支持的操作带原因。
2. 技能目录覆盖内置 catalog、外部 registry 与客户端发现内容；来源缺失、重复、路径异常不会变成空成功。
3. 安装/同步/分发在指定 client/scope 生效；预览不写配置、账本、备份。移除仅影响选定受管副本，其他副本与 canonical 源保留。
4. 修改过或非 AIOS 管理内容默认拒绝覆盖/移除；可恢复备份、逐目标结果与部分失败可观察。
5. UI 使用真实 API，先预览再执行，写入结果和加载/握手状态分开。不能使用示例数据作生产状态。
6. 集成和 agent 复用命令白名单，只展示已存在的管理操作与限制。

公共测试入口：技能管理导出/API 后 CLI；测试 homeMap、registryRoot、projectRoot 指向系统临时目录。shell 数据层参数构造测试、真实文件 roundtrip、CLI JSON、UI typecheck/build；最后 test:regression。

RED 切片：临时目录外部技能安装到 claude/pi → 预览不落盘 → 真安装 → 修改后同步/移除拒绝 → 未修改副本移除 → 另一客户端与源仍在。内置技能使用小型真实 manifest fixture 验证同一协议。禁止删断言、跳过用例或只验 mock。

## 依赖与实施边界

| id | type | dependsOn | targets / allowedWrites | failureClass | verification |
| --- | --- | --- | --- | --- | --- |
| skills-engine | implementation | — | scripts/lib/tooling/components/skills/, scripts/lib/tooling/cli/, scripts/tests/tooling/shell/data/ | safety-gate | 公共技能管理临时目录集成用例、CLI JSON |
| management-api | implementation | skills-engine | apps/shell/ui/src/lib/data/, apps/shell/ui/src/app/api/ | runtime-error | 参数白名单与 API 契约、typecheck |
| console-ui | implementation | management-api | apps/shell/ui/src/components/console/ | runtime-error | typecheck/build、真实 API smoke |
| verify | verification | console-ui | docs/plans/, docs/adr/ | regression | focused tests + regression |

正常路径：选客户端和 scope → 读取 inventory → 选择技能来源 → preview → 确认 → 文件引擎应用 → 重新读取 inventory；无客户端加载证据时只报告配置存在。

失败路径：目标内容修改或用户自有同名目录 → preview 显示冲突 → 应用时重新读取并核对 → 拒绝且保持原字节；多个目标逐项报告，不把部分失败当成功。共享技能根按物理目标识别影响，不能宣称只影响一个客户端。

可行性：客户端注册表、技能 catalog/materializer/归属元数据、MCP 引擎、integration CLI 与 agents CLI 均已有真实代码；外部安装缺 dryRun、通用技能库存与安全卸载需补齐。CRG 工具搜索无 get_impact_radius，使用定向 rg + 源码 + 测试调查。工作树仅有本次 ADR 未跟踪，不 pull/stash/reset。

readiness=ready：用户已接受完整范围及执行顺序；其他能力按现有命令接入这一边界沿用接受的 A，无须新授权。详细 UI 保持现有设计方向。
