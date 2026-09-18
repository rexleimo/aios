---
title: "AIOS — ローカル優先 Graph Engine"
description: "コーディングエージェントのためのローカル優先 Graph Engine。Codex、Claude Code、Gemini CLI など 9 つのクライアントの上に、記憶・適応型ルーティング・マルチエージェント協調・検証をひとつの検証可能なグラフとして編成します。"
home: true
schema_type: faq
faq:
  - q: AIOS とは？
    a: "AIOS は AI コーディングクライアントに複雑なタスクを本当に完了させるための一行レイヤーです。必要度を一文で伝えれば、agent が正しく終わらせるために必要な記憶・検証・協調を AIOS が補います（Codex、Claude Code、Gemini CLI、OpenCode、Hermes、Grok、WorkBuddy、Pi、ZCode に対応）。"
  - q: AIOS は今使っているコーディングクライアントを置き換えますか？
    a: "いいえ。Codex、Claude Code、Gemini CLI、OpenCode、Hermes、Grok、WorkBuddy、Pi、ZCode を今まで通り使えます。AIOS はその下に入り、足りないものを補います——セッションをまたぐ永続記憶、タスクの自動ルーティング、納品前の検証。9 クライアントすべてがプロジェクト記憶・ネイティブ指示・harness 駆動を取得しますが、サブエージェント定義と `aios team` ディスパッチの可否はクライアント依存です。自分の環境は `aios doctor --native --verbose` で確認してください。"
  - q: AIOS はセッションをまたいでコンテキストをどう覚えておくのですか？
    a: "AIOS はプロジェクトの決定・制約・進捗を ContextDB というローカル記憶ストアに保存します。新しいセッションを始めると、agent はゼロから始めるのではなく必要なコンテキストだけを取りに行きます。"
  - q: コードはプライベートに保たれますか？
    a: "はい。記憶・ログ・検証証拠のすべてがあなたのマシン上に残ります。コードやプロンプトデータを外部サーバーに送ることはありません。"
  - q: AIOS はどうインストールしますか？
    a: "コマンド一行です: curl -fsSL https://github.com/rexleimo/aios/releases/latest/download/aios-install.sh | bash、その後プロジェクトで aios init --all。30 秒以内で終わります。"
---

<!-- ============================================================
     Hero Section (v8 / ZIK3q) — title + portrait + full-width showcase
     ============================================================ -->

<div class="rex-hero">
  <div class="rex-hero__inner">
    <div class="rex-hero__content">
      <div class="rex-hero__badge">
        <svg class="rex-hero__badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>
        ローカル優先 GRAPH ENGINE · v{{ aios_version }}
      </div>

      <h1 class="rex-hero__title">AI コーディング agent に、ローカル優先の Graph Engine を。</h1>

      <p class="rex-hero__sub">
        AIOS はコーディング agent のためのローカル優先 Graph Engine です。セッションをまたぐプロジェクト記憶、
        適応型ルーティング、マルチエージェント協調、検証を、Codex、Claude Code、Gemini CLI、OpenCode、Hermes、
        Grok、WorkBuddy、Pi、ZCode の 9 クライアントの上でひとつの検証可能なグラフに編成します——
        今の作業スタイルはそのままに。
      </p>

      <div class="rex-hero__cta">
        <a href="getting-started" class="md-button md-button--primary">30 秒でインストール</a>
        <a href="https://github.com/rexleimo/aios" class="md-button">GitHub で見る</a>
      </div>

      <div class="rex-hero__install" role="group" aria-label="一行インストール">
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
      <img src="../assets/home/hero-portrait.png" alt="AIOS エージェントワークフロー全体像" width="1254" height="1254" loading="eager" fetchpriority="high" />
    </figure>
  </div>

  <figure class="rex-hero__showcase">
    <img src="../assets/home/hero2.png" alt="AIOS ローカル優先 agent harness 全体像" width="1536" height="768" loading="lazy" />
  </figure>
</div>

<!-- ============================================================
     Logo Wall — client names
     ============================================================ -->

