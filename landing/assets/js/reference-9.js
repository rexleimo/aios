
// The routing demo: requests travel from the agent through magpie to the
// account the chosen strategy picks; one that can't answer sends the request
// back to magpie, which tries the next.
(() => {
  const rt = document.getElementById("rt");
  if (!rt) return;
  const $ = (s) => rt.querySelector(s);
  const stage = $(".rt-stage"), svg = $(".rt-wires"), src = $(".rt-src"), hub = $(".rt-hub"), list = $(".rt-accts");
  const cap = $(".rt-cap"), desc = $(".rt-mode"), chip = hub.querySelector("i");
  const stat = [...rt.querySelectorAll(".rt-stats b")], statName = [...rt.querySelectorAll(".rt-stats > span")].map((e) => e.lastChild);
  const who = src.querySelector("small");
  const tabs = [...rt.querySelectorAll(".rt-tabs button")];
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const NS = "http://www.w3.org/2000/svg";

  // Two Claude subscriptions and three other vendors' accounts, each with
  // its vendor's icon; the captions name them by plan.
  const V = {
    claude: ["me@work.dev", "Claude Max", "claude-color", "Claude Max", ""],
    claude2: ["me@home.dev", "Claude Pro", "claude-color", "Claude Pro", ""],
    gpt: ["me@home.dev", "ChatGPT Pro", "openai", "ChatGPT Pro", "bird"],
    or: ["sk-or-…4f2a", "OpenRouter", "openrouter", T("The OpenRouter key", "OpenRouter 密钥", "OpenRouter のキー", "Der OpenRouter-Schlüssel"), "bird"],
    gh: ["octo-dev", "Copilot Business", "githubcopilot", "Copilot", "bird"],
  };
  const A = (v, used, inc, x = {}) => { const [who, plan, icon, name, cls] = V[v]; return { who, plan, icon, name, cls, used, inc, ...x }; };
  // A group's models, each with the rule that sends a turn to it; the first
  // takes what no rule matches.
  const G = (who, plan, icon, cls, rule, short) => ({ who, plan, icon, cls, rule, short, used: 0, inc: 0, key: 1 });
  const MODES = {
    intent: {
      name: T("By intent", "按意图", "インテント別", "Nach Intent"), n: 0, stats: T(["turns", "asked the classifier", "tool rounds kept on their model"], ["轮对话", "次询问分类模型", "个工具轮次留在原模型"], ["ターン", "分類モデルへの問い合わせ", "同じモデルに留まったツール往復"], ["Runden", "Fragen an den Klassifikator", "Tool-Runden beim selben Modell"]),
      desc: T("By intent: as a turn begins, a small fast model (the group's classifier) is asked once which of your rules' intents the message is. The turn goes to that rule's model; its tool rounds stay there, without asking again.",
        "按意图：每轮对话开始时，问一次小而快的模型（路由组的分类模型）这条消息属于你哪条规则的意图。这一轮交给那条规则的模型，之后的工具轮次也留在那里，不再重新询问。",
        "インテント別：ターンの始めに、小さく速いモデル（グループの分類モデル）に、メッセージがどのルールのインテントにあたるかを一度だけ尋ねます。そのターンはそのルールのモデルが担当し、続くツールの往復も問い直さずそこに留まります。",
        "Nach Intent: Zu Beginn einer Runde wird ein kleines, schnelles Modell (der Klassifikator der Gruppe) einmal gefragt, welchem Intent Ihrer Regeln die Nachricht entspricht. Die Runde geht an das Modell dieser Regel; ihre Tool-Runden bleiben dort, ohne erneute Frage."),
      accts: () => [
        G("claude-opus-5-5", "Claude Max", "claude-color", "", T("first · whatever no rule takes", "第一个 · 规则都不匹配时用它", "先頭 · どのルールにも当たらないとき", "erstes · alles, was keine Regel nimmt")),
        G("deepseek-v4-flash", "DeepSeek", "deepseek-color", "", T("intent · a quick question", "意图 · 简单提问", "インテント · ちょっとした質問", "Intent · eine kurze Frage"), T("quick question", "简单提问", "ちょっとした質問", "kurze Frage")),
        G("glm-5.3", T("Zhipu GLM", "智谱 GLM", "Zhipu GLM", "Zhipu GLM"), "zhipu-color", "", T("intent · writing or fixing tests", "意图 · 编写或修复测试", "インテント · テストの作成や修正", "Intent · Tests schreiben oder reparieren"), T("tests", "测试", "テスト", "Tests")),
        G("kimi-k3", "Kimi", "kimi", "bird", T("intent · reviewing a diff", "意图 · 审阅改动", "インテント · 差分のレビュー", "Intent · einen Diff prüfen"), T("review", "审阅", "レビュー", "Review")),
      ],
      turns: [
        [T("Add a --dry-run flag to the deploy command", "给 deploy 命令加一个 --dry-run 参数", "deploy コマンドに --dry-run フラグを追加して", "Dem deploy-Befehl ein --dry-run-Flag hinzufügen"), 0, 2],
        [T("What does ^\\d{3}-\\d{4}$ match?", "^\\d{3}-\\d{4}$ 能匹配什么？", "^\\d{3}-\\d{4}$ は何にマッチする？", "Worauf passt ^\\d{3}-\\d{4}$?"), 1, 0],
        [T("TestRouting fails after my change — fix it", "我改完之后 TestRouting 挂了，帮我修好", "変更したら TestRouting が落ちた。直して", "TestRouting schlägt nach meiner Änderung fehl – bitte reparieren"), 2, 2],
        [T("Review my staged changes before I commit", "提交前帮我审一下暂存的改动", "コミット前にステージした変更をレビューして", "Meine gestagten Änderungen vor dem Commit prüfen"), 3, 1],
        [T("Why does useEffect run twice in dev?", "为什么 useEffect 在开发模式下会执行两次？", "開発モードで useEffect が2回実行されるのはなぜ？", "Warum läuft useEffect im Dev-Modus zweimal?"), 1, 0],
        [T("Write table-driven tests for parseTokens", "给 parseTokens 写表驱动测试", "parseTokens のテーブル駆動テストを書いて", "Tabellengetriebene Tests für parseTokens schreiben"), 2, 1],
        [T("Refactor the retry loop into its own function", "把重试循环抽成单独的函数", "リトライのループを別の関数に切り出して", "Die Retry-Schleife in eine eigene Funktion auslagern"), 0, 1],
      ],
    },
    smart: {
      name: T("Smart", "智能", "スマート", "Smart"), n: 30,
      desc: T("Smart, the default: the account that resets soonest goes first, so no allowance is left to go to waste; any that can't answer are passed over. (Here each request stands for an hour.)",
        "智能（默认）：最先重置的账号先用，额度一点不浪费；答不了的账号直接跳过。（演示里每个请求代表一小时。）",
        "スマート（既定）：リセットが最も早いアカウントから使うので、枠を無駄にしません。応答できないアカウントは飛ばします。（デモでは1リクエストを1時間とします。）",
        "Smart, die Voreinstellung: Das Konto, das als Erstes zurückgesetzt wird, kommt zuerst, damit kein Kontingent verfällt; Konten, die nicht antworten können, werden übersprungen. (Hier steht jede Anfrage für eine Stunde.)"),
      first: (a) => T(`${a.name} resets in ${fmt(left(a))} — soonest, so it goes first: what it has left is used, not lost at the reset.`,
        `${a.name} ${fmt(left(a))}后重置，最早，所以先用它：剩下的额度会被用掉，而不是在重置时作废。`,
        `${a.name} は ${fmt(left(a))}後にリセット。最も早いので先に使います。残りの枠はリセットで消えずに使い切られます。`,
        `${a.name} wird in ${fmt(left(a))} zurückgesetzt – am frühesten, also kommt es zuerst dran: Was übrig ist, wird genutzt, statt beim Reset zu verfallen.`),
      accts: () => [
        A("claude", 72, 1.5, { r: 9 }),
        A("claude2", 38, 3, { r: 48, fail: { at: 3, code: 429, rest: 7000 } }),
        A("gpt", 30, 3, { r: 96 }),
        A("or", 0, 0, { key: 1, fail: { at: 0, code: 402 } }),
        A("gh", 24, 2, { r: 288, fail: { at: 4, code: 503, rest: 5000 } }),
      ],
    },
    order: {
      name: T("In order", "按顺序", "優先順", "Der Reihe nach"), n: 18,
      desc: T("In order: the first answers everything until it can't; then the next takes over.", "按顺序：第一个账号包揽所有请求，直到它答不了，再由下一个接手。", "優先順：最初のアカウントが応答できなくなるまですべてを担当し、その後は次が引き継ぎます。", "Der Reihe nach: Das erste Konto beantwortet alles, bis es nicht mehr kann; dann übernimmt das nächste."),
      first: (a) => T(`${a.name} answers everything, for as long as it can.`, `${a.name} 只要还能答，就全由它来答。`, `応答できる限り、${a.name} がすべてを担当します。`, `${a.name} beantwortet alles, solange es geht.`),
      accts: () => [A("claude", 76, 3), A("claude2", 44, 3), A("gpt", 30, 3), A("or", 0, 0, { key: 1 }), A("gh", 24, 2)],
    },
    turn: {
      name: T("In turn", "轮流", "持ち回り", "Reihum"), n: 16,
      desc: T("In turn: each request goes to the next account, so the load is spread evenly.", "轮流：每个请求交给下一个账号，负载均匀分摊。", "持ち回り：リクエストごとに次のアカウントへ回し、負荷を均等に分散します。", "Reihum: Jede Anfrage geht an das nächste Konto, so verteilt sich die Last gleichmäßig."),
      first: () => T("Each request goes to the next account in turn.", "每个请求依次交给下一个账号。", "リクエストを順番に次のアカウントへ回します。", "Jede Anfrage geht reihum an das nächste Konto."),
      accts: () => [A("claude", 30, 2), A("claude2", 40, 2), A("gpt", 52, 2), A("or", 0, 0, { key: 1 }), A("gh", 18, 2)],
    },
    least: {
      name: T("Least used", "用量少的优先", "使用量の少ない順", "Geringste Nutzung"), n: 18,
      desc: T("Least used first: each request goes to the account with the most allowance left; a key by the tokens magpie sent it lately.", "用量少的优先：每个请求交给剩余额度最多的账号；密钥按 magpie 最近发给它的 token 数算。", "使用量の少ない順：各リクエストを残り枠が最も多いアカウントへ送ります。キーは magpie が最近送ったトークン数で比べます。", "Geringste Nutzung zuerst: Jede Anfrage geht an das Konto mit dem meisten verbleibenden Kontingent; ein Schlüssel nach den Tokens, die magpie ihm zuletzt geschickt hat."),
      first: () => T("Each request goes to whichever has the most left — watch the bars even out.", "每个请求交给剩得最多的账号——看进度条慢慢拉平。", "各リクエストは残りが最も多いアカウントへ。バーが揃っていく様子をご覧ください。", "Jede Anfrage geht an das Konto mit dem meisten Rest – sehen Sie zu, wie sich die Balken angleichen."),
      accts: () => [A("claude", 64, 6), A("claude2", 30, 6), A("gpt", 22, 6), A("or", 40, 6, { key: 1, bar: 1 }), A("gh", 46, 6)],
    },
  };

  let mode, M, accts = [], t = 0, gen = 0, next = 0, sent = 0, done = 0, rerouted = 0, errs = 0, ptr = 0;
  let hours = 0; // the demo's clock in smart mode: an hour a request
  const left = (a) => a.r - hours, fmt = (h) => h < 48 ? T(`${h} h`, `${h} 小时`, `${h} 時間`, `${h} Std.`) : T(`${Math.round(h / 24)} d`, `${Math.round(h / 24)} 天`, `${Math.round(h / 24)} 日`, `${Math.round(h / 24)} Tg.`);
  let began = 0, last = null, trips = [], capQ = [], capAt = -1e9, capLo = false, endAt = 0, wSrc, vis = true;

  const resting = (a) => a.until > t;
  const path = () => { const p = document.createElementNS(NS, "path"); svg.appendChild(p); return p; };
  const tick = (el) => { el.classList.remove("tick"); void el.offsetWidth; el.classList.add("tick"); };
  const travel = (dot, p, rev, dur) => new Promise((res) => trips.push({ dot, p, rev, t0: t, dur: still ? 0 : dur, res, g: gen }));
  const wait = (ms) => travel(null, null, false, ms);
  // A caption about a failure goes ahead of the small ones ("takes over", "is back").
  const say = (s, lo) => {
    if (lo && capQ.length) return;
    if (!lo) capQ = capQ.filter((c) => !c.lo);
    capQ.push({ s, lo });
    if (capQ.length > 2) capQ.shift();
  };

  function layout() {
    const r = stage.getBoundingClientRect();
    const box = (el) => { const b = el.getBoundingClientRect(); return { l: b.left - r.left, r: b.right - r.left, t: b.top - r.top, b: b.bottom - r.top, cx: (b.left + b.right) / 2 - r.left, cy: (b.top + b.bottom) / 2 - r.top }; };
    svg.setAttribute("viewBox", `0 0 ${r.width} ${r.height}`);
    const s = box(src), h = box(hub);
    wSrc.setAttribute("d", h.l > s.r ? `M${s.r} ${s.cy} L${h.l} ${h.cy}` : `M${s.cx} ${s.b} L${h.cx} ${h.t}`);
    for (const a of accts) {
      const b = box(a.li);
      if (b.l > h.r) {
        const mx = (h.r + b.l) / 2;
        a.wire.setAttribute("d", `M${h.r} ${h.cy} C${mx} ${h.cy} ${mx} ${b.cy} ${b.l} ${b.cy}`);
      } else { // the accounts sit under magpie: a lane down their left
        const x = b.l - 14;
        a.wire.setAttribute("d", `M${h.cx} ${h.b} C${h.cx} ${h.b + 26} ${x} ${h.b + 2} ${x} ${h.b + 28} L${x} ${b.cy - 10} Q${x} ${b.cy} ${b.l} ${b.cy}`);
      }
    }
  }

  function reset(m) {
    gen++; mode = m; M = MODES[m]; accts = M.accts();
    sent = done = rerouted = errs = ptr = began = hours = 0; last = null; endAt = 0; trips = []; capQ = [];
    next = t + 600;
    list.innerHTML = accts.map((a) => `<li><i class="dot"></i><b><img${a.cls ? ` class="${a.cls}"` : ""} src="/icons/${a.icon}.svg" alt="">${a.who} <span>${a.plan}</span></b><em></em><div class="bar"><i></i></div><span class="tag"></span></li>`).join("");
    svg.innerHTML = "";
    wSrc = path();
    accts.forEach((a, i) => {
      a.li = list.children[i]; a.st = a.li.querySelector("em"); a.bi = a.li.querySelector(".bar i"); a.tg = a.li.querySelector(".tag");
      a.li.classList.toggle("nobar", !!a.key && !a.bar);
      a.wire = path(); a.served = 0; a.until = 0;
    });
    layout();
    list.classList.toggle("models", !!M.turns);
    desc.textContent = M.desc; chip.textContent = M.name; who.textContent = T("your agent", "你的 Agent", "あなたのエージェント", "Ihr Agent");
    (M.stats || T(["requests", "rerouted", "errors your agent saw"], ["个请求", "次改道", "个错误被 Agent 看到"], ["リクエスト", "振り替え", "エージェントが見たエラー"], ["Anfragen", "umgeleitet", "Fehler bei Ihrem Agenten"])).forEach((n, i) => (statName[i].textContent = n));
    tabs.forEach((b) => b.setAttribute("aria-selected", String(b.dataset.mode === m)));
    show(M.turns ? T("Claude Code sends every turn to one model name — a magpie group. Watch where each message goes.", "Claude Code 每轮都发给同一个模型名——一个 magpie 路由组。看每条消息去了哪里。", "Claude Code は毎ターン、同じモデル名（magpie のグループ）に送ります。各メッセージの行き先をご覧ください。", "Claude Code schickt jede Runde an denselben Modellnamen – eine Weiterleitungsgruppe von magpie. Sehen Sie, wohin jede Nachricht geht.")
      : T("Claude Code sends every request to magpie; magpie decides which account answers it.", "Claude Code 把每个请求发给 magpie，由 magpie 决定哪个账号来答。", "Claude Code はすべてのリクエストを magpie に送り、どのアカウントが応答するかは magpie が決めます。", "Claude Code schickt jede Anfrage an magpie; magpie entscheidet, welches Konto sie beantwortet."));
    stats(); render();
  }

  function show(c) { capLo = !!c.lo; const s = c.s || c; cap.textContent = s; cap.classList.remove("in"); void cap.offsetWidth; cap.classList.add("in"); capAt = t; }
  function stats() { stat[0].textContent = done; stat[1].textContent = rerouted; stat[2].textContent = errs; }

  function pick() {
    const ok = accts.filter((a) => !resting(a));
    if (!ok.length) return null;
    switch (mode) {
      case "smart": return ok.filter((a) => a.used < 90).sort((x, y) => (x.r ?? 1e9) - (y.r ?? 1e9))[0] || ok.slice().sort((x, y) => x.used - y.used)[0];
      case "order": return ok[0];
      case "least": return ok.slice().sort((x, y) => x.used - y.used)[0];
      default:
        for (let i = 0; i < accts.length; i++) {
          const a = accts[(ptr + i) % accts.length];
          if (!resting(a)) { ptr = (accts.indexOf(a) + 1) % accts.length; return a; }
        }
    }
  }

  function respond(a) {
    if (resting(a)) return a.code;
    if (a.fail && !a.failed && a.served >= a.fail.at) { a.failed = 1; return a.fail.code; }
    if (!a.key && a.used >= 100) return "quota";
    return 200;
  }

  function serve(a) {
    const was = a.used;
    a.served++; a.used = Math.min(100, a.used + a.inc);
    if (last !== a) {
      if (!began) began = 1, say(M.first(a));
      else if (mode === "smart" && a.used >= 90) say(T(`The others are resting, so ${a.name.replace(/^The /, "the ")} answers — running low beats no answer.`, `其他账号都在休息，所以由 ${a.name} 来答——额度快用完也比没人答强。`, `ほかのアカウントは休止中なので ${a.name} が応答します。枠が残り少なくても、応答なしよりはましです。`, `Die anderen pausieren, also antwortet ${a.name.replace(/^Der /, "der ")} – knappes Kontingent ist besser als keine Antwort.`));
      else if (mode === "smart" && a.r) say(T(`${a.name} takes over — it resets next, in ${fmt(left(a))}.`, `${a.name} 接手——它下一个重置，还有 ${fmt(left(a))}。`, `${a.name} が引き継ぎます。次にリセットされるのはこれで、あと ${fmt(left(a))}。`, `${a.name} übernimmt – sein Reset kommt als Nächstes, in ${fmt(left(a))}.`), true);
      else if (mode === "smart" || mode === "order") say(T(`${a.name} takes over.`, `${a.name} 接手。`, `${a.name} が引き継ぎます。`, `${a.name} übernimmt.`), true);
      last = a;
    }
    if (mode === "smart" && was < 90 && a.used >= 90) say(T(`${a.name} is at ${Math.round(a.used)}% — kept for last. The next with quota to spare takes over.`, `${a.name} 已用 ${Math.round(a.used)}%——留到最后。下一个额度充足的账号接手。`, `${a.name} は ${Math.round(a.used)}% 使用済み。最後に回し、枠に余裕のある次のアカウントが引き継ぎます。`, `${a.name} steht bei ${Math.round(a.used)}% – es kommt zuletzt dran. Das nächste Konto mit genug Kontingent übernimmt.`));
    if (mode !== "smart") return;
    hours++;
    for (const b of accts) if (b.r && left(b) <= 0) { // its week renews: now the last to reset
      const lost = Math.round(100 - b.used);
      b.used = 0; b.r += 168;
      say(T(`${b.name}'s week renewed with only ${lost}% unused — it went first, so little was lost. It resets last now; the next to reset takes over.`, `${b.name} 的周额度已重置，只剩 ${lost}% 没用上——它先用，所以几乎没浪费。现在它最晚重置，下一个要重置的账号接手。`, `${b.name} の週の枠がリセットされました。使い残しは ${lost}% だけ。先に使ったので無駄はほとんどありません。今度はリセットが最も遅いので、次にリセットされるアカウントが引き継ぎます。`, `Das Wochenkontingent von ${b.name} wurde erneuert, nur ${lost}% blieben ungenutzt – es kam zuerst dran, also ging wenig verloren. Jetzt kommt sein Reset als letzter; das Konto mit dem nächsten Reset übernimmt.`));
      if (last === b) last = null;
    }
  }

  const TAGS = T({ 429: "429 · rate limited", 402: "402 · no credit", 503: "503 · failed", quota: "429 · quota used up" },
    { 429: "429 · 限流", 402: "402 · 余额不足", 503: "503 · 出错", quota: "429 · 额度用完" },
    { 429: "429 · レート制限", 402: "402 · クレジット不足", 503: "503 · 失敗", quota: "429 · 枠を使い切り" },
    { 429: "429 · Rate-Limit", 402: "402 · kein Guthaben", 503: "503 · Fehler", quota: "429 · Kontingent aufgebraucht" });
  function fail(a, code) {
    a.li.classList.remove("hit"); void a.li.offsetWidth; a.li.classList.add("hit", "tagged");
    a.tg.textContent = TAGS[code];
    setTimeout(() => a.li.classList.remove("tagged"), 1500);
    if (resting(a)) return; // it was already out when the request got there
    a.code = code;
    next = Math.max(next, t + 1500); // a moment to read what happened
    if (code === 429) { a.why = "rate"; a.until = t + a.fail.rest; say(T(`${a.name} answered 429 — it rests for as long as the vendor asks, and the request is retried on the next at once.`, `${a.name} 返回 429——按厂商要求的时长休息，请求立刻在下一个账号上重试。`, `${a.name} が 429 を返しました。ベンダーが求める間だけ休ませ、リクエストはすぐ次のアカウントで再試行します。`, `${a.name} antwortete mit 429 – Pause, so lange der Anbieter es verlangt; die Anfrage wird sofort beim nächsten Konto wiederholt.`)); }
    if (code === 402) { a.why = "credit"; a.until = Infinity; say(T(`${a.name} is out of credit — it sits out half an hour, and the request moves on. Claude Code never sees the error.`, `${a.name} 余额不足——歇半小时，请求转给别的账号。Claude Code 完全看不到这个错误。`, `${a.name} はクレジット切れ。30分休ませ、リクエストは別のアカウントへ。Claude Code にこのエラーは見えません。`, `${a.name} hat kein Guthaben mehr – eine halbe Stunde Pause, und die Anfrage zieht weiter. Claude Code sieht den Fehler nie.`)); }
    if (code === 503) { a.why = "fail"; a.until = t + a.fail.rest; say(T(`${a.name} failed — it steps back a while, longer each time it fails again. Another account answers instead.`, `${a.name} 出错了——先退下一会儿，再出错就退得更久。换另一个账号来答。`, `${a.name} が失敗。しばらく外し、失敗が続くほど長く外します。代わりに別のアカウントが応答します。`, `${a.name} ist fehlgeschlagen – eine Weile Pause, bei jedem weiteren Fehler länger. Ein anderes Konto antwortet stattdessen.`)); }
    if (code === "quota") { a.why = "quota"; a.until = Infinity; say(T(`${a.name} is out of quota — passed over until it resets. The request goes to the next.`, `${a.name} 额度用完——重置前都跳过它，请求交给下一个。`, `${a.name} は枠を使い切りました。リセットまで飛ばし、リクエストは次へ。`, `${a.name} hat sein Kontingent aufgebraucht – bis zum Reset übersprungen. Die Anfrage geht an das nächste Konto.`)); }
    if (last === a) last = null;
  }

  async function request(g) {
    const dot = document.createElementNS(NS, "circle");
    dot.setAttribute("r", 4.5); dot.setAttribute("class", "pkt"); dot.setAttribute("cx", -20);
    svg.appendChild(dot); tick(src);
    await travel(dot, wSrc, false, 380);
    for (let tries = 0; g === gen && tries < 8; tries++) {
      const a = pick();
      if (!a) { await wait(400); continue; }
      tick(hub);
      await travel(dot, a.wire, false, 420);
      if (g !== gen) return;
      const code = respond(a);
      if (code === 200) {
        serve(a);
        dot.classList.add("back"); dot.setAttribute("r", 4);
        await travel(dot, a.wire, true, 360);
        await travel(dot, wSrc, true, 320);
        if (g !== gen) return;
        dot.remove(); done++; stats(); return;
      }
      fail(a, code); rerouted++; stats();
      await travel(dot, a.wire, true, 300);
    }
    if (g !== gen) return;
    dot.remove(); done++; errs++; stats();
  }

  // By intent: a turn's first request is classified, once; its tool rounds
  // follow it to the same model.
  async function turns(g) {
    const trip = async (a) => {
      const dot = document.createElementNS(NS, "circle");
      dot.setAttribute("r", 4.5); dot.setAttribute("class", "pkt"); dot.setAttribute("cx", -2