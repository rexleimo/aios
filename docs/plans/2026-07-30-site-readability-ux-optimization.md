# 站点可读性与体验优化建议

> 基线版本：5.3.0 · 制定日期：2026-07-30
> 触发问题：**用户进站后不细看就划走**
> 关联文档：`docs/plans/2026-07-30-docs-seo-geo-growth-plan.md`（SEO/GEO 部分不重复）

---

## 0. 结论先行

划走不是内容不好，是**视觉系统在告诉用户"正文不重要"**。

已核实的四个根因，全部可量化、可修：

| # | 根因 | 数字 | 影响 |
| --- | --- | --- | --- |
| R1 | 正文被双重降权：比标题**暗 2.5 倍 + 小 2.2 倍** | 正文 16.4px/7.3:1，H2 36–50px/18:1 | 眼睛只扫标题，不进正文 |
| R2 | 行长超标 | docs **~93 字符/行**（目标 60–75） | 每行末尾找不到下一行开头，读两段就累 |
| R3 | 卡片套卡片，阴影全同 | `.rex-doc-content` 是卡片，内部 table/pre/quote/img 又各是卡片，`box-shadow` 完全一致 | 无深度层级，页面像一堆盒子，找不到重点 |
| R4 | docs 与 blog 是**两套互不相关的设计系统** | 底色、强调色、display 字体、正文字号全不同 | 从博客点进文档像换了个产品，信任断裂 |

底层原因：**`tokens.css` 里没有字阶、行高、间距、measure 任何一个 token。**

---

## 1. 已核实缺陷清单

### R1 — 正文被设计成次要元素（最高优先）

```css
/* docs-site/assets/redesign/components.css:1-5 */
.md-typeset {
  color: var(--rex-muted);   /* #94A3B8 */
  font-size: 0.82rem;         /* = 16.4px（Material html 125% → 1rem = 20px） */
  line-height: 1.72;
}

/* components.css:7-15 —— 标题用 --rex-text (#F8FAFC) */
/* components.css:23-28 */
.md-typeset h2 {
  font-size: clamp(1.7rem, 3vw, 2.5rem);   /* 桌面 36–50px */
  letter-spacing: -0.035em;
  border-top: 1px solid var(--rex-border); /* 整行横线 */
  margin-top: 2.6rem;                       /* 52px */
}
```

实测对比度（相对 `.rex-doc-content` 背景 ≈ `#0D1220`）：

| 元素 | 颜色 | 对比度 | 字号 |
| --- | --- | --- | --- |
| 标题 | `#F8FAFC` | ≈ 18:1 | 36–50px |
| **正文** | `#94A3B8` | **7.3:1** | **16.4px** |
| 次级文字 | `#64748B` | **4.23:1** ❌ 不过 AA | 13.2px |

问题：正文既暗又小，标题既亮又大（还带整行横线）。视觉权重全给了标题。
用户行为完全符合预期——**扫标题，跳过正文，划走。**

排版通行做法反过来：**正文应是对比度最高的元素**，层级靠字号和留白做，不靠把正文调暗。

### R2 — 行长 ~93 字符

```css
/* pages.css:6-9 */
.rex-doc-main__inner { width: min(820px, 100%); }
/* pages.css:120-123 */
.rex-doc-content { padding: 1.5rem; }   /* 30px × 2 */
```

可读宽度 = 820 − 60 = **760px**，正文 16.4px，Inter 平均字宽 ≈ 0.5em ≈ 8.2px → **≈ 93 字符/行**。

博客略好：容器 `min(760px, ...)`（`blog-post.css:6`），正文 `0.95rem` = 19px → **≈ 80 字符/行**。

两者都超过 60–75ch 的可读区间。93ch 是「读到行尾找不回下一行开头」的典型区间，也是长文跳出的主因之一。

### R3 — 卡片套卡片，阴影无层级

同一个 `box-shadow: 0 18px 60px rgba(0,0,0,0.34)`（`--rex-shadow-soft`）被用在：

- `.rex-doc-outline`、`.rex-doc-content`（`pages.css:56-63`）
- `.md-typeset pre` / `.highlight`（`components.css:92-97`）
- `.md-typeset table:not([class])`（`components.css:99-105`）
- `.md-typeset blockquote / .admonition / details`（`components.css:121-130`）
- `.rex-doc-content img`（`pages.css:148-153`）
- `.rex-card`（`components.css:145-151`）

即：内容容器本身是卡片，容器里每个块级元素又是同样阴影的卡片。
**阴影本来是表达 z 轴层级的，全都相同就等于没有层级**，只剩视觉噪声。文档页看起来像卡片列表，而不像可读文章。

### R4 — docs / blog 两套设计系统

`blog-site/assets/custom.css` 明确写了：
```css
/* Blog build keeps a separate asset root; shared docs CSS is intentionally not imported here. */
```

后果：

| token | docs (`tokens.css`) | blog (`blog-tokens.css`) |
| --- | --- | --- |
| 底色 | `#06070D`（蓝黑） | `#111111`（中性灰） |
| 强调色 | `#22D3EE` 青 | `#FF8400` 橙 |
| display 字体 | Space Grotesk | **JetBrains Mono** |
| 正文字体 | Inter | Geist |
| 正文字号 | 16.4px | 19px |
| 正文行高 | 1.72 | 1.82 |
| muted | `#94A3B8` | `#B8B9B6` |
| soft | `#64748B` | `#7A7A76` |

同一域名、同一产品，两个品牌。用户从搜索落到博客、再点进文档 = 感知为两个网站。
维护成本也翻倍（改一次排版要改两套）。

### R5 — mono 字体误用（可读性直接损失）

JetBrains Mono 被用在**非代码**位置：

| 位置 | 文件 | 字号 | 叠加 |
| --- | --- | --- | --- |
| 文档页 H1 | `pages.css:41` | 40px | `letter-spacing: -0.04em`（等宽字负字距 = 挤压） |
| 面包屑 | `pages.css:18-21` | 13.2px | 全大写 + `0.08em` |
| outline 标题 | `pages.css:76-80` | 13.6px | 全大写 + `0.13em` + `font-weight: 900` |
| **表格表头** | `components.css:111-114` | **13.6px** | 全大写 + `0.08em` |
| admonition 标题 / summary | `components.css:136` | — | — |
| **blog display 字体（含 H1/H2）** | `blog-tokens.css:11` | 47–80px | — |

「等宽 + 全大写 + 加字距 + 13.6px」是可读性最差的组合之一。文档里表格极多（`cli-comparison.md`、`workflow-policy.md`、`changelog.md` 全是表），表头恰好用了这个组合。

### R6 — 无障碍失败项

| 项 | 实测 | 标准 | 位置 |
| --- | --- | --- | --- |
| `--rex-soft` on bg | **4.23:1** | AA 需 4.5:1 | `pages.css:17`（面包屑）、`pages.css:112` |
| `--rex-blog-soft` on bg | **4.38:1** | AA 需 4.5:1 | 博客 meta |
| 链接下划线 | `rgba(34,211,238,0.35)` 近不可见 | 不应只靠色相区分链接 | `components.css:37` |
| 最小字号 | 13.2px（0.66rem） | 建议 ≥14px | 面包屑、meta |

### R7 — tokens 层缺失（根因的根因）

`docs-site/assets/redesign/tokens.css` 仅 1319 字节，只有：颜色、`--rex-radius-*`、`--rex-max`、两个 shadow、三个字体族。

**没有**：字阶、行高、间距刻度、`--rex-measure`。

后果：全站硬编码了 `0.66 / 0.68 / 0.72 / 0.74 / 0.78 / 0.82 / 0.9 / 0.92 / 0.95 / 1 / 1.25rem` 等十余个随机字号，`clamp()` 上下界也是逐处手写。没有系统 → 必然不一致 → 层级读不出来。

体量失衡也说明问题：`home.css` **40KB**，而承载 108 个文档页的 `pages.css` 只有 **3.6KB**。首页被过度设计，文档页几乎没被设计。

---

## 2. 修复方案

### F1 建立排版 token 层（前置，其余修复都依赖它）

新增到 `docs-site/assets/redesign/tokens.css`，博客复用同一份：

```css
:root {
  /* ---- 字阶：1.25 模块化，基准 17px ---- */
  --rex-text-xs:   0.75rem;  /* 15px  — 标签、meta（不再用 13px） */
  --rex-text-sm:   0.8rem;   /* 16px  — 辅助说明 */
  --rex-text-base: 0.85rem;  /* 17px  — 正文（16.4 → 17） */
  --rex-text-lg:   1rem;     /* 20px  — 首段 / lead */
  --rex-text-h4:   1.05rem;  /* 21px */
  --rex-text-h3:   1.3rem;   /* 26px */
  --rex-text-h2:   1.7rem;   /* 34px  — 去掉 3vw，桌面不再涨到 50px */
  --rex-text-h1:   2.3rem;   /* 46px */

  /* ---- 行高 ---- */
  --rex-lh-tight: 1.15;   /* 标题 */
  --rex-lh-snug:  1.4;    /* 小标题 */
  --rex-lh-base:  1.7;    /* 正文 */

  /* ---- 间距刻度（4px 基） ---- */
  --rex-space-1: 0.2rem;  --rex-space-2: 0.4rem;  --rex-space-3: 0.6rem;
  --rex-space-4: 0.8rem;  --rex-space-6: 1.2rem;  --rex-space-8: 1.6rem;
  --rex-space-12: 2.4rem; --rex-space-16: 3.2rem;

  /* ---- 阅读宽度：≈68 字符 ---- */
  --rex-measure: 34rem;   /* 680px */

  /* ---- 文本颜色分级（正文提亮为最高级）---- */
  --rex-text-strong: #F8FAFC;  /* 标题 */
  --rex-text-body:   #DCE5F0;  /* 正文 — 新增，≈13:1 */
  --rex-text-muted:  #A3B2C7;  /* 辅助 — 提亮，≈8.6:1 */
  --rex-text-soft:   #8494AB;  /* 最弱 — 提亮到过 AA，≈5.6:1 */

  /* ---- 层级化阴影（替换单一 shadow-soft）---- */
  --rex-elev-0: none;
  --rex-elev-1: 0 1px 2px rgba(0,0,0,0.28);
  --rex-elev-2: 0 6px 20px rgba(0,0,0,0.30);
  --rex-elev-3: 0 18px 60px rgba(0,0,0,0.34);
}
```

保留 `--rex-muted` / `--rex-soft` 作为别名指向新值，避免一次性改 90KB CSS。

### F2 正文提权（改 4 行，收益最大）

```css
/* components.css:1-5 */
.md-typeset {
  color: var(--rex-text-body);      /* #94A3B8 → #DCE5F0，7.3:1 → ~13:1 */
  font-size: var(--rex-text-base);  /* 16.4px → 17px */
  line-height: var(--rex-lh-base);
}
```

### F3 收窄行长到 ~68 字符

```css
/* pages.css:6-9 */
.rex-doc-main__inner { width: min(1040px, 100%); }  /* 容器可以宽，正文不能宽 */

/* 正文块限宽，表格/代码/图片允许出血 */
.rex-doc-content > :is(p, ul, ol, blockquote, h2, h3, h4) {
  max-width: var(--rex-measure);   /* 680px ≈ 68ch */
}
.rex-doc-content > :is(table, pre, .highlight, img, .rex-card-grid) {
  max-width: 100%;                 /* 表格和代码保持宽，本来就需要 */
}
```

这样做的好处：**正文窄（好读），表格宽（好看全）**。现在是两者都被压在 760px 里，正文太宽、宽表格又要横向滚动。

博客同步：`blog-post.css:6` 的 `min(760px, ...)` → 正文块限 `var(--rex-measure)`，容器放到 940px。

### F4 阴影分级 + 去掉嵌套卡片

```css
/* 内容容器保留最高层 */
.rex-doc-content { box-shadow: var(--rex-elev-3); }

/* 容器内部元素降到 elev-1 或取消 */
.rex-doc-content :is(table, pre, .highlight) { box-shadow: var(--rex-elev-1); }
.rex-doc-content :is(blockquote, .admonition, details) {
  box-shadow: var(--rex-elev-0);
  background: rgba(148,163,184,0.05);   /* 靠底色区分，不靠阴影 */
}
.rex-doc-content img { box-shadow: var(--rex-elev-1); }
```

### F5 mono 归位

规则：**JetBrains Mono 只用于代码、命令、路径、版本号。其余全部换回 body / display 字体。**

要改的位置：

```css
/* pages.css:41 */
.rex-doc-hero h1 {
  font-family: var(--rex-font-display);   /* mono → Space Grotesk */
  letter-spacing: -0.02em;                 /* -0.04em 太挤 */
  font-size: var(--rex-text-h1);
}

/* components.css:107-115 —— 表格表头（改善最明显） */
.md-typeset table:not([class]) th {
  font-family: var(--rex-font-body);
  font-size: var(--rex-text-sm);   /* 13.6px → 16px */
  letter-spacing: 0;
  text-transform: none;            /* 去掉全大写 */
  font-weight: 700;
}

/* pages.css:18-21 面包屑 / pages.css:76-80 outline 标题 */
/* 同样去 mono、去 uppercase、字号提到 --rex-text-xs (15px) */

/* blog-tokens.css:11 */
--rex-blog-font-display: "Space Grotesk", "Inter", system-ui, sans-serif;
```

### F6 H2 降级、去横线

```css
.md-typeset h2 {
  font-size: var(--rex-text-h2);    /* clamp(1.7rem,3vw,2.5rem) → 固定 34px */
  line-height: var(--rex-lh-tight);
  letter-spacing: -0.02em;
  margin-top: var(--rex-space-12);
  padding-top: 0;
  border-top: none;                 /* 整行横线是最强的"分节"信号，滥用后每屏都在切断阅读流 */
}
```

H2:正文比例从 2.2–3.0× 降到 **2.0×**，层级仍清楚，但正文不再显得是附注。

### F7 统一 docs / blog 设计系统

分两步（不要一次性重写）：

1. **抽公共层**：`assets/redesign/tokens.css` 拆成 `tokens-core.css`（字阶/行高/间距/measure/阴影，两站共用）+ `tokens-docs.css` / `tokens-blog.css`（仅颜色差异）。博客 `custom.css` 引入 core。
2. **收敛品牌**：display 字体统一 Space Grotesk；强调色二选一（建议保留 docs 青 `#22D3EE` 为主，博客橙 `#FF8400` 降级为"分类标签色"而非全站强调色）；底色统一为 `#06070D` 系。

### F8 首页动画真懒加载（已定方向）

现状（`docs-site/assets/home-animation.js`）已经做到：`prefers-reduced-motion` 检测、动态 `import()`、`pagehide` 释放。缺三件：

```js
// 1. 视口内才启动（现在是 DOMContentLoaded 立刻启动）
const canvas = document.getElementById('hero-canvas');
if (!canvas) return;

// 2. 弱网 / 省流 / 低配 直接不启动
const conn = navigator.connection;
if (conn && (conn.saveData || /2g|slow-2g|3g/.test(conn.effectiveType || ''))) {
  document.documentElement.classList.add('rex-webgl-fallback');
  return;
}
if ((navigator.hardwareConcurrency || 8) <= 4 || window.innerWidth < 768) {
  document.documentElement.classList.add('rex-webgl-fallback');
  return;
}

// 3. IntersectionObserver + requestIdleCallback，让 LCP 先完成
new IntersectionObserver((entries, obs) => {
  if (!entries.some(e => e.isIntersecting)) return;
  obs.disconnect();
  (window.requestIdleCallback || requestAnimationFrame)(() => bootHomeWebGL());
}, { rootMargin: '96px' }).observe(canvas);
```

另外两个必须处理的点：

- **`docs-site/assets/vendor/three.module.js` 是 1.3MB**。为一个背景装饰引入 1.3MB 是不成比例的。建议二选一：
  (a) 用原生 Canvas2D / CSS 重写粒子效果（体积 < 5KB），或
  (b) 用 three 的 tree-shaken 自定义构建（只保留 WebGLRenderer + BufferGeometry + Points，通常可压到 150–250KB）。
