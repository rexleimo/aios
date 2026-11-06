# MCP 落点证据卡（2026-11-05 切片）

这一份目录只放**可以复跑的证据**，不放结论性形容词。每张卡回答四个问题：

1. 这个落点在声明表里能不能写（`writable` / `registered` / 文件在不在）；
2. 真装一条探针条目，`aios mcp doctor` 能不能读回来并认成 `owned`；
3. 卸掉之后配置文件是否**逐字节**回到安装前（`before-hash` vs `after-hash`）；
4. 这台机器上那家客户端到底装没装（没装就写 `host-unsupported` + 原文，不编原因）。

探针条目名固定为 `aios-landing-probe`，**不含 env**：证据卡要能公开，凭据与端口值一概不进。每次写入都由写路径留下备份，卸载后按 sha256 校验。

## 怎么重跑

```bash
node scripts/mcp-landing-evidence.mjs                      # 预演：只打印会跑哪些落点、会碰哪些文件
node scripts/mcp-landing-evidence.mjs --apply              # 真跑并重写本目录
node scripts/mcp-landing-evidence.mjs --apply --only claude,codex
node scripts/mcp-landing-evidence.mjs --apply --json       # 机器可读汇总
```

默认**不**给缺失的配置文件建新文件（那会把「这台机器上本来没有」改写成「有，而且是空的」）；确有需要要显式 `--allow-create`。

## 状态词

| status | 含义 | 读法 |
|---|---|---|
| `verified` | 装得上、读回来是 `owned`、卸得掉、字节回原样 | 这一家这一 scope 真的可用 |
| `unverified` | 没有通过上面四步（配置缺失被跳过、落点不可写、读回不是 `owned`、字节没回原样） | `reason` 里有原因原文；不算通过 |
| `host-unsupported` | 这台机器没装该客户端 | `reason` 是 `client binary not on PATH: <cmd>`；不是实现失败，也不是通过 |

界面（`/mcp`）按文件存在性把 `verified` 的落点显示成 `landing-verified`，其余照实显示 `landing-unverified` / `landing-error` / `landing-unregistered`。**没有证据卡就是未验证**——这是 ADR 0008 决策 2 的直译。

## 本次采集结果（2026-11-06）

`index.json` 是机器可读的汇总；下面是人读版：

- **verified（12）**：claude/home、claude/project、codex/home、codex/project、gemini/home、gemini/project、opencode/home、hermes/home、hermes/project、grok/home、grok/project、pi/home；
- **unverified（1）**：pi/project —— 声明表把 Pi 项目级定为不可写（Pi 适配器直接读仓库自己的 `.mcp.json`），`reason: landing-not-writable`；
- **host-unsupported（5）**：workbuddy/home、qoder/home、qoder/project、zcode/home、zcode/project —— 这台机器没装这三家的 CLI。

## 与 headroom 的关系

`headroom-mcp.json` 是同一轮里 headroom（w5c：AIOS 自写）的证据卡，单独一份：它不属于 `CLIENT_MCP_TARGETS` 的落点表，而是「AIOS 往三个 runtime 的配置里写 headroom 条目」这一件事。