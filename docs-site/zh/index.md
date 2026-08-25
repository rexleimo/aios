---
title: AIOS — 一句话，搞定任何复杂任务
description: "AIOS 让你的 AI 编码助手真正完成任务——本地优先的 Graph Engine 把记忆、验证、多 Agent 协作编排成可验证的 Agent 图，一句话搞定。支持 Claude Code、Codex、Gemini CLI、OpenCode、Hermes、Grok。"
home: true
schema_type: faq
faq:
  - q: AIOS 是什么？
    a: AIOS 是一个让你的 AI 编码助手真正完成复杂任务的工具。你只需说一句话描述需求，AIOS 自动补上记忆、验证和多 Agent 协作。支持 Claude Code、Codex、Gemini CLI、OpenCode、Hermes、Grok。
  - q: AIOS 会替换我的编码客户端吗？
    a: 不会。你继续用 Claude Code、Codex、Gemini CLI、OpenCode、Hermes 或 Grok，完全不变。AIOS 在底下补上它们缺少的——跨会话记忆、自动任务路由、交付前验证。
  - q: AIOS 怎么跨会话记住上下文？
    a: AIOS 把你的项目决策、约束和进度存在本地的 ContextDB 里。下次开会话，Agent 自动拉取相关内容，不用从零开始。
  - q: 我的代码安全吗？
    a: 安全。所有东西——记忆、日志、验证证据——都在你的机器上。代码和提示数据不会发到任何外部服务器。
  - q: 怎么安装 AIOS？
    a: 一行命令：curl -fsSL https://github.com/rexleimo/aios/releases/latest/download/aios-install.sh | bash，然后在项目里执行 aios init --all。30 秒搞定。
---

<!-- ============================================================
     Hero Section (v8 / ZIK3q) — 标题 + 人像图 + 通栏展示图
     ============================================================ -->

<div class="rex-hero">
  <div class="rex-hero__inner">
    <div class="rex-hero__content">
      <div class="rex-hero__badge">
        <svg class="rex-hero__badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>
        一句话，搞定任何任务 · v{{ aios_version }}
      </div>

      <h1 class="rex-hero__title">一句话，搞定任何复杂任务。</h1>

      <p class="rex-hero__sub">
        告诉你的 AI 编码助手你要什么——就一句话。AIOS 是一个本地优先的 Graph Engine，它把记忆、验证和多 Agent 协作编排成可验证的 Agent 图，让它真正完成任务。支持 Claude Code、Codex、Gemini、OpenCode、Hermes、Grok——你不需要改变任何工作方式。
      </p>

      <div class="rex-hero__cta">
        <a href="getting-started" class="md-button md-button--primary">30 秒安装</a>
        <a href="https://github.com/rexleimo/aios" class="md-button">查看 GitHub</a>
      </div>

      <div class="rex-hero__install" role="group" aria-label="一行安装">
        <code class="rex-hero__install-cmd" id="hero-install-cmd">curl -fsSL https://github.com/rexleimo/aios/releases/latest/download/aios-install.sh | bash</code>
        <button class="rex-hero__install-copy" type="button" data-copy-target="hero-install-cmd">复制</button>
      </div>
      <script>
        (function () {
          var btn = document.querySelector('[data-copy-target="hero-install-cmd"]');
          if (!btn) return;
          btn.addEventListener('click', function () {
            var text = document.getElementById('hero-install-cmd').textContent.trim();
            navigator.clipboard.writeText(text).then(function () {
              var label = btn.textContent;
              btn.textContent = '已复制 ✓';
              setTimeout(function () { btn.textContent = label; }, 1600);
            });
          });
        })();
      </script>
    </div>

    <figure class="rex-hero__portrait">
      <img src="../assets/home/hero-portrait.png" alt="AIOS Agent 工作流概览" width="1254" height="1254" loading="eager" fetchpriority="high" />
    </figure>
  </div>

  <figure class="rex-hero__showcase">
    <img src="../assets/home/hero2.png" alt="AIOS 本地优先 Agent 工作流总览" width="1536" height="768" loading="lazy" />
  </figure>
</div>

<!-- ============================================================
     Logo 墙 — 客户端名
     ============================================================ -->

<div class="rex-logowall" aria-label="兼容你已使用的客户端">
  <span class="rex-logowall__label">兼容你已使用的客户端</span>
  <div class="rex-logowall__chips">
    <span class="rex-logowall__chip">codex</span>
    <span class="rex-logowall__chip">claude</span>
    <span class="rex-logowall__chip">gemini</span>
    <span class="rex-logowall__chip">opencode</span>
    <span class="rex-logowall__chip">hermes</span>
    <span class="rex-logowall__chip">grok</span>
  </div>
</div>

<!-- ============================================================
     Team 特性带 — 图左文右
     ============================================================ -->

<div id="capabilities" class="rex-band rex-band--team">
  <figure class="rex-band__media">
    <img src="../assets/home/team2.png" alt="AIOS 多 Agent 团队协作" width="1536" height="1024" loading="lazy" />
  </figure>
  <div class="rex-band__content">
    <span class="rex-band__eyebrow">多 AGENT 团队</span>
    <h2 class="rex-band__title">说一句话，多个 Agent 并行搞定</h2>
    <p class="rex-band__text">
      你只需说一句话，AIOS 自动把工作拆分给多个 Agent 并行执行。
      独立任务并行跑，耦合改动保持顺序——你只管等结果。
    </p>
    <a class="rex-band__link" href="team-ops">看看怎么实现的 <span aria-hidden="true">→</span></a>
  </div>
