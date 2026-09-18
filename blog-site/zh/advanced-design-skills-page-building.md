---
title: "高级设计技能页面制作：把模糊提示词变成可生产 UI"
publish_date: 2026-04-18
description: "一套可执行的实践：用 DESIGN.md 与 frontend-design 技能，把「改一改页面」这类模糊需求落地为稳定、高质量的 UI 与交互，包含视觉契约模板、验收清单与常见返工原因，适合前端与设计协作场景。交付前照着清单自查一遍即可。"
---

# 高级设计技能页面制作：把模糊提示词变成可生产 UI

很多用户的输入都很短：

- “把这个区块改高级一点”
- “参考 Stripe 风格做一下”
- “做一套完整 SaaS 后台”

如果没有风格约束，这类请求很容易产出模板化页面。有效做法是：先锁风格，再落地实现。

## 两个技能一起用

1. `awesome-design-md`：先生成 `DESIGN.md` 风格契约
2. `frontend-design`：按契约输出页面和交互

这样 coding agent 在写代码前就有了明确视觉方向。

## 快速开始

```bash
node <AIOS_ROOT>/scripts/aios.mjs setup --components skills --client codex --scope project --skills awesome-design-md,frontend-design
npx --yes getdesign@latest add linear --force
```

固定提示词：

```text
先按 DESIGN.md 定风格，再用 frontend-design 落地实现页面。
```

## 模糊输入不阻塞：三类模式

- `Patch`：局部元素优化
- `Restyle`：结构不变，视觉体系重做
- `Flow`：完整 SaaS 业务链路页面

先分类，再写简短假设（目标、用户角色、平台、范围），然后继续实现。

## SaaS 交付标准

完整流程需求至少包含：

- 仪表盘
- 列表页
- 详情页
- 创建/编辑表单
- 设置/计费页（或等价模块）
- 核心状态：`loading`、`empty`、`error`、`success`
- 交互状态：`hover`、`focus`、`active`、`disabled`

这是避免“只会做静态展示稿”的最低质量线。

## 默认风格起点

- SaaS/B2B：`linear`、`vercel`、`supabase`
- 营销页：`framer`、`stripe`、`notion`
- 文档站：`mintlify`、`hashicorp`、`mongodb`

没有行业信号时，默认先用 `linear`。

## 给产品团队的落地建议

建议把这条系统提示词设为默认：

```text
当用户需求模糊时，请先自动判断是 Patch/Restyle/Flow 三类中的哪一类；基于 DESIGN.md 锁定风格后再实现页面。输出必须包含完整交互状态（hover/focus/active/disabled）以及核心流程的 loading/empty/error/success。
```

通常这比堆很多示例提示词更稳定。

## 对应文档

- [高级设计技能（文档）](https://cli.rexai.top/zh/advanced-design-skills/)
