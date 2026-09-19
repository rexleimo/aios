---
title: "AIOS — 로컬 우선 Graph Engine"
description: "코딩 에이전트를 위한 로컬 우선 Graph Engine. Codex, Claude Code, Gemini CLI 등 10개 클라이언트 위에서 세션 간 프로젝트 기억, 적응형 라우팅, 멀티 에이전트 협업, 검증을 검증 가능한 그래프로 엮습니다."
home: true
schema_type: faq
faq:
  - q: AIOS 가 무엇인가요?
    a: "AIOS는 AI 코딩 클라이언트가 복잡한 작업을 실제로 끝내게 만드는 한 줄 레이어입니다. 필요한 것을 한 문장으로 말하면, agent 가 올바르게 마무리하는 데 필요한 기억·검증·협업을 AIOS 가 채워 줍니다(Codex, Claude Code, Gemini CLI, OpenCode, Hermes, Grok, WorkBuddy, Pi, ZCode, Qoder 지원)."
  - q: AIOS 가 제가 쓰는 코딩 클라이언트를 대체하나요?
    a: "아닙니다. Codex, Claude Code, Gemini CLI, OpenCode, Hermes, Grok, WorkBuddy, Pi, ZCode, Qoder를 지금까지처럼 그대로 씁니다. AIOS는 그 아래에 들어가 부족한 것을 더합니다—세션을 넘는 영속 기억, 자동 작업 라우팅, 전달 전 검증. 10 개 클라이언트 모두 프로젝트 기억·네이티브 지시·harness 구동을 얻지만, 서브에이전트 정의와 `aios team` 분배는 클라이언트마다 다릅니다. `aios doctor --native --verbose` 로 본인 상태를 확인하세요."
  - q: AIOS는 세션 간 컨텍스트를 어떻게 기억하나요?
    a: "AIOS는 프로젝트 결정·제약·진행을 ContextDB 라는 로컬 기억 저장소에 넣습니다. 새 세션을 시작하면 agent 가 처음부터 다시 하는 대신 관련 컨텍스트만 가져옵니다."
  - q: 제 코드는 안전한가요?
    a: "안전합니다. 기억·로그·검증 근거 전부 당신의 기계 안에 머무릅니다. 코드나 프롬프트 데이터를 외부 서버로 보내지 않습니다."
  - q: AIOS는 어떻게 설치하나요?
    a: "명령 한 줄입니다: curl -fsSL https://github.com/rexleimo/aios/releases/latest/download/aios-install.sh | bash, 그 뒤 프로젝트에서 aios init --all. 30 초면 끝납니다."
---

<!-- ============================================================
     Hero Section (v8 / ZIK3q) — title + portrait + full-width showcase
     ============================================================ -->

<div class="rex-hero">
  <div class="rex-hero__inner">
    <div class="rex-hero__content">
      <div class="rex-hero__badge">
        <svg class="rex-hero__badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>
        로컬 우선 GRAPH ENGINE · v{{ aios_version }}
      </div>

      <h1 class="rex-hero__title">당신의 AI 코딩 agent에게 로컬 우선 Graph Engine을.</h1>

      <p class="rex-hero__sub">
        AIOS는 코딩 agent를 위한 로컬 우선 Graph Engine 입니다. 세션 간 프로젝트 기억, 적응형 라우팅,
        멀티 에이전트 협업, 검증을 Codex, Claude Code, Gemini CLI, OpenCode, Hermes, Grok, WorkBuddy, Pi, ZCode,
        Qoder 10 개 클라이언트 위에서 하나의 검증 가능한 그래프로 엮어냅니다——작업 방식은 그대로 두고.
      </p>

      <div class="rex-hero__cta">
        <a href="getting-started" class="md-button md-button--primary">30 초에 설치</a>
        <a href="https://github.com/rexleimo/aios" class="md-button">GitHub에서 보기</a>
      </div>

      <div class="rex-hero__install" role="group" aria-label="한 줄 설치">
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
      <img src="../assets/home/hero-portrait.png" alt="AIOS에이전트 워크플로 개요" width="1254" height="1254" loading="eager" fetchpriority="high" />
    </figure>
  </div>

  <figure class="rex-hero__showcase">
    <img src="../assets/home/hero2.png" alt="AIOS로컬 우선 agent harness 개요" width="1536" height="768" loading="lazy" />
  </figure>