- `home-webgl-runtime.js:2` 有 `THREE_CDN_URL = 'https://cdn.jsdelivr.net/...'` 兜底。这是第三方请求，与站点「local-first / 隐私」的产品叙事冲突，建议去掉 CDN 兜底，失败就走静态 SVG。
- `rex-webgl-fallback` 状态需要一张体面的静态 SVG（复用 `assets/visual-architecture-overview.svg` 风格），不能是空白。

### F9 首页首屏（沿用 SEO 文档的方案，此处只补可读性要求）

- H1 换成带实体词的句子，原标语降 H2 —— 见 SEO 文档
- **首屏加可复制安装命令 + Copy 按钮**（当前 `index.md` 首屏无安装片段）
- `index.md` 是 15.9K 手写 HTML；建议把重复的 section 抽成 Jinja partial 放到 `overrides/partials/rex/home/`，markdown 只留数据。否则后续任何排版调整都要在 4 个语言版本里手改 HTML。

---

## 3. 验证方法（不许凭感觉说"好看了"）

### 3.1 客观指标（每项都要有改前/改后两个数）

| 指标 | 工具 | 目标 |
| --- | --- | --- |
| 正文对比度 | 手算 / DevTools | ≥ 7:1（AAA） |
| 所有文本对比度 | axe DevTools / Lighthouse a11y | 0 个 < 4.5:1 |
| 正文字符/行 | 量测渲染宽度 ÷ 平均字宽 | 60–75ch |
| LCP（移动端 4G 模拟） | Lighthouse | < 2.5s |
| CLS | Lighthouse | < 0.1 |
| 首页 JS 传输量 | DevTools Network | < 300KB（当前含 three 1.3MB） |
| Lighthouse Accessibility | Lighthouse | ≥ 95 |

抽样页面固定这 6 个，改前先跑一遍存基线：
`/`、`/getting-started/`、`/contextdb/`、`/cli-comparison/`（表格最密）、`/blog/`、`/blog/2026-07-choose-agent-workflow/`

### 3.2 行为指标（GA4，改后 2 周对比）

- **平均互动时长**（首要，直接对应"划走"）
- 滚动深度 25/50/75/90%（GA4 需手动建 `scroll` 事件）
- 跳出率 / 单页会话占比
- 文档页 → `/getting-started/` 点击率
- 安装命令 Copy 按钮点击数（新增自定义事件）

### 3.3 主观校验

改后用手机在正常光照下读 `/contextdb/` 全文一遍。读不完就是没修好。

---

## 4. 排期（与 SEO 文档 W3 合并执行）

| 阶段 | 内容 | 工时 | 依赖 |
| --- | --- | --- | --- |
| **D1** | 跑 6 页 Lighthouse + 对比度基线，存 `temp/ux-baseline/` | 0.5 天 | — |
| **D2** | F1 token 层 + F2 正文提权 + F6 H2 降级 | 0.5 天 | D1 |
| **D3** | F3 行长 + F4 阴影分级 | 0.5 天 | F1 |
| **D4** | F5 mono 归位（含表头，影响面最大） | 0.5 天 | F1 |
| **D5** | F8 动画懒加载 + three 体积处理 | 1 天 | — |
| **D6** | F9 首屏改造（H1 + 安装命令 + partial 抽取） | 1 天 | F1 |
| **D7** | F7 docs/blog 设计系统合并 | 1.5 天 | F1–F6 落定后再做 |
| **D8** | 复跑 Lighthouse + 对比度，出改前后对照表 | 0.5 天 | 全部 |

合计约 **6 天**。

**如果只有半天：F2（正文提权，改 4 行）+ F3（行长限宽，加 6 行）+ F5 表头去 mono（改 5 行）。** 这三项加起来 15 行 CSS，直击 R1/R2/R5，是投入产出最高的组合。

---

## 5. 明确不做

- 不做整站视觉重设计。现有视觉语言（深色 + 青色 + 卡片）是有辨识度的资产，问题在排版参数不在风格。
- 不删首页动画。用户已定：懒加载。
- 不改 Material 主题为其他框架。i18n（252 页 4 语言）全靠 `mkdocs-static-i18n`，迁移成本远超收益。
- 不在 D7 之前动博客视觉。先让文档站的排版系统跑通并验证有效，再合并，避免两套同时坏掉。