<div id="clients" class="rex-clients">
  <div class="rex-clients__header">
    <div class="rex-clients__heading">
      <span class="rex-clients__eyebrow">対応クライアント · 9</span>
      <h2 class="rex-clients__title">今使っているクライアントの中で、そのまま動く</h2>
    </div>
    <p class="rex-clients__note">
      すべてのクライアントで同じプロジェクト記憶・ワークフロポリシー・検証証拠。
      機能の深さは同じではないので、自分の環境は次で確認してください <code>aios doctor --native --verbose</code>.
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
      <div class="rex-client__caps"><span class="rex-cap rex-cap--on">skills</span><span class="rex-cap rex-cap--on">native</span><span class="rex-cap rex-cap--on">harness</span><span class="rex-cap rex-cap--plugin" title="プロジェクト範囲のサブエージェント面がないため、rex ロールカードは ZCode plugin agents として動作">agents+</span><span class="rex-cap rex-cap--on">team</span></div>
    </div>
  </div>
  <div class="rex-clients__legend">
    <span><b>skills</b> スキルパックをインストール済み</span>
    <span><b>native</b> ネイティブ指示ファイルを書き込む</span>
    <span><b>harness</b> solo-harness で駆動</span>
    <span><b>agents</b> サブエージェント定義</span>
    <span><b>agents+</b> クライアントプラグイン dir 経由でサブエージェントを提供</span>
    <span><b>team</b> <code>aios team</code> ディスパッチ</span>
    <a class="rex-clients__more" href="cli-comparison">クライアントを比較 <span aria-hidden="true">→</span></a>
  </div>
</div>

<!-- ============================================================
     Team band — image left, text right
     ============================================================ -->

<div id="capabilities" class="rex-band rex-band--team">
  <figure class="rex-band__media">
    <img src="../assets/home/team2.png" alt="AIOS マルチエージェントチーム協業" width="1536" height="1024" loading="lazy" />
  </figure>
  <div class="rex-band__content">
    <span class="rex-band__eyebrow">マルチ AGENT チーム</span>
    <h2 class="rex-band__title">一度だけ伝える。複数の agent が並列で片付ける。</h2>
    <p class="rex-band__text">
      あなたが一文で指示すると、AIOS が作業を複数の agent に自動で分割します。
      独立したタスクは並列に、結合した変更は順番に——待つのは結果だけです。
    </p>
    <a class="rex-band__link" href="team-ops">仕組みを見る <span aria-hidden="true">→</span></a>
  </div>
</div>

<!-- ============================================================
     Verification band — text left, image right
     ============================================================ -->

<div class="rex-band rex-band--verify">
  <div class="rex-band__content">
    <span class="rex-band__eyebrow">検証 / プライバシー</span>
    <h2 class="rex-band__title">見せる前に、自分の仕事を検証する</h2>
    <p class="rex-band__text">
      AIOS はすべての変更に対して自己診断・安全ゲート・検証ループを回すので、
      壊れた下書きではなく動く結果が目に入ります。コードとデータがマシンから
      出ることは一切ありません。
    </p>
    <a class="rex-band__link" href="troubleshooting">検証の仕組みを見る <span aria-hidden="true">→</span></a>
  </div>
  <figure class="rex-band__media">
    <img src="../assets/home/doctor2.png" alt="AIOS 検証と診断" width="1536" height="1024" loading="lazy" />
  </figure>
</div>

<!-- ============================================================
     Run layer 2×2
     ============================================================ -->

<div id="demo" class="rex-run">
  <div class="rex-run__header">
    <span class="rex-run__eyebrow">動作原理</span>
    <h2 class="rex-run__title">一文が 4 つのシステムを起動する</h2>
    <p class="rex-run__sub">記憶・ルーティング・協調・安全——すべてが舞台裏で動いています。</p>
  </div>
  <div class="rex-run__grid">
    <article class="rex-run__card">
      <h3 class="rex-run__card-title">すべて覚えている</h3>
      <p class="rex-run__card-text">プロジェクトの決定・制約・進捗はローカルに保存されます。次のセッションでは agent が途中から続けるので、説明のし直しは不要です。</p>
      <code class="rex-run__card-cmd">aios init</code>
    </article>
    <article class="rex-run__card">
      <h3 class="rex-run__card-title">正しい進め方を選ぶ</h3>
      <p class="rex-run__card-text">AIOS はタスクに最もシンプルな経路を自動で選びます——すぐ回答、慎重な編集、完全な計画。進め方を考えなくて済みます。</p>
      <code class="rex-run__card-cmd">aios work</code>
    </article>
    <article class="rex-run__card">
      <h3 class="rex-run__card-title">作業を自動で分ける</h3>
      <p class="rex-run__card-text">タスクに独立した部分があれば、AIOS はそれを複数 agent で並列実行します——望むことを一度言うだけでいい。</p>
      <code class="rex-run__card-cmd">aios team</code>
    </article>
    <article class="rex-run__card">
      <h3 class="rex-run__card-title">納品前に確認する</h3>
      <p class="rex-run__card-text">安全ゲートと検証ループがすべての変更に通ります。手直しが必要な壊れた下書きではなく、動く結果が渡されます。</p>
      <code class="rex-run__card-cmd">aios verify</code>
    </article>
  </div>