</div>

<!-- ============================================================
     Logo Wall — client names
     ============================================================ -->

<div id="clients" class="rex-clients">
  <div class="rex-clients__header">
    <div class="rex-clients__heading">
      <span class="rex-clients__eyebrow">지원 클라이언트 · 10</span>
      <h2 class="rex-clients__title">이미 쓰는 클라이언트 안에서 그대로 동작</h2>
    </div>
    <p class="rex-clients__note">
      모든 클라이언트에서 같은 프로젝트 기억, 워크플로 정책, 검증 근거.
      기능 깊이는 동일하지 않으니 본인 환경으로 확인하세요 <code>aios doctor --native --verbose</code>.
    </p>
  </div>
  <div class="rex-clients__grid">
    <div class="rex-client">
      <div class="rex-client__head"><span class="rex-client__mark">CX</span><span class="rex-client__name">Codex CLI</span><code class="rex-client__cmd">codex</code></div>
      <div class="rex-client__caps"><span class="rex-cap rex-cap--on">skills</span><span class="rex-cap rex-cap--on">native</span><span class="rex-cap rex-cap--on">harness</span><span class="rex-cap rex-cap--on">agents</span><span class="rex-cap rex-cap--on">team</span></div>
    </div>
    <div class="rex-client">
      <div class="rex-client__head"><span class="rex-client__mark">CL</span><span class="rex-client__name">Claude Code</span><code class="rex-client__cmd">claude</code></div>
      <div class="rex-client__caps"><span class="rex-cap rex-cap--on">skills</span><span class="rex-cap rex-cap--on">native</span><span class="rex-cap rex-cap--on">harness</span><span class="rex-cap rex-cap--on">agents</span><span class="rex-cap rex-cap--on">team</span></div>
    </div>
    <div class="rex-client">
      <div class="rex-client__head"><span class="rex-client__mark">GM</span><span class="rex-client__name">Gemini CLI</span><code class="rex-client__cmd">gemini</code></div>
      <div class="rex-client__caps"><span class="rex-cap rex-cap--on">skills</span><span class="rex-cap rex-cap--on">native</span><span class="rex-cap rex-cap--on">harness</span><span class="rex-cap rex-cap--off">agents</span><span class="rex-cap rex-cap--on">team</span></div>
    </div>
    <div class="rex-client">
      <div class="rex-client__head"><span class="rex-client__mark">OC</span><span class="rex-client__name">OpenCode</span><code class="rex-client__cmd">opencode</code></div>
      <div class="rex-client__caps"><span class="rex-cap rex-cap--on">skills</span><span class="rex-cap rex-cap--on">native</span><span class="rex-cap rex-cap--on">harness</span><span class="rex-cap rex-cap--on">agents</span><span class="rex-cap rex-cap--on">team</span></div>
    </div>
    <div class="rex-client">
      <div class="rex-client__head"><span class="rex-client__mark">HE</span><span class="rex-client__name">Hermes</span><code class="rex-client__cmd">hermes</code></div>
      <div class="rex-client__caps"><span class="rex-cap rex-cap--on">skills</span><span class="rex-cap rex-cap--on">native</span><span class="rex-cap rex-cap--on">harness</span><span class="rex-cap rex-cap--off">agents</span><span class="rex-cap rex-cap--off">team</span></div>
    </div>
    <div class="rex-client">
      <div class="rex-client__head"><span class="rex-client__mark">GR</span><span class="rex-client__name">Grok Build</span><code class="rex-client__cmd">grok</code></div>
      <div class="rex-client__caps"><span class="rex-cap rex-cap--on">skills</span><span class="rex-cap rex-cap--on">native</span><span class="rex-cap rex-cap--on">harness</span><span class="rex-cap rex-cap--on">agents</span><span class="rex-cap rex-cap--on">team</span></div>
    </div>
    <div class="rex-client">
      <div class="rex-client__head"><span class="rex-client__mark">WB</span><span class="rex-client__name">WorkBuddy</span><code class="rex-client__cmd">codebuddy</code></div>
      <div class="rex-client__caps"><span class="rex-cap rex-cap--on">skills</span><span class="rex-cap rex-cap--on">native</span><span class="rex-cap rex-cap--on">harness</span><span class="rex-cap rex-cap--off">agents</span><span class="rex-cap rex-cap--off">team</span></div>
    </div>
    <div class="rex-client">
      <div class="rex-client__head"><span class="rex-client__mark">PI</span><span class="rex-client__name">Pi</span><code class="rex-client__cmd">pi</code></div>
      <div class="rex-client__caps"><span class="rex-cap rex-cap--on">skills</span><span class="rex-cap rex-cap--on">native</span><span class="rex-cap rex-cap--on">harness</span><span class="rex-cap rex-cap--off">agents</span><span class="rex-cap rex-cap--on">team</span></div>
    </div>
    <div class="rex-client">
      <div class="rex-client__head"><span class="rex-client__mark">ZC</span><span class="rex-client__name">ZCode</span><code class="rex-client__cmd">zcode</code></div>
      <div class="rex-client__caps"><span class="rex-cap rex-cap--on">skills</span><span class="rex-cap rex-cap--on">native</span><span class="rex-cap rex-cap--on">harness</span><span class="rex-cap rex-cap--plugin" title="프로젝트 범위 서브에이전트 면이 없어, rex 역할 카드는 ZCode plugin agents로 동작">agents+</span><span class="rex-cap rex-cap--on">team</span></div>
    </div>
    <div class="rex-client">
      <div class="rex-client__head"><span class="rex-client__mark">QO</span><span class="rex-client__name">Qoder</span><code class="rex-client__cmd">qoder</code></div>
      <div class="rex-client__caps"><span class="rex-cap rex-cap--on">skills</span><span class="rex-cap rex-cap--on">native</span><span class="rex-cap rex-cap--on">harness</span><span class="rex-cap rex-cap--off">agents</span><span class="rex-cap rex-cap--on">team</span></div>
    </div>
  </div>
  <div class="rex-clients__legend">
    <span><b>skills</b> 스킬 팩 설치됨</span>
    <span><b>native</b> 네이티브 지시 파일 기록</span>
    <span><b>harness</b> solo-harness 구동</span>
    <span><b>agents</b> 서브에이전트 정의</span>
    <span><b>agents+</b> 클라이언트 플러그인 dir 경유로 서브에이전트 제공</span>
    <span><b>team</b> <code>aios team</code> 분배</span>
    <a class="rex-clients__more" href="cli-comparison">클라이언트 비교 <span aria-hidden="true">→</span></a>
  </div>
