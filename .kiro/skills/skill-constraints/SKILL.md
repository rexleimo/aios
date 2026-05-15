---
name: skill-constraints
description: Use when executing any skill or browser automation task - enforces operational constraints and best practices
---

# 技能使用约束

## Overview

所有技能操作必须遵循此约束规范，确保安全、高效、可追溯。

## When to Use

- 执行任何浏览器自动化操作时
- 使用 MCP 工具（`page.extract_text`, `page.get_html`, `page.screenshot` 等）时
- 进行任何运营操作（发布笔记、点赞、评论等）时

## Core Pattern

### 浏览器操作

```markdown
0. 启动浏览器时默认要求可见界面并走 CDP
   - 优先：`chrome.launch_cdp { port: 9222, user_data_dir: '~/.chrome-cdp-profile' }`
   - 随后：`browser.connect_cdp { cdp_url: 'http://127.0.0.1:9222' }`
   - 仅在无图形环境或后台 smoke test 时才允许 headless 模式
   - 当同一 `userDataDir` 被其他进程占用时，优先复用已启动浏览器，不共享被锁目录
   - 若目标是“多个 agent 共享同一登录态”，统一连接同一个 CDP endpoint

1. 优先使用文本/DOM证据做决策
   - 先读 `page.extract_text`，必要时补充 `page.get_html`
   - 比整页截图更高效，可快速定位按钮文案和页面状态
   - 不使用 `chrome-devtools` 工具链执行业务流程，统一走 `puppeteer-stealth` 的 browser-use 工具链（`chrome.*` / `browser.*` / `page.*`）

2. 只有视觉信息不足时才截图，并保存到 temp/ 目录
   - 条件：文本/HTML 证据不足以判断状态
   - 使用：`page.screenshot`
   - 路径：`aios/temp/{操作类型}_{时间戳}.png`
   - 示例：`login_20240301_120000.png`
```

### 操作间隔

```bash
# 随机等待 5-30 秒
sleep $((RANDOM % 26 + 5))
```

## Rules

### 禁止行为

| 禁止 | 说明 |
|------|------|
| 直接在对话中粘贴大段截图 | 浪费 token，必须保存到文件 |
| 跳过反检测脚本 | 每次操作前必须执行 |
| 忽略操作间隔 | 必须随机 5-30 秒 |
| 在非 temp 目录保存截图 | 必须保存到 aios/temp/ |
| 自动化执行第三方平台登录 | 登录必须人工完成（含 2FA） |

### 必需行为

| 必须 | 说明 |
|------|------|
| 操作前执行反检测 | 使用 skill/反检测脚本.json |
| 截图保存到 temp/ | 路径固定为 aios/temp/ |
| 先读文本/DOM | `page.extract_text -> page.get_html` |
| 使用 grep 搜索快照 | 而非目视查看截图 |
| 记录到历史 | 关键操作写入 memory/history/ |
| 登录态检测 | 识别到登录页/验证码/2FA 时先提示用户协作登录 |

### MCP 工具优先级

1. **page.extract_text** - 首选，获取页面文本证据并做主决策
2. **page.get_html** - 补充 DOM 结构和属性信息
3. **page.screenshot** - 仅在视觉降级时使用
4. **page.click** - 通过 selector 操作
5. **page.type** - 通过 selector 输入

## Examples

### Good

```json
// 启动并连接 CDP 浏览器
chrome.launch_cdp { port: 9222, user_data_dir: '~/.chrome-cdp-profile' }
browser.connect_cdp { cdp_url: 'http://127.0.0.1:9222' }

// 获取文本/DOM证据
page.extract_text { session_id: '<session_id>' }
page.get_html { session_id: '<session_id>' }

// 搜索内容
grep "关注" snapshot.txt

// 仅视觉降级时截图，并保存到正确位置
page.screenshot { session_id: '<session_id>', path: 'aios/temp/publish_20240301_120000.png' }
```

### Bad

```
// 在对话中直接展示截图
[直接在回复中嵌入截图]

// 跳过间隔
page.click()  // 立即执行
page.click()  // 没有等待
```

## Common Mistakes

| 错误 | 正确做法 |
|------|----------|
| 截图直接在对话中显示 | 保存到 temp/，用 Read 工具查看 |
| 忽略随机间隔 | 每次操作后 sleep 5-30 秒 |
| 默认先看整页截图 | 先读布局字段，必要时再局部截图 |
| 用眼睛看截图找内容 | 用 grep 从快照搜索 |
| 在项目根目录放临时文件 | 统一放 aios/temp/ |
