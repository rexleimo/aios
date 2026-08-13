---
title: AIOS — Local-First Agent Harness
description: Add project memory, adaptive workflow routing, multi-agent teams, and verification to Claude Code, Codex, Gemini CLI, OpenCode, Hermes, and Grok — without replacing your coding client.
home: true
schema_type: faq
faq:
  - q: What is AIOS?
    a: AIOS is a local-first agent workflow layer that adds cross-session project memory, adaptive routing, multi-agent collaboration, and verification to coding CLIs like Claude Code, Codex, Gemini CLI, OpenCode, Hermes, and Grok — without replacing them.
  - q: Does AIOS replace my coding client?
    a: No. AIOS works inside the clients you already use. It adds memory, routing, teams, and verification gates on top, so your existing commands and workflows stay the same.
  - q: How does AIOS keep project memory across sessions?
    a: AIOS stores project facts, memos, checkpoints, and context packs in a local ContextDB. Agents pull relevant context on demand instead of injecting full history into every prompt.
  - q: Is AIOS private?
    a: Yes. AIOS is local-first: memory, logs, and verification evidence stay on your machine. No prompt or code data leaves your environment.
  - q: How do I install AIOS?
    a: Run the one-line installer from the releases page, then aios init --all in your project root and aios doctor --native --verbose to verify the setup.
---

<!-- ============================================================
     Hero Section (v8 / ZIK3q) — title + portrait + full-width showcase
     ============================================================ -->

<div class="rex-hero">
  <div class="rex-hero__inner">
    <div class="rex-hero__content">
      <div class="rex-hero__badge">
        <svg class="rex-hero__badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>
        LOCAL-FIRST AGENT HARNESS · v{{ aios_version }}
      </div>

      <h1 class="rex-hero__title">Give your AI coding agent memory, a team &amp; verification.</h1>

      <p class="rex-hero__sub">
        AIOS is a local-first agent workflow layer that adds cross-session project memory,
        adaptive routing, multi-agent collaboration, and verification on top of
        codex, claude, gemini, opencode, hermes, and grok — without changing how you work.
      </p>

      <div class="rex-hero__cta">
        <a href="getting-started" class="md-button md-button--primary">Install in 30 seconds</a>
        <a href="https://github.com/rexleimo/aios" class="md-button">View on GitHub</a>
      </div>

      <div class="rex-hero__install" role="group" aria-label="One-line install">
        <code class="rex-hero__install-cmd" id="hero-install-cmd">curl -fsSL https://github.com/rexleimo/aios/releases/latest/download/aios-install.sh | bash</code>
        <button class="rex-hero__install-copy" type="button" data-copy-target="hero-install-cmd">Copy</button>
      </div>
      <script>
        (function () {
          var btn = document.querySelector('[data-copy-target="hero-install-cmd"]');
          if (!btn) return;
          btn.addEventListener('click', function () {
            var text = document.getElementById('hero-install-cmd').textContent.trim();
            navigator.clipboard.writeText(text).then(function () {
              var label = btn.textContent;
              btn.textContent = 'Copied ✓';
              setTimeout(function () { btn.textContent = label; }, 1600);
            });
          });
        })();
      </script>
    </div>

    <figure class="rex-hero__portrait">
      <img src="assets/home/hero-portrait.png" alt="AIOS agent workflow overview" width="1254" height="1254" loading="eager" fetchpriority="high" />
    </figure>
  </div>

  <figure class="rex-hero__showcase">
    <img src="assets/home/hero2.png" alt="AIOS local-first agent harness overview" width="1536" height="768" loading="lazy" />
  </figure>
</div>

<!-- ============================================================
     Logo Wall — client names
     ============================================================ -->

<div class="rex-logowall" aria-label="Works inside the clients you already use">
  <span class="rex-logowall__label">WORKS INSIDE THE CLIENTS YOU ALREADY USE</span>
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
     Team band — image left, text right
     ============================================================ -->

<div id="capabilities" class="rex-band rex-band--team">
  <figure class="rex-band__media">
    <img src="assets/home/team2.png" alt="AIOS multi-agent team collaboration" width="1536" height="1024" loading="lazy" />
  </figure>
  <div class="rex-band__content">
    <span class="rex-band__eyebrow">MULTI-AGENT TEAMS</span>
    <h2 class="rex-band__title">Parallel work with governance, not chaos</h2>
    <p class="rex-band__text">
      Decompose independent work items and dispatch them to multiple agents with live
      HUD tracking, evidence gates, and built-in governance. Coupled changes stay
      sequential; independent domains run in parallel.
    </p>
    <a class="rex-band__link" href="team-ops">Explore Agent Team <span aria-hidden="true">→</span></a>
  </div>
</div>

<!-- ============================================================
     Verification band — text left, image right
     ============================================================ -->