</div>

<!-- ============================================================
     Team band — image left, text right
     ============================================================ -->

<div id="capabilities" class="rex-band rex-band--team">
  <figure class="rex-band__media">
    <img src="../assets/home/team2.png" alt="AIOS 멀티 에이전트 팀 협업" width="1536" height="1024" loading="lazy" />
  </figure>
  <div class="rex-band__content">
    <span class="rex-band__eyebrow">멀티 AGENT 팀</span>
    <h2 class="rex-band__title">한 번만 말하면, 여러 agent 가 병렬로 처리합니다.</h2>
    <p class="rex-band__text">
      당신이 한 문장으로 지시하면 AIOS 가 작업을 여러 agent에게 자동 나눕니다.
      독립 작업은 병렬로, 결합된 변경은 순서대로—결과는 기다리면 됩니다.
    </p>
    <a class="rex-band__link" href="team-ops">작동 방식 보기 <span aria-hidden="true">→</span></a>
  </div>
</div>

<!-- ============================================================
     Verification band — text left, image right
     ============================================================ -->

<div class="rex-band rex-band--verify">
  <div class="rex-band__content">
    <span class="rex-band__eyebrow">검증 / 프라이버시</span>
    <h2 class="rex-band__title">보여주기 전에 자기 작업을 검증합니다</h2>
    <p class="rex-band__text">
      AIOS는 모든 변경에 자가 진단·안전 게이트·검증 루프를 돌리므로,
      깨진 초안이 아니라 동작하는 결과를 보게 됩니다. 코드와 데이터는
      기계를 절대 벗어나지 않습니다.
    </p>
    <a class="rex-band__link" href="troubleshooting">검증 작동 방식 보기 <span aria-hidden="true">→</span></a>
  </div>
  <figure class="rex-band__media">
    <img src="../assets/home/doctor2.png" alt="AIOS 검증과 진단" width="1536" height="1024" loading="lazy" />
  </figure>
