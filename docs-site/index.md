---
title: AIOS — One Sentence. Any Complex Task. Done.
description: "One sentence. Any complex task. Done. AIOS is a local-first Graph Engine for coding agents — it composes memory, verification, and multi-agent collaboration into a verifiable graph so your agent actually finishes the job. Works with Claude Code, Codex, Gemini CLI, OpenCode, Hermes, and Grok."
home: true
schema_type: faq
faq:
  - q: What is AIOS?
    a: "AIOS is a one-command layer that makes your AI coding agent (Claude Code, Codex, Gemini CLI, OpenCode, Hermes, or Grok) actually finish complex tasks. You describe what you need in one sentence; AIOS adds the memory, verification, and coordination the agent needs to get it right."
  - q: Does AIOS replace my coding client?
    a: "No. You keep using Claude Code, Codex, Gemini CLI, OpenCode, Hermes, or Grok exactly as before. AIOS sits underneath and adds what they are missing — persistent memory across sessions, automatic task routing, and verification before delivery."
  - q: How does AIOS remember context across sessions?
    a: "AIOS stores your project decisions, constraints, and progress in a local memory store called ContextDB. When you start a new session, the agent pulls only the relevant context instead of starting from scratch."
  - q: Is my code private with AIOS?
    a: "Yes. Everything — memory, logs, verification evidence — stays on your machine. No code or prompt data is sent to any external server."
  - q: How do I install AIOS?
    a: "One command: curl -fsSL https://github.com/rexleimo/aios/releases/latest/download/aios-install.sh | bash, then aios init --all in your project. Takes under 30 seconds."
---

<!-- ============================================================
     Hero Section (v8 / ZIK3q) — title + portrait + full-width showcase
     ============================================================ -->

<div class="rex-hero">
  <div class="rex-hero__inner">
    <div class="rex-hero__content">
      <div class="rex-hero__badge">
        <svg class="rex-hero__badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>
        ONE SENTENCE. ANY TASK. DONE. · v{{ aios_version }}
      </div>

      <h1 class="rex-hero__title">One sentence. Any complex task. Done.</h1>

      <p class="rex-hero__sub">
        Tell your AI coding agent what you need — just one sentence. AIOS is a local-first Graph Engine that composes the memory, verification, and multi-agent coordination it needs into a verifiable graph, so it actually finishes the job. Works inside Claude Code, Codex, Gemini, OpenCode, Hermes, and Grok — you don't change how you work.
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
    <h2 class="rex-band__title">Say it once. Multiple agents handle it in parallel.</h2>
    <p class="rex-band__text">
      One sentence from you, and AIOS splits the work across multiple agents
      automatically. Independent tasks run in parallel, coupled changes stay in
      order — you just wait for the result.
    </p>
    <a class="rex-band__link" href="team-ops">See how it works <span aria-hidden="true">→</span></a>
  </div>
</div>

<!-- ============================================================
     Verification band — text left, image right
     ============================================================ -->

<div class="rex-band rex-band--verify">
  <div class="rex-band__content">
    <span class="rex-band__eyebrow">VERIFICATION / PRIVACY</span>
    <h2 class="rex-band__title">It checks its own work before showing you</h2>
    <p class="rex-band__text">
      AIOS runs self-diagnostics, safety gates, and verification loops on every
      change — so you see a working result, not a broken draft. Your code and data
      never leave your machine.
    </p>
    <a class="rex-band__link" href="troubleshooting">See how verification works <span aria-hidden="true">→</span></a>
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
    <span class="rex-run__eyebrow">HOW IT WORKS</span>
    <h2 class="rex-run__title">One sentence triggers four systems</h2>
    <p class="rex-run__sub">Memory, routing, collaboration, and safety — all working behind the scenes.</p>
  </div>
  <div class="rex-run__grid">
    <article class="rex-run__card">
      <h3 class="rex-run__card-title">Remembers everything</h3>
      <p class="rex-run__card-text">Your project decisions, constraints, and progress are saved locally. Next session, the agent picks up where it left off — no re-explaining needed.</p>
      <code class="rex-run__card-cmd">aios init</code>
    </article>
    <article class="rex-run__card">
      <h3 class="rex-run__card-title">Picks the right approach</h3>
      <p class="rex-run__card-text">AIOS automatically chooses the simplest path for your task — quick answer, careful edit, or full plan — so you don't have to think about process.</p>
      <code class="rex-run__card-cmd">aios work</code>
    </article>
    <article class="rex-run__card">
      <h3 class="rex-run__card-title">Splits work automatically</h3>
      <p class="rex-run__card-text">When your task has independent parts, AIOS runs them in parallel with multiple agents — you just say what you want once.</p>
      <code class="rex-run__card-cmd">aios team</code>
    </article>
    <article class="rex-run__card">
      <h3 class="rex-run__card-title">Checks before delivery</h3>
      <p class="rex-run__card-text">Safety gates and verification loops run on every change. You get a working result, not a broken draft that needs fixing.</p>
      <code class="rex-run__card-cmd">aios verify</code>
    </article>
  </div>
</div>

<!-- ============================================================
     Full-width install block
     ============================================================ -->

<div class="rex-install">
  <div class="rex-install__inner">
    <h2 class="rex-install__title">30 seconds to your first one-sentence task</h2>
    <p class="rex-install__text">Install, initialize in your project, and start telling your agent what to do.</p>
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
      <span class="rex-bloglist__tag">Graph Engine</span>
      <h3 class="rex-bloglist__card-title"><a href="/blog/2026-08-10-aios-loop-graph-engineering/">Graph Engine Locally</a></h3>
      <p class="rex-bloglist__card-text">Compose loop toolkit and graph nodes into a verifiable agent graph, with no data leaving your machine.</p>
    </article>
    <article class="rex-bloglist__card">
      <span class="rex-bloglist__tag">Teams</span>
      <h3 class="rex-bloglist__card-title"><a href="/blog/2026-08-parallel-coding-agents/">Parallel Coding Agents</a></h3>
      <p class="rex-bloglist__card-text">When independent work items can run in parallel — and when they must not.</p>
    </article>
    <article class="rex-bloglist__card">
      <span class="rex-bloglist__tag">Workflow</span>
      <h3 class="rex-bloglist__card-title"><a href="/blog/2026-07-v400-adaptive-workflow-policy/">4.0.0 Adaptive Workflow Policy</a></h3>
      <p class="rex-bloglist__card-text">Classify work before choosing process controls — noop, direct, guarded, planned.</p>
    </article>
  </div>
</div>

<!-- ============================================================
     Closing CTA
     ============================================================ -->

<div class="rex-cta">
  <div class="rex-cta__inner">
    <h2 class="rex-cta__title">Ready to stop explaining and start finishing?</h2>
    <p class="rex-cta__text">One sentence is all it takes. Install AIOS and let your agent do the rest.</p>
    <div class="rex-cta__buttons">
      <a href="getting-started" class="md-button md-button--primary">Get Started Free</a>
      <a href="contextdb" class="md-button">Read Docs</a>
    </div>
  </div>
</div>
