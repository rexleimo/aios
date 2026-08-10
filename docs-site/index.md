---
title: AIOS — Local-First Agent Harness
description: Add project memory, adaptive workflow routing, multi-agent teams, and verification to Claude Code, Codex, Gemini CLI, OpenCode, Hermes, and Grok — without replacing your coding client.
home: true
---

<!-- ============================================================
     Hero Section — 粒子流场 + 抽象环形装饰
     设计稿: berPn > Hero (hDFaw)
     ============================================================ -->

<div class="hero-section">
  <div class="home-section__stage">
  <canvas id="hero-canvas" class="hero-section__canvas"></canvas>

  <div class="hero-layout">
    <div class="hero-content">
      <div class="hero-badge">
        <svg class="hero-badge__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>
        LOCAL-FIRST AGENT HARNESS
      </div>

      <div class="hero-headline">
        <h1 class="hero-headline__line hero-headline__line--muted">Same commands.</h1>
        <div class="hero-headline__line hero-headline__line--primary">Now with a brain,</div>
        <div class="hero-headline__line hero-headline__line--accent">a team &amp; self-diagnostics.</div>
      </div>

      <p class="hero-subheadline">
        AIOS is a local-first agent harness that adds cross-session memory,
        adaptive routing, multi-agent collaboration, and verification on top of
        codex, claude, gemini, opencode, hermes, and grok — without changing how you work.
      </p>

      <div class="hero-cta-row">
        <a href="getting-started" class="md-button md-button--primary">Install in 30 seconds</a>
        <a href="https://github.com/rexleimo/aios" class="md-button">View on GitHub</a>
      </div>
      <p class="hero-secondary-links">
        <a href="use-cases">Use cases</a>
        ·
        <a href="workflow-policy">Workflow policy</a>
        ·
        <a href="https://cli.rexai.top/blog/">Blog</a>
        ·
        <a href="architecture">Architecture</a>
      </p>

      <div class="hero-works">
        <span class="hero-works__label">WORKS INSIDE THE CLIENTS YOU ALREADY USE</span>
        <div class="hero-works__chips">
          <span class="hero-client-chip"><span class="hero-client-chip__dot"></span>codex</span>
          <span class="hero-client-chip"><span class="hero-client-chip__dot"></span>claude</span>
          <span class="hero-client-chip"><span class="hero-client-chip__dot"></span>gemini</span>
          <span class="hero-client-chip"><span class="hero-client-chip__dot"></span>opencode</span>
          <span class="hero-client-chip"><span class="hero-client-chip__dot"></span>hermes</span>
          <span class="hero-client-chip" title="Grok Build"><span class="hero-client-chip__dot"></span>grok</span>
        </div>
      </div>
    </div>

    <div class="hero-visual">
      <div class="hero-abstract">
        <div class="hero-abstract__glow"></div>
        <div class="hero-abstract__ring hero-abstract__ring--outer"></div>
        <div class="hero-abstract__ring hero-abstract__ring--mid"></div>
        <div class="hero-abstract__ring hero-abstract__ring--inner"></div>
        <div class="hero-abstract__diamond"></div>
        <div class="hero-abstract__diag-line hero-abstract__diag-line--1"></div>
        <div class="hero-abstract__diag-line hero-abstract__diag-line--2"></div>
        <span class="hero-abstract__number">01</span>
        <div class="hero-abstract__node-chip">
          <span class="hero-abstract__live-dot"></span>
          <span class="hero-abstract__chip-text">agent · online</span>
        </div>
      </div>
    </div>
  </div>

  <div class="zone-label">
    <svg class="zone-label__icon" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
    LIVE OVERVIEW · ambient activity backdrop
  </div>
  </div>
</div>

<!-- ============================================================
     Capabilities Section — 交互式节点网格 + 四大能力卡片
     设计稿: berPn > Capabilities Section (bmpwt)
     ============================================================ -->