</div>

<!-- ============================================================
     Verification 特性带 — 文左图右
     ============================================================ -->

<div class="rex-band rex-band--verify">
  <div class="rex-band__content">
    <span class="rex-band__eyebrow">验证 / 隐私</span>
    <h2 class="rex-band__title">先自查，再给你看</h2>
    <p class="rex-band__text">
      AIOS 对每次改动运行自诊断、安全检查和验证循环——
      你看到的是能用的结果，不是需要修的半成品。你的代码和数据永不离开本机。
    </p>
    <a class="rex-band__link" href="troubleshooting">了解验证机制 <span aria-hidden="true">→</span></a>
  </div>
  <figure class="rex-band__media">
    <img src="../assets/home/doctor2.png" alt="AIOS 验证与诊断" width="1536" height="1024" loading="lazy" />
  </figure>
</div>

<!-- ============================================================
     Run 层 2×2
     ============================================================ -->

<div id="demo" class="rex-run">
  <div class="rex-run__header">
    <span class="rex-run__eyebrow">工作原理</span>
    <h2 class="rex-run__title">一句话，触发四个系统</h2>
    <p class="rex-run__sub">记忆、路由、协作与安全——在幕后默默为你工作。</p>
  </div>
  <div class="rex-run__grid">
    <article class="rex-run__card">
      <h3 class="rex-run__card-title">记住一切</h3>
      <p class="rex-run__card-text">你的项目决策、约束和进度保存在本地。下次会话，Agent 从上次停下的地方继续——不用重新解释。</p>
      <code class="rex-run__card-cmd">aios init</code>
    </article>
    <article class="rex-run__card">
      <h3 class="rex-run__card-title">选对方法</h3>
      <p class="rex-run__card-text">AIOS 自动为你的任务选最简单的路径——快速回答、谨慎编辑、还是完整计划——你不用想流程。</p>
      <code class="rex-run__card-cmd">aios work</code>
    </article>
    <article class="rex-run__card">
      <h3 class="rex-run__card-title">自动拆分工作</h3>
      <p class="rex-run__card-text">任务有独立部分时，AIOS 用多个 Agent 并行跑——你只需说一次你要什么。</p>
      <code class="rex-run__card-cmd">aios team</code>
    </article>
    <article class="rex-run__card">
      <h3 class="rex-run__card-title">交付前检查</h3>
      <p class="rex-run__card-text">每次改动都运行安全检查和验证循环。你拿到的是能用的结果，不是要返工的半成品。</p>
      <code class="rex-run__card-cmd">aios verify</code>
    </article>
  </div>
</div>

<!-- ============================================================
     全宽安装块
     ============================================================ -->

<div class="rex-install">
  <div class="rex-install__inner">
    <h2 class="rex-install__title">30 秒，开始你的第一个一句话任务</h2>
    <p class="rex-install__text">安装、初始化项目，然后直接告诉 Agent 你要什么。</p>
    <div class="rex-install__cmds" role="group" aria-label="安装命令">
      <code class="rex-install__cmd">aios init --all</code>
      <code class="rex-install__cmd">aios doctor --native --verbose</code>
    </div>
    <a href="getting-started" class="md-button md-button--primary rex-install__cta">免费开始 <span aria-hidden="true">→</span></a>
  </div>
</div>

<!-- ============================================================
     博客列表（3 条）
     ============================================================ -->

<div class="rex-bloglist">
  <div class="rex-bloglist__header">
    <span class="rex-bloglist__eyebrow">来自博客</span>
    <h2 class="rex-bloglist__title">最新工作流指南</h2>
    <a class="rex-bloglist__more" href="https://cli.rexai.top/blog/">全部文章 <span aria-hidden="true">→</span></a>
  </div>
  <div class="rex-bloglist__grid">
    <article class="rex-bloglist__card">
      <span class="rex-bloglist__tag">Graph Engine</span>
      <h3 class="rex-bloglist__card-title"><a href="/blog/zh/2026-08-10-aios-loop-graph-engineering/">Graph Engine 本地实现</a></h3>
      <p class="rex-bloglist__card-text">把 loop 工具箱与图节点组合成可验证的 Agent 图，数据始终留在本机。</p>
    </article>
    <article class="rex-bloglist__card">
      <span class="rex-bloglist__tag">团队</span>
      <h3 class="rex-bloglist__card-title"><a href="/blog/zh/2026-08-parallel-coding-agents/">并行编码 Agent</a></h3>
      <p class="rex-bloglist__card-text">独立工作项何时可以并行——以及何时绝不能。</p>
    </article>
    <article class="rex-bloglist__card">
      <span class="rex-bloglist__tag">工作流</span>
      <h3 class="rex-bloglist__card-title"><a href="/blog/zh/2026-07-v400-adaptive-workflow-policy/">4.0.0 自适应工作流策略</a></h3>
      <p class="rex-bloglist__card-text">先分类工作，再选择流程控制——noop、direct、guarded、planned。</p>
    </article>
  </div>
</div>

<!-- ============================================================
     收尾 CTA
     ============================================================ -->

<div class="rex-cta">
  <div class="rex-cta__inner">
    <h2 class="rex-cta__title">不想再反复解释了？开始吧。</h2>
    <p class="rex-cta__text">一句话就够了。装好 AIOS，让 Agent 搞定剩下的事。</p>
    <div class="rex-cta__buttons">
      <a href="getting-started" class="md-button md-button--primary">免费开始</a>
      <a href="contextdb" class="md-button">阅读文档</a>
    </div>
  </div>
</div>
