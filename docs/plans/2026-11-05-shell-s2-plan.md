# S2 计划：桌面壳的打包、进程收口与本地信任边界

来源：`docs/adr/0007-aios-perceived-surface-and-desktop-shell.md` 决策 5（壳深度 = S1 + S2）。
S1 已落地（`39f335b8`）：窗口 + 能力进程生命周期。本文件只写 S2 的范围、顺序与验收，不重复 ADR 的理由。

## 三个切片（每个切片自带可机器判定的验收）

### S2-1 进程收口（job object / 进程组）

**问题（S1 实测）**：`taskkill /F` 不走 Tauri 的 `RunEvent::Exit`，自起的能力进程变成孤儿，端口继续被占用。

**做法**：能力进程在启动时被放进一个 "kill on job close" 的 Windows Job Object；POSIX 走独立进程组。
**验收**：单元测试断言子进程确实在 job 内（`IsProcessInJob`）；冒烟——强杀壳体后端口被释放。

### S2-2 本地信任边界（随机 token + 只绑 127.0.0.1 + 跨站拒绝）

**问题**：S1 实测 `next start` 默认绑 `0.0.0.0`（已修）。页面一旦引入动作，任何本机进程/网页都能打它。

**做法**：
- token 由**能力进程**生成（谁起服务谁持有），发布到易失目录，壳体读取后用它打开窗口；
- 首帧 `GET /t/<token>/` 校验通过后种 `SameSite=Strict` cookie 并 redirect，后续同源请求靠 cookie；
- 所有请求：`Sec-Fetch-Site: cross-site` 拒绝；带 `Origin` 且不是本机同端口拒绝；无 cookie 拒绝。
- `tauri.conf.json` 的 `devUrl` 删除——窗口 URL 由代码生成，保留它等于第二份 URL 事实。

**验收**：单元测试（纯函数决定表）+ `next start` 起的真实进程上跑请求矩阵（无 token / 错 token / 对 token / 跨站 Origin / 跨站 Sec-Fetch），断言状态码。

### S2-3 打包（不签名）

**问题**：`bundle.active=false`，产物只有裸 exe。
**做法**：Tauri CLI 出 Windows/macOS/Linux 安装包，CI matrix 执行；产物只放 release 附件并显式标注未签名。
**验收**：本地或 CI 真实产出安装包文件 + 安装后能启动；做不到就如实记录卡在哪一步（不勾选框）。

## 顺序与边界

1. S2-1 → 2. S2-2 → 3. S2-3。前两者不依赖 GUI，可本地闭环；S2-3 依赖网络与平台工具链，允许单独标注失败原因。

## 进度（2026-11-05）

- **S2-1 完成**。`src-tauri/src/job.rs`：Windows 走 `KILL_ON_JOB_CLOSE` job object，Unix 走独立进程组；
  单元测试断言子进程确实在 job 内（`IsProcessInJob`）且句柄释放时被杀。实测：`taskkill /F` 掉壳体后
  端口立即释放、`node` 进程数 0。
- **S2-2 完成**。token 由 `scripts/aios-ui.mjs` 生成并发布（`<tmp>/aios-ui-token-<port>`），
  窗口打开 `/t/<token>/`，`src/proxy.ts` + `src/lib/trust.mjs` 换 cookie 并拒绝跨站/异源。
  实测请求矩阵见 `apps/shell/README.md`。为给 `proxy.ts` 腾出目录预算，源码搬进 `ui/src/`
  （Next 一等布局）。`tauri.conf.json` 的 `devUrl` 已删：窗口 URL 带 token，由代码生成。
- **S2-3 完成（未签名，未做安装验证）**。`bundle.active=true`、`targets=["nsis"]`，
  `npm run shell:bundle` 产出 `AIOS_0.1.0_x64-setup.exe`（1.84 MiB）。
  过程中修掉一个自己造成的问题：`frontendDist` 原指向 `../ui/.next`，把 125 MB 的 Next 产物
  塞进了永不读取它的安装包（90.16 MiB）；改指 `src-tauri/resources/` 后回到 1.84 MiB。
  未做：安装执行（写 Program Files/注册表，属系统级副作用，交所有者决定）。

## 未关闭的决定（需要所有者拍板）

打包出来的是**薄窗口**：它要求目标机器上已有一份装好依赖并构建过界面的 AIOS 树。
另一条路是**自带运行时**（打包 node + 已构建的界面 + 能力进程），安装包更大但可独立运行。
ADR 决策 3 说能力进程常驻、壳只是视图，倾向薄窗口；但今天的发布产物（`release-contents.json`
排除 `apps/`）不含界面构建产物，所以薄窗口在真实用户机器上找不到服务。二者必须选一个，
在此之前 S2-3 只能算「能出包」，不能算「能交付」。

**明确不做**：签名/公证（需付费证书）、托盘/自启/深链（S3）、`aios ui` 子命令接线、插件 manifest 家族（M2）。