</div>

<!-- ============================================================
     Full-width install block
     ============================================================ -->

<div class="rex-install">
  <div class="rex-install__inner">
    <h2 class="rex-install__title">30 秒で最初の一文タスクを</h2>
    <p class="rex-install__text">インストールし、プロジェクトで初期化したら、agent に何をするか伝え始めるだけです。</p>
    <div class="rex-install__cmds" role="group" aria-label="インストール手順">
      <code class="rex-install__cmd">aios init --all</code>
      <code class="rex-install__cmd">aios doctor --native --verbose</code>
    </div>
    <a href="getting-started" class="md-button md-button--primary rex-install__cta">無料で始める <span aria-hidden="true">→</span></a>
  </div>
</div>

<!-- ============================================================
     Blog list (3 posts)
     ============================================================ -->

<div class="rex-bloglist">
  <div class="rex-bloglist__header">
    <span class="rex-bloglist__eyebrow">ブログから</span>
    <h2 class="rex-bloglist__title">最新のワークフローガイド</h2>
    <a class="rex-bloglist__more" href="/blog/ja/">すべての記事 <span aria-hidden="true">→</span></a>
  </div>
  <div class="rex-bloglist__grid">
    <article class="rex-bloglist__card">
      <span class="rex-bloglist__tag">Graph Engine</span>
      <h3 class="rex-bloglist__card-title"><a href="/blog/ja/2026-08-10-aios-loop-graph-engineering/">Graph Engine をローカルで</a></h3>
      <p class="rex-bloglist__card-text">loop ツールキットとグラフノードを検証可能な agent グラフに編成します。データはマシンから出ません。</p>
    </article>
    <article class="rex-bloglist__card">
      <span class="rex-bloglist__tag">チーム</span>
      <h3 class="rex-bloglist__card-title"><a href="/blog/ja/2026-08-parallel-coding-agents/">並列コーディングエージェント</a></h3>
      <p class="rex-bloglist__card-text">独立した作業項目が並列で走るべき瞬間と、決して並列にできない瞬間。</p>
    </article>
    <article class="rex-bloglist__card">
      <span class="rex-bloglist__tag">ワークフロー</span>
      <h3 class="rex-bloglist__card-title"><a href="/blog/ja/2026-07-v400-adaptive-workflow-policy/">4.0.0 適応型ワークフローポリシー</a></h3>
      <p class="rex-bloglist__card-text">プロセス制御を選ぶ前に作業を分類する——noop、direct、guarded、planned。</p>
    </article>
  </div>
  <div class="rex-bloglist__more-list">
    <span class="rex-bloglist__more-label">その他のブログ</span>
    <a class="rex-bloglist__more-link" href="/blog/ja/2026-09-v516-zcode-client/">v5.16.0: ZCode が AIOS に参加 <i aria-hidden="true">→</i></a>
    <a class="rex-bloglist__more-link" href="/blog/ja/rl-training-system/">AIOS RL 訓練システム <i aria-hidden="true">→</i></a>
    <a class="rex-bloglist__more-link" href="/blog/ja/contextdb-fts-bm25-search/">ContextDB 検索アップグレード <i aria-hidden="true">→</i></a>
    <a class="rex-bloglist__more-link" href="/blog/ja/windows-cli-startup-stability/">Windows CLI 起動の安定性 <i aria-hidden="true">→</i></a>
    <a class="rex-bloglist__more-link" href="/blog/ja/orchestrate-live/">オケストレーション Live 検証 <i aria-hidden="true">→</i></a>
  </div>
</div>

<!-- ============================================================
     Closing CTA
     ============================================================ -->

<div class="rex-cta">
  <div class="rex-cta__inner">
    <h2 class="rex-cta__title">説明をやめて、完了させる準備はできましたか？</h2>
    <p class="rex-cta__text">必要なのは一文だけ。AIOS をインストールして、あとは agent に任せください。</p>
    <div class="rex-cta__buttons">
      <a href="getting-started" class="md-button md-button--primary">無料で始める</a>
      <a href="use-cases" class="md-button">ユースケースを見る</a>
      <a href="contextdb" class="md-button">ドキュメントを読む</a>
    </div>
  </div>
</div>