<div id="capabilities" class="capabilities-section">
  <div class="home-section__stage">
  <canvas id="grid-canvas" class="capabilities-section__canvas"></canvas>

  <div class="zone-label">
    <svg class="zone-label__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
    responsive node grid
  </div>

  <div class="capabilities-content">
    <div class="capabilities-header">
      <span class="capabilities-eyebrow">CORE CAPABILITIES</span>
      <h2 class="capabilities-title">Four systems, working<br>underneath your CLI</h2>
      <p class="capabilities-sub">
        Four systems working underneath codex, claude, gemini, opencode, hermes, and grok —
        memory, collaboration, routing, and safety.
      </p>
    </div>

    <div class="capabilities-cards">
      <div class="capability-card capability-card--accent">
        <span class="capability-card__index">01</span>
        <div class="capability-card__icon-badge">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5"/><path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/></svg>
        </div>
        <h3 class="capability-card__title">Cross-Session Memory</h3>
        <p class="capability-card__desc">Pull-based project memory with events, checkpoints, and context packs recalled when relevant.</p>
        <span class="capability-card__cmd">aios init</span>
      </div>

      <div class="capability-card capability-card--violet">
        <span class="capability-card__index">02</span>
        <div class="capability-card__icon-badge">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="9.5" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        </div>
        <h3 class="capability-card__title">Multi-Agent Teams</h3>
        <p class="capability-card__desc">Parallel agent collaboration with live HUD tracking and built-in governance.</p>
        <span class="capability-card__cmd">/team &lt;task&gt;</span>
      </div>

      <div class="capability-card capability-card--blue">
        <span class="capability-card__index">03</span>
        <div class="capability-card__icon-badge">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="m15 15 6 6"/><path d="M4 4l5 5"/></svg>
        </div>
        <h3 class="capability-card__title">Model Router</h3>
        <p class="capability-card__desc">Intelligent multi-model dispatch by capability, cost, and measured success rate.</p>
        <span class="capability-card__cmd">route --task</span>
      </div>

      <div class="capability-card capability-card--success">
        <span class="capability-card__index">04</span>
        <div class="capability-card__icon-badge">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 13c0 5-3.5 7.5-7.7 8.8a1 1 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.5a1.3 1.3 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>
        </div>
        <h3 class="capability-card__title">Verify &amp; Safeguard</h3>
        <p class="capability-card__desc">Self-diagnostics, verification loops, and privacy redaction before anything ships.</p>
        <span class="capability-card__cmd">aios verify</span>
      </div>
    </div>
  </div>
  </div>
</div>

<!-- ============================================================
     Demo Section — 终端演示 + HUD 雷达
     设计稿: berPn > Demo Section (M5ju4)
     ============================================================ -->

<div id="demo" class="demo-section">
  <div class="home-section__stage">
  <span class="demo-section__decor-number">02</span>

  <div class="demo-header">
    <span class="demo-eyebrow">LIVE DEMO</span>
    <h2 class="demo-title">Watch it work in real-time</h2>
      <p class="demo-sub">
      Same shell, same client — Harness can recall project context, route work,
      and leave verification evidence for the next step.
    </p>
  </div>

  <div class="demo-row">
    <div class="hero-terminal">
      <div class="hero-terminal__bar">
        <div class="hero-terminal__traffic">
          <span></span><span></span><span></span>
        </div>
        <span class="hero-terminal__title">aios — zsh — 92×24</span>
      </div>
      <div class="hero-terminal__body">
        <div class="hero-terminal__line">
          <span class="hero-terminal__prompt">$</span>
          <span class="hero-terminal__text">aios setup --client claude</span>
        </div>
        <div class="hero-terminal__line">
          <span class="hero-terminal__success">✓</span>
          <span class="hero-terminal__text">context pack loaded · 3 checkpoints, 12 events</span>
        </div>
        <div class="hero-terminal__line">
          <span class="hero-terminal__prompt">$</span>
          <span class="hero-terminal__text">/team "refactor the auth module"</span>
        </div>
        <div class="hero-terminal__line">
          <span class="hero-terminal__arrow">→</span>
          <span class="hero-terminal__text">spawning 3 agents · router → opus · sonnet · haiku</span>
        </div>
        <div class="hero-terminal__line">
          <span class="hero-terminal__dot">●</span>
          <span class="hero-terminal__text">agent-1 planning&nbsp;&nbsp;agent-2 editing&nbsp;&nbsp;agent-3 verifying</span>
        </div>
        <div class="hero-terminal__line">
          <span class="hero-terminal__success">✓</span>
          <span class="hero-terminal__text">verification passed · 0 regressions · 2 secrets redacted</span>
        </div>
        <div class="hero-terminal__line">
          <span class="hero-terminal__prompt">$</span>
          <span class="hero-terminal__text">aios memo add "auth refactor shipped"</span>
        </div>
        <div class="hero-terminal__line">
          <span class="hero-terminal__success">✓</span>
          <span class="hero-terminal__text">memo saved to cross-session project memory</span>
        </div>
        <div class="hero-terminal__line">
          <span class="hero-terminal__prompt">$</span>
          <span class="hero-terminal__cursor"></span>
        </div>
      </div>
    </div>

    <div class="hud-panel">
      <canvas id="hud-canvas" class="hud-panel__canvas"></canvas>
      <div class="hud-panel__content">
        <div>
          <div class="hud-panel__title-row">
            <div class="hud-panel__title">SYSTEM TELEMETRY</div>
            <svg class="hud-panel__status" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-label="Telemetry activity">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
            </svg>
          </div>
          <div class="hud-panel__sub">live agent throughput</div>
        </div>
        <div class="hud-bars">
          <div class="hud-bar"><div class="hud-bar__fill" style="height:70px"></div></div>
          <div class="hud-bar"><div class="hud-bar__fill" style="height:120px"></div></div>
          <div class="hud-bar"><div class="hud-bar__fill" style="height:95px"></div></div>
          <div class="hud-bar"><div class="hud-bar__fill" style="height:150px"></div></div>
          <div class="hud-bar"><div class="hud-bar__fill" style="height:110px"></div></div>
          <div class="hud-bar"><div class="hud-bar__fill" style="height:140px"></div></div>
          <div class="hud-bar"><div class="hud-bar__fill" style="height:80px"></div></div>
          <div class="hud-bar"><div class="hud-bar__fill" style="height:130px"></div></div>
        </div>
        <div class="zone-label zone-label--inline">
          <svg class="zone-label__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>
          activity overview + throughput
        </div>
      </div>
    </div>
  </div>
  </div>