</div>

<!-- ============================================================
     Run layer 2×2
     ============================================================ -->

<div id="demo" class="rex-run">
  <div class="rex-run__header">
    <span class="rex-run__eyebrow">동작 원리</span>
    <h2 class="rex-run__title">한 문장이 4 개 시스템을 가동합니다</h2>
    <p class="rex-run__sub">기억·라우팅·협업·안전—모든 것이 무대 뒤에서 작동합니다.</p>
  </div>
  <div class="rex-run__grid">
    <article class="rex-run__card">
      <h3 class="rex-run__card-title">모든 것을 기억합니다</h3>
      <p class="rex-run__card-text">프로젝트 결정·제약·진행이 로컬에 저장됩니다. 다음 세션에서는 agent 가 중간부터 이어서 하니 다시 설명할 필요가 없습니다.</p>
      <code class="rex-run__card-cmd">aios init</code>
    </article>
    <article class="rex-run__card">
      <h3 class="rex-run__card-title">알맞은 방식을 고릅니다</h3>
      <p class="rex-run__card-text">AIOS는 작업에 가장 단순한 경로를 자동으로 고릅니다—빠른 답변, 신중한 편집, 전체 계획. 진행 방식을 고민하지 않아도 됩니다.</p>
      <code class="rex-run__card-cmd">aios work</code>
    </article>
    <article class="rex-run__card">
      <h3 class="rex-run__card-title">작업을 자동으로 나눕니다</h3>
      <p class="rex-run__card-text">작업에 독립적인 부분이 있으면 AIOS 가 여러 agent로 병렬 실행합니다—원하는 것을 한 번만 말하면 됩니다.</p>
      <code class="rex-run__card-cmd">aios team</code>
    </article>
    <article class="rex-run__card">
      <h3 class="rex-run__card-title">전달 전에 확인합니다</h3>
      <p class="rex-run__card-text">안전 게이트와 검증 루프가 모든 변경에 적용됩니다. 고쳐야 하는 깨진 초안이 아니라 동작하는 결과를 받습니다.</p>
      <code class="rex-run__card-cmd">aios verify</code>
    </article>
  </div>
</div>

<!-- ============================================================
     Full-width install block
     ============================================================ -->

<div class="rex-install">
  <div class="rex-install__inner">
    <h2 class="rex-install__title">30 초에 첫 한 문장 작업을</h2>
    <p class="rex-install__text">설치하고 프로젝트에서 초기화한 뒤, agent에게 할 일을 말하기만 시작하세요.</p>
    <div class="rex-install__cmds" role="group" aria-label="설치 명령">
      <code class="rex-install__cmd">aios init --all</code>
      <code class="rex-install__cmd">aios doctor --native --verbose</code>
    </div>
    <a href="getting-started" class="md-button md-button--primary rex-install__cta">무료로 시작 <span aria-hidden="true">→</span></a>
  </div>
