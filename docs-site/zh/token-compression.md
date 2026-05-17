---
title: 自研 Token 压缩
description: RexCLI 的输入/输出省 token 工作流，不安装 RTK、Caveman 或竞品 shell hook。
---

# 自研 Token 压缩

## 快速答案

RexCLI 原生省 token。我们参考 RTK 风格的输入过滤和 Caveman 风格的输出简写，但**不安装** RTK、Caveman、shell hook 或竞品 CLI。

工作流分两层：

1. **输入压缩**：ContextDB 包、浏览器页面读取、命令输出进入模型前先降噪。
2. **输出压缩**：Agent 回复更短，但保留命令、路径、错误、选择器、日期、风险和验证缺口。

## 输入压缩

### ContextDB 包

使用内置 `context:pack` 策略引擎：

```bash
cd mcp-server
npm run contextdb -- context:pack \
  --session <session_id> \
  --limit 60 \
  --token-budget 1200 \
  --token-strategy balanced \
  --out .aios/context-db/exports/<session_id>-context.md
```

策略：

| 策略 | 使用场景 | 行为 |
|------|----------|------|
| `legacy` | 严格兼容旧行为 | tail-window 行为 |
| `balanced` | 默认推荐 | 先压缩低信号文本，再丢弃 |
| `aggressive` | token 预算很紧，显式启用 | 更强压缩和裁剪 |

安全规则：

- 保留关键错误、失败词、文件路径、命令信号和最新状态。
- 先压缩重复行、堆栈和低信号行集合，再丢事件。
- 先丢低优先级事件，再截断受保护事件。
- 输出遥测：`strategy`、`rawTokenUsed`、`compressed`、`dropped`、`truncated`。

### 浏览器读取

使用 `aios-browser-compress`，优先获取紧凑证据：

1. `page.semantic_snapshot`
2. 定向 `page.extract_text`
3. 全页 `page.extract_text`
4. `page.get_html`
5. 只有需要视觉证据时才截图

点击、输入、发布、删除前，如果压缩视图无法证明目标存在，就重新定向读取。

### CLI 输出

不安装 shell hook。让工具输出更小范围的内容：

```bash
rg -n "pattern" path
git diff --stat
sed -n '120,180p' file.ts
tail -n 120 test.log
```

## 输出压缩

使用 `aios-compress` 控制回复风格：

| 档位 | 使用场景 | 行为 |
|------|----------|------|
| `tight` | 日常编码 | 精简技术回答，无废话 |
| `ultra` | harness 日志、checkpoint | 一行证据 + 下一步 |
| `precise` | 浏览器操作、安全、不可逆动作 | 完整明确表达 |

控制命令：

```text
/compress tight
/compress ultra
/compress precise
stop compress
```

## 为什么要原生实现？

原生压缩让行为在 Codex 和 Claude 中可审计、可保持一致：

- 无竞品依赖；
- 不全局改写命令；
- 没有隐藏 shell 行为；
- 文档、技能、代码都在仓库里；
- 验证可以证明压缩/丢弃了什么。

## 相关文件

- `mcp-server/src/contextdb/core.ts`
- `skill-sources/aios-compress/SKILL.md`
- `skill-sources/aios-browser-compress/SKILL.md`
- `.codex/skills/aios-compress/SKILL.md`
- `.codex/skills/aios-browser-compress/SKILL.md`
- `.claude/skills/aios-compress/SKILL.md`
- `.claude/skills/aios-browser-compress/SKILL.md`