</div>

<div class="home-resource-links">
  <h2>Read the workflow in context</h2>
  <p>Use the docs for canonical commands and the blog for release context, decisions, and reproducible cases.</p>
  <p>
    <a href="/blog/rl-training-system/">AIOS RL Training System</a> ·
    <a href="/blog/contextdb-fts-bm25-search/">ContextDB Search Upgrade</a> ·
    <a href="/blog/windows-cli-startup-stability/">Windows CLI Startup Stability</a> ·
    <a href="/blog/orchestrate-live/">Orchestrate Live</a>
  </p>
</div>

<!-- ============================================================
     Closing CTA — 双栏布局 + 浮动卡片装饰
     设计稿: berPn > Closing CTA (dgsXd)
     ============================================================ -->

<div class="cta-section">
  <div class="home-section__stage">
  <div class="cta-section__left">
    <span class="cta-section__decor-number">01</span>
    <div class="cta-content">
      <h2 class="cta-heading">Ready to level up?</h2>
      <p class="cta-sub">Start with a small, verifiable workflow and add collaboration when the task needs it.</p>
      <div class="cta-buttons">
        <a href="getting-started" class="md-button md-button--primary">Get Started Free</a>
        <a href="contextdb" class="md-button">Read Docs</a>
      </div>
    </div>
  </div>
  <!-- Right Section — WebGL Nebula + 粒子装饰 + 浮动卡片 -->
  <div class="cta-section__right">
    <canvas id="cta-canvas" class="cta-section__canvas"></canvas>
    <div class="cta-float-card cta-float-card--1">
      <span class="cta-float-card__row">
        <svg class="cta-float-card__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>
        <span class="cta-float-card__label">ContextDB</span>
      </span>
      <span class="cta-float-card__row">
        <svg class="cta-float-card__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>
        <span class="cta-float-card__label">Workflow Policy</span>
      </span>
    </div>
    <div class="cta-float-card cta-float-card--2">
      <span class="cta-float-card__row">
        <svg class="cta-float-card__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4"/><path d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9c1.97 0 3.78.63 5.26 1.69"/></svg>
        <span class="cta-float-card__label">Verified</span>
      </span>
      <span class="cta-float-card__row">
        <svg class="cta-float-card__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4"/><path d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9c1.97 0 3.78.63 5.26 1.69"/></svg>
        <span class="cta-float-card__label">Verified</span>
      </span>
    </div>
    <span class="cta-section__text-decor">START</span>
    <div class="cta-code-snippet">$ harness start</div>
  </div>
  </div>
</div>