</div>

<!-- ============================================================
     Blog list (3 posts)
     ============================================================ -->

<div class="rex-bloglist">
  <div class="rex-bloglist__header">
    <span class="rex-bloglist__eyebrow">블로그에서</span>
    <h2 class="rex-bloglist__title">최신 워크플로 가이드</h2>
    <a class="rex-bloglist__more" href="/blog/ko/">모든 글 <span aria-hidden="true">→</span></a>
  </div>
  <div class="rex-bloglist__grid">
    <article class="rex-bloglist__card">
      <span class="rex-bloglist__tag">Graph Engine</span>
      <h3 class="rex-bloglist__card-title"><a href="/blog/ko/2026-08-10-aios-loop-graph-engineering/">Graph Engine로컬 구현</a></h3>
      <p class="rex-bloglist__card-text">loop도구 상자와 그래프 노드를 검증 가능한 agent 그래프로 엮습니다. 데이터는 기계를 벗어나지 않습니다.</p>
    </article>
    <article class="rex-bloglist__card">
      <span class="rex-bloglist__tag">팀</span>
      <h3 class="rex-bloglist__card-title"><a href="/blog/ko/2026-08-parallel-coding-agents/">병렬 코딩 에이전트</a></h3>
      <p class="rex-bloglist__card-text">독립 작업 항목이 병렬로 달려도 되는 순간과, 절대 병렬로 하면 안 되는 순간.</p>
    </article>
    <article class="rex-bloglist__card">
      <span class="rex-bloglist__tag">워크플로</span>
      <h3 class="rex-bloglist__card-title"><a href="/blog/ko/2026-07-v400-adaptive-workflow-policy/">4.0.0 적응형 워크플로 정책</a></h3>
      <p class="rex-bloglist__card-text">과정 제어를 고르기 전에 작업을 분류한다—noop, direct, guarded, planned.</p>
    </article>
  </div>
  <div class="rex-bloglist__more-list">
    <span class="rex-bloglist__more-label">다른 블로그 글</span>
    <a class="rex-bloglist__more-link" href="/blog/ko/2026-09-v516-zcode-client/">v5.16.0: ZCode 가 AIOS에 참여 <i aria-hidden="true">→</i></a>
    <a class="rex-bloglist__more-link" href="/blog/ko/rl-training-system/">AIOS RL 학습 시스템 <i aria-hidden="true">→</i></a>
    <a class="rex-bloglist__more-link" href="/blog/ko/contextdb-fts-bm25-search/">ContextDB 검색 업그레이드 <i aria-hidden="true">→</i></a>
    <a class="rex-bloglist__more-link" href="/blog/ko/windows-cli-startup-stability/">Windows CLI 시작 안정성 <i aria-hidden="true">→</i></a>
    <a class="rex-bloglist__more-link" href="/blog/ko/orchestrate-live/">오케스트레이션 라이브 검증 <i aria-hidden="true">→</i></a>
  </div>
</div>

<!-- ============================================================
     Closing CTA
     ============================================================ -->

<div class="rex-cta">
  <div class="rex-cta__inner">
    <h2 class="rex-cta__title">설명 대신 완성을 시작할 준비가 됐나요?</h2>
    <p class="rex-cta__text">한 문장이면 충분합니다. AIOS를 설치하고 나머지는 agent에게 맡기세요.</p>
    <div class="rex-cta__buttons">
      <a href="getting-started" class="md-button md-button--primary">무료로 시작</a>
      <a href="use-cases" class="md-button">사용 사례 보기</a>
      <a href="contextdb" class="md-button">문서 읽기</a>
    </div>
  </div>
</div>
