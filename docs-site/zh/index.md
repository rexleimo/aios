---
title: AIOS — 本地优先的 AI 编码 Agent 工作流
description: 为 Claude Code、Codex、Gemini CLI、OpenCode、Hermes、Grok 增加项目记忆、自适应路由、多 Agent 协作与验证，不替换你现有的编码客户端。
home: true
schema_type: faq
faq:
  - q: AIOS 是什么？
    a: AIOS 是一个本地优先的 Agent 工作流层，为 Claude Code、Codex、Gemini CLI、OpenCode、Hermes、Grok 等编码 CLI 增加跨会话项目记忆、自适应路由、多 Agent 协作与验证门禁，不替换它们。
  - q: AIOS 会替换我的编码客户端吗？
    a: 不会。AIOS 运行在你已使用的客户端之内，在其上增加记忆、路由、团队与验证门禁，你现有的命令与工作流保持不变。
  - q: AIOS 如何跨会话保存项目记忆？
    a: AIOS 把项目事实、memo、检查点与上下文包存入本地 ContextDB，Agent 按需读取相关内容，而不是把完整历史注入每个提示。
  - q: AIOS 隐私吗？
    a: 是。AIOS 本地优先：记忆、日志与验证证据都留在你的机器上，提示与代码数据不会离开你的环境。
  - q: 如何安装 AIOS？
    a: 从 releases 页面运行一行安装脚本，然后在项目根目录执行 aios init --all，再用 aios doctor --native --verbose 验证安装。
---

<!-- ============================================================
     Hero Section (v8 / ZIK3q) — 标题 + 人像图 + 通栏展示图
     ============================================================ -->

<div class="rex-hero">
  <div class="rex-hero__inner">
    <div class="rex-hero__content">
      <div class="rex-hero__badge">
        <svg class="rex-hero__badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>
        本地优先 Agent 工作流 · v{{ aios_version }}
      </div>

      <h1 class="rex-hero__title">给你的 AI 编码 Agent 记忆、团队与验证。</h1>

      <p class="rex-hero__sub">
        AIOS 是一个本地优先的 Agent 工作流层。它保留你已经在使用的 codex、claude、gemini、opencode、hermes 或 grok（Grok Build），
        再补上跨会话项目记忆、自适应路由、多 Agent 协作与验证门禁——不改变你的工作方式。
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
    <h2 class="rex-band__title">有治理的并行协作，而不是混乱</h2>
    <p class="rex-band__text">
      把独立工作项拆分并派发给多个 Agent，带实时 HUD 追踪、证据门禁和内置治理。
      耦合改动保持串行；独立领域并行运行。
    </p>
    <a class="rex-band__link" href="team-ops">了解 Agent Team <span aria-hidden="true">→</span></a>
  </div>
</div>

<!-- ============================================================
     Verification 特性带 — 文左图右
     ============================================================ -->

<div class="rex-band rex-band--verify">
  <div class="rex-band__content">
    <span class="rex-band__eyebrow">验证 / 隐私</span>
    <h2 class="rex-band__title">先有证据，再谈完成</h2>
    <p class="rex-band__text">
      自诊断、编辑前安全检查、验证循环与隐私脱敏，让每次改动在交付前都可验证。
      敏感数据永不离开你的机器。
    </p>
    <a class="rex-band__link" href="troubleshooting">了解验证 <span aria-hidden="true">→</span></a>
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
    <span class="rex-run__eyebrow">RUN 层</span>
    <h2 class="rex-run__title">四个系统，运行在你的 CLI 之下</h2>
    <p class="rex-run__sub">记忆、路由、协作与安全——按需读取，始终在线。</p>
  </div>
  <div class="rex-run__grid">
    <article class="rex-run__card">
      <h3 class="rex-run__card-title">ContextDB</h3>
      <p class="rex-run__card-text">按需读取的项目记忆——memo、检查点与上下文包在相关时召回，绝不盲目注入。</p>
      <code class="rex-run__card-cmd">aios init</code>
    </article>
    <article class="rex-run__card">
      <h3 class="rex-run__card-title">自适应工作流</h3>
      <p class="rex-run__card-text">按风险路由每个任务：noop、direct、guarded 或 planned——每阶段配对的证据门禁。</p>
      <code class="rex-run__card-cmd">aios work</code>
    </article>
    <article class="rex-run__card">
      <h3 class="rex-run__card-title">Agent Team</h3>
      <p class="rex-run__card-text">带实时 HUD、治理与证据收集的并行独立工作——不注入全局技能链。</p>
      <code class="rex-run__card-cmd">aios team</code>
    </article>
    <article class="rex-run__card">
      <h3 class="rex-run__card-title">验证</h3>
      <p class="rex-run__card-text">编辑前安全检查、验证循环与隐私脱敏，让每次改动在交付前都可验证。</p>
      <code class="rex-run__card-cmd">aios verify</code>
    </article>
  </div>
</div>

<!-- ============================================================
     全宽安装块
     ============================================================ -->

<div class="rex-install">
  <div class="rex-install__inner">
    <h2 class="rex-install__title">30 秒安装</h2>
    <p class="rex-install__text">在项目根目录初始化客户端指引、项目标记与运行时检查。</p>
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
      <span class="rex-bloglist__tag">工作流</span>
      <h3 class="rex-bloglist__card-title"><a href="/blog/zh/2026-07-v400-adaptive-workflow-policy/">4.0.0 自适应工作流策略</a></h3>
      <p class="rex-bloglist__card-text">先分类工作，再选择流程控制——noop、direct、guarded、planned。</p>
    </article>
    <article class="rex-bloglist__card">
      <span class="rex-bloglist__tag">团队</span>
      <h3 class="rex-bloglist__card-title"><a href="/blog/zh/2026-08-parallel-coding-agents/">并行编码 Agent</a></h3>
      <p class="rex-bloglist__card-text">独立工作项何时可以并行——以及何时绝不能。</p>
    </article>
    <article class="rex-bloglist__card">
      <span class="rex-bloglist__tag">可靠性</span>
      <h3 class="rex-bloglist__card-title"><a href="/blog/zh/2026-07-raw-cli-to-reliable-workflow/">从裸 CLI 到可靠工作流</a></h3>
      <p class="rex-bloglist__card-text">把裸编码 CLI 变成可恢复、证据驱动的工作流。</p>
    </article>
  </div>
</div>

<!-- ============================================================
     收尾 CTA
     ============================================================ -->

<div class="rex-cta">
  <div class="rex-cta__inner">
    <h2 class="rex-cta__title">准备好升级了吗？</h2>
    <p class="rex-cta__text">从一个小而可验证的工作流开始，任务需要时再加入协作。</p>
    <div class="rex-cta__buttons">
      <a href="getting-started" class="md-button md-button--primary">免费开始</a>
      <a href="contextdb" class="md-button">阅读文档</a>
    </div>
  </div>
</div>