<div class="rex-band rex-band--verify">
  <div class="rex-band__content">
    <span class="rex-band__eyebrow">VERIFICATION / PRIVACY</span>
    <h2 class="rex-band__title">Evidence before claims, everywhere</h2>
    <p class="rex-band__text">
      Self-diagnostics, pre-edit safety gates, verification loops, and privacy redaction
      keep every change verifiable — before anything ships. Sensitive data never leaves
      your machine.
    </p>
    <a class="rex-band__link" href="troubleshooting">See Verification <span aria-hidden="true">→</span></a>
  </div>
  <figure class="rex-band__media">
    <img src="assets/home/doctor2.png" alt="AIOS verification and diagnostics" width="1536" height="1024" loading="lazy" />
  </figure>
</div>

<!-- ============================================================
     Run layer 2×2
     ============================================================ -->

<div id="demo" class="rex-run">
  <div class="rex-run__header">
    <span class="rex-run__eyebrow">RUN LAYER</span>
    <h2 class="rex-run__title">Four systems, underneath your CLI</h2>
    <p class="rex-run__sub">Memory, routing, collaboration, and safety — pull-based and always on.</p>
  </div>
  <div class="rex-run__grid">
    <article class="rex-run__card">
      <h3 class="rex-run__card-title">ContextDB</h3>
      <p class="rex-run__card-text">On-demand project memory — memo, checkpoints, and context packs recalled when relevant, never injected blindly.</p>
      <code class="rex-run__card-cmd">aios init</code>
    </article>
    <article class="rex-run__card">
      <h3 class="rex-run__card-title">Adaptive Workflow</h3>
      <p class="rex-run__card-text">Route each task by risk: noop, direct, guarded, or planned — with the right evidence gates at every stage.</p>
      <code class="rex-run__card-cmd">aios work</code>
    </article>
    <article class="rex-run__card">
      <h3 class="rex-run__card-title">Agent Team</h3>
      <p class="rex-run__card-text">Parallel independent work with live HUD, governance, and evidence collection — without a global skill chain.</p>
      <code class="rex-run__card-cmd">aios team</code>
    </article>
    <article class="rex-run__card">
      <h3 class="rex-run__card-title">Verification</h3>
      <p class="rex-run__card-text">Pre-edit safety gates, verification loops, and privacy redaction keep every change verifiable before it ships.</p>
      <code class="rex-run__card-cmd">aios verify</code>
    </article>
  </div>
</div>

<!-- ============================================================
     Full-width install block
     ============================================================ -->

<div class="rex-install">
  <div class="rex-install__inner">
    <h2 class="rex-install__title">Install in 30 seconds</h2>
    <p class="rex-install__text">Initializes client guidance, project markers, and runtime checks in your project root.</p>
    <div class="rex-install__cmds" role="group" aria-label="Install commands">
      <code class="rex-install__cmd">aios init --all</code>
      <code class="rex-install__cmd">aios doctor --native --verbose</code>
    </div>
    <a href="getting-started" class="md-button md-button--primary rex-install__cta">Get Started Free <span aria-hidden="true">→</span></a>
  </div>
</div>

<!-- ============================================================
     Blog list (3 posts)
     ============================================================ -->

<div class="rex-bloglist">
  <div class="rex-bloglist__header">
    <span class="rex-bloglist__eyebrow">FROM THE BLOG</span>
    <h2 class="rex-bloglist__title">Latest workflow guides</h2>
    <a class="rex-bloglist__more" href="https://cli.rexai.top/blog/">All posts <span aria-hidden="true">→</span></a>
  </div>
  <div class="rex-bloglist__grid">
    <article class="rex-bloglist__card">
      <span class="rex-bloglist__tag">Workflow</span>
      <h3 class="rex-bloglist__card-title"><a href="/blog/2026-07-v400-adaptive-workflow-policy/">4.0.0 Adaptive Workflow Policy</a></h3>
      <p class="rex-bloglist__card-text">Classify work before choosing process controls — noop, direct, guarded, planned.</p>
    </article>
    <article class="rex-bloglist__card">
      <span class="rex-bloglist__tag">Teams</span>
      <h3 class="rex-bloglist__card-title"><a href="/blog/2026-08-parallel-coding-agents/">Parallel Coding Agents</a></h3>
      <p class="rex-bloglist__card-text">When independent work items can run in parallel — and when they must not.</p>
    </article>
    <article class="rex-bloglist__card">
      <span class="rex-bloglist__tag">Reliability</span>
      <h3 class="rex-bloglist__card-title"><a href="/blog/2026-07-raw-cli-to-reliable-workflow/">From Raw CLI to Reliable Workflow</a></h3>
      <p class="rex-bloglist__card-text">Turn a bare coding CLI into a resumable, evidence-driven workflow.</p>
    </article>
  </div>
</div>

<!-- ============================================================
     Closing CTA
     ============================================================ -->

<div class="rex-cta">
  <div class="rex-cta__inner">
    <h2 class="rex-cta__title">Ready to level up?</h2>
    <p class="rex-cta__text">Start with a small, verifiable workflow and add collaboration when the task needs it.</p>
    <div class="rex-cta__buttons">
      <a href="getting-started" class="md-button md-button--primary">Get Started Free</a>
      <a href="contextdb" class="md-button">Read Docs</a>
    </div>
  </div>
</div>
