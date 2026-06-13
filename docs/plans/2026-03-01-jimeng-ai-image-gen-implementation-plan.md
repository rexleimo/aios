# 即梦AI文生图技能实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** 创建一个自动化技能，通过浏览器操作即梦AI网站实现文生图功能

**Architecture:** 基于现有 mcp-browser-use MCP，创建一个技能 JSON 文件，定义操作流程和提示词模板

**Tech Stack:** JSON 技能文件 + mcp-browser-use MCP 浏览器自动化

---

## Task 1: 创建技能文件

**Files:**
- Create: `memory/skills/即梦AI生成图片.json`

**Step 1: 创建技能文件**

根据设计文档和浏览器操作规范，创建一个完整的技能文件：

```json
{
  "skill_name": "即梦AI生成图片",
  "description": "通过即梦AI网站自动生成图片，文生图功能",
  "trigger_keywords": ["即梦生成图片", "AI生成图片", "用即梦做图", "jimeng生成"],
  "platform": "jimeng.jianying.com",
  "url": "https://jimeng.jianying.com/ai-tool/image/generate",

  "mcp_required": "mcp-browser-use",

  "steps": [
    {
      "step": 1,
      "action": "启动浏览器",
      "tool": "browser_launch",
      "params": { "profile": "default" }
    },
    {
      "step": 2,
      "action": "导航到即梦AI文生图页面",
      "tool": "browser_navigate",
      "params": { "url": "https://jimeng.jianying.com/ai-tool/image/generate" }
    },
    {
      "step": 3,
      "action": "获取页面快照，检查登录状态",
      "tool": "browser_snapshot"
    },
    {
      "step": 4,
      "action": "如果未登录，提示用户扫码登录",
      "condition": "检测登录元素"
    },
    {
      "step": 5,
      "action": "输入提示词",
      "tool": "browser_type",
      "selector": "textarea",
      "params": { "text": "${prompt}" }
    },
    {
      "step": 6,
      "action": "选择图片风格（可选）",
      "tool": "browser_click",
      "selector": "${style_selector}"
    },
    {
      "step": 7,
      "action": "选择图片比例",
      "tool": "browser_click",
      "selector": "${ratio_selector}"
    },
    {
      "step": 8,
      "action": "点击生成按钮",
      "tool": "browser_click",
      "selector": "button.generate, button.primary"
    },
    {
      "step": 9,
      "action": "等待图片生成完成",
      "tool": "wait",
      "timeout": 60000
    },
    {
      "step": 10,
      "action": "获取生成的图片并下载",
      "tool": "browser_screenshot",
      "params": { "filePath": "aios/images/jimeng-${timestamp}.png" }
    },
    {
      "step": 11,
      "action": "关闭浏览器",
      "tool": "browser_close"
    }
  ],

  "style_presets": {
    "写实": "写实风格，高清逼真",
    "卡通": "卡通插画风格，可爱有趣",
    "漫画": "漫画风格，线条分明",
    "插画": "商业插画风格，精美细腻",
    "唯美": "唯美梦幻风格，浪漫优雅"
  },

  "aspect_ratios": {
    "3:4": "竖版推荐，小红书最佳",
    "1:1": "方形图文",
    "16:9": "横版"
  },

  "prompt_examples": [
    "粉色和浅紫色渐变背景，梦幻光斑效果，马卡龙配色，浪漫温馨氛围",
    "一个女孩安静看书的剪影，暖黄和橙色渐变背景，日落时分氛围",
    "极简现代设计，几何图形装饰，浅色专业背景"
  ],

  "error_handling": {
    "未登录": "提示用户扫码登录后继续",
    "生成失败": "重试1次，仍失败返回错误信息",
    "下载失败": "提示用户手动保存"
  },

  "output": {
    "directory": "aios/images/",
    "filename_pattern": "jimeng-${timestamp}.png"
  }
}
```

**Step 2: 验证文件格式**

运行：检查 JSON 格式是否正确
```bash
cat memory/skills/即梦AI生成图片.json | python3 -m json.tool > /dev/null && echo "JSON valid"
```
Expected: 输出 "JSON valid"

---

## Task 2: 测试技能 - 探索即梦网站

**Files:**
- Test: 使用 mcp-browser-use MCP 打开即梦网站

**Step 1: 启动浏览器并导航**

使用 browser_launch 和 browser_navigate 打开 https://jimeng.jianying.com/ai-tool/image/generate

**Step 2: 获取页面快照**

使用 browser_snapshot 获取页面 HTML，分析：
- 登录状态元素
- 输入框位置和 selector
- 风格选择器
- 比例选择器
- 生成按钮 selector
- 下载按钮位置

**Step 3: 记录实际 selector**

更新技能文件中的 selector 为实际验证过的值

---

## Task 3: 完整流程测试

**Step 1: 输入测试提示词生成图片**

使用测试提示词："粉色渐变背景，梦幻光斑，马卡龙配色，简约可爱风格"

**Step 2: 等待并下载图片**

验证图片生成和下载流程

**Step 3: 更新技能文件**

根据实际测试结果更新 selector 和流程

---

## Task 4: 提交技能文件

**Step 1: 提交到 git**

```bash
git add memory/skills/即梦AI生成图片.json docs/plans/2026-03-01-jimeng-ai-image-gen-design.md
git commit -m "feat: 添加即梦AI文生图技能

- 支持文生图功能
- 自动下载图片到 aios/images/
- 内置风格预设和提示词模板"
```
