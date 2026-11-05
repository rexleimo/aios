# 控制台验收记录（2026-11-05）

对象：`apps/shell`（ADR 0007 一期）——接入矩阵 + 桌面壳 + 控制台。
本记录只写**实测结果**与**未验项**。截图在 `docs/reports/evidence/shell-console-2026-11/`。

## 环境

| 项 | 值 |
|---|---|
| OS | Windows（x64） |
| Node / 打包 | 24.16.0 · Next 16.4.5（**Turbopack**，无 `--webpack`） |
| 壳 | Tauri 2.12.5 · cargo 1.97.1 |
| 启动方式 | `npm run app`（一条命令：起服务 → 复用/拉起 → 开窗） |
| 服务绑定 | `127.0.0.1:3126`（`netstat` 只有这一条 LISTENING） |

启动后进程实测：`aios-shell.exe` × 1、`msedgewebview2.exe` × 32、`node`（next start）在 3126 监听。
窗口本身**没有**被自动截图验证（GUI 窗口不在截图工具的可见范围内）；间接证据是 webview 进程
与它对 3126 的 ESTABLISHED 连接。

## 逐页耗时（缓存清空、`AIOS_UI_NO_WARM=1`）

| 页面 | TTFB（骨架） | 完整 |
|---|---|---|
| `/memory` | 0.027 s | 0.320 s |
| `/usage` | 0.016 s | 0.357 s |
| `/skills` | 0.017 s | 0.272 s |
| `/integrations` | 0.014 s | 0.287 s |
| `/team` | 0.018 s | 2.371 s |
| `/matrix` | 0.012 s | 3.214 s |
| `/`（总览） | 0.013 s | 0.013 s（矩阵键已被上一步预热） |
| `/settings` | 0.026 s | 0.027 s |

真冷（同一实例、没有任何缓存、先访问总览）：`ttfb=0.114 s`，`total=2.907 s`；随后再取 `0.017 s`。

对照（本轮优化前，同一台机器）：`aios status --json` 端到端 8 s，控制台冷启动首屏 7.4 s，且
首字节要等 7.8 s 才出现（同步 spawn 卡住事件循环，骨架刷不出去）。

## 动作面

| 动作 | 结果 |
|---|---|
| 总览「重新采集」 | 流式吐出真实 `aios status --json`；退出码 1 显示为「完成（退出码 1：判定为 blocked）」；完成后清快照并重取，页头变「刚刚采集」 |
| 矩阵行 → 详情 → 「预览安装」 | 真跑 `aios setup --dry-run --client claude`；操作后 `git status` 干净（预览不写任何东西） |
| 矩阵行 → 详情 → 「安装 / 修复」 | 需要二次确认（点击后按钮变「确认执行（写主目录）」）。**本记录未执行**：它会写客户端主目录 |
| 未授权请求（无 token cookie） | `POST /api/actions/status.refresh` → `403 missing-token` |

## 设置页写回

| 场景 | 结果 |
|---|---|
| 正常保存（把 `aios-harness` 的 `metrics` 取消声明） | 200；`git diff` 只显示该轴被移除；新建备份 `.aios/config-backups/host-capabilities-2026-11-05T03-40-04-824Z.json` |
| 还原 | `git checkout config/host-capabilities.json` 后与最新备份逐字节一致 |
| 旧 hash | 409 `stale-hash` |
| 非法等级 `L9` | 422 `clients.codex.targetLevel` |
| 未知轴 `notAnAxis` | 422 `unknown capability "notAnAxis"` |
| 未知客户端 `ghost` | 422 `unknown client(s)` |
| 缺字段 | 400 `invalid-body` |
| **验证失败回滚**（把 `scripts/aios.mjs` 临时移走再保存） | 500 `verification-failed`，`detail` 为一行 `Error: Cannot find module '…\scripts\aios.mjs'`，返回 `rolledBackTo`；`config` 未被改动；`aios.mjs` 复原后命令正常 |

回滚分支是**故意触发**的：第一版把 stderr 前 500 字直接塞进界面，横幅里是一屏 Node 栈帧；
现在压成一行头部错误（`summarizeFailure`）。

## 自动化证据

```
shell 测试（node --test "scripts/tests/tooling/shell/**/*.test.mjs"）   72/72
aios-standards directoryEntries                                       blocking=0
npm run ui:build                                                      9 routes, ~0.5 s
cargo test（壳）                                                      10/10
```

## 未验 / 已知边界

1. **桌面窗口本身**没有自动截图；验证到的是壳进程 + webview 进程 + 它对服务的连接。
2. **「安装 / 修复」未执行**：会写客户端主目录，属于需要所有者决定的外部副作用。
3. **二期网关未建**：magpie 那种「请求级用量 / 路由图 / 供应商切换」不在这一期。
4. **会话页未建**：ContextDB 有库，缺一层只读查询接口。
5. `aios status` 仍约 2 s（本轮从 8 s 压下来）；再压需要缓存失效策略或并行探测，属于行为变更。
6. 验证失败分支只在「命令不可用」这种注入故障下跑过；真实世界的"解析得到但语义坏"的输入没有穷举。