
(() => {
  const nav = document.getElementById("nav");

  // The theme button steps system → light → dark.
  const next = { system: "light", light: "dark", dark: "system" };
  document.querySelectorAll("button.theme:not(.menu):not(.lang)").forEach((b) => {
    b.dataset.mode = themeMode();
    b.title = themeTitle(themeMode());
    b.addEventListener("click", () => setTheme(next[themeMode()]));
  });
  // On a narrow screen the links fold into a menu; a link picked, a tap
  // outside or Escape closes it.
  const menu = nav.querySelector(".menu");
  const open = (on) => { nav.classList.toggle("open", on); menu.setAttribute("aria-expanded", String(on)); };
  menu.addEventListener("click", () => open(!nav.classList.contains("open")));
  nav.querySelectorAll(".links a").forEach((a) => a.addEventListener("click", () => open(false)));
  document.addEventListener("click", (e) => { if (!nav.contains(e.target)) open(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && nav.classList.contains("open")) { open(false); menu.focus(); } });

  // The language menu. The language picked is remembered, so / stops
  // sending a Chinese or Japanese browser to its page once another was asked
  // for.
  const langBtn = nav.querySelector(".lang"), langs = document.getElementById("langs");
  const langOpen = (on) => { langs.hidden = !on; langBtn.setAttribute("aria-expanded", String(on)); };
  langBtn.addEventListener("click", () => { open(false); langOpen(langs.hidden); });
  langs.querySelectorAll("a").forEach((a) => {
    if (a.hreflang === LANG) a.setAttribute("aria-current", "page");
    a.addEventListener("click", () => { document.cookie = "lang=" + a.hreflang + "; path=/; max-age=31536000; samesite=lax"; });
  });
  document.addEventListener("click", (e) => { if (!langBtn.parentNode.contains(e.target)) langOpen(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !langs.hidden) { langOpen(false); langBtn.focus(); } });
  menu.addEventListener("click", () => langOpen(false));

  const onScroll = () => nav.classList.toggle("scrolled", scrollY > 8);
  addEventListener("scroll", onScroll, { passive: true }); onScroll();

  document.querySelectorAll(".copy").forEach((b) => b.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(document.getElementById(b.dataset.copy).textContent);
      b.textContent = T("Copied", "已复制", "コピーしました", "Kopiert"); setTimeout(() => (b.textContent = T("Copy", "复制", "コピー", "Kopieren")), 1400);
    } catch {}
  }));

  // Windows and Linux get their own app; arm64 is guessed from the user
  // agent and corrected by the browser when it can tell.
  const ua = navigator.userAgent;
  const os = /Windows/.test(ua) ? "windows" : /Linux|X11|CrOS/.test(ua) && !/Android/.test(ua) ? "linux" : "mac";
  if (os !== "mac") {
    document.documentElement.dataset.os = os;
    const name = os === "windows" ? "Windows" : "Linux";
    const arm = /aarch64|arm64|armv8/i.test(ua);
    const dl = (a64) => "/download/" + os + (a64 ? "-arm64" : "-amd64");
    document.querySelectorAll("a.dl").forEach((a) => (a.href = dl(arm)));
    document.querySelectorAll(".dl-label").forEach((e) => (e.textContent = T("Download for " + name, "下载 " + name + " 版", name + " 版をダウンロード", "Für " + name + " herunterladen")));
    document.querySelectorAll(".os-note").forEach((e) => (e.innerHTML = os === "windows" ? "Windows 10+" : "Needs WebKitGTK 4.1"));
    document.querySelectorAll('.meta a[href="#get"]').forEach((a) => (a.textContent = T("macOS & other builds", "macOS 及其他版本", "macOS とその他のビルド", "macOS und weitere Builds")));
    try { navigator.userAgentData?.getHighEntropyValues(["architecture"]).then((v) => {
      if (v.architecture === "arm") document.querySelectorAll("a.dl").forEach((a) => (a.href = dl(true)));
    }).catch(() => {}); } catch {}
  }

  // Intel Macs get the Intel build; browsers that can tell say so, the rest
  // get Apple Silicon with the Intel link beside it.
  const setArch = (arch) => {
    if (arch !== "x86" || os !== "mac") return;
    document.querySelectorAll("a.dl").forEach((a) => (a.href = "/download/mac-intel"));
    document.querySelectorAll("a.alt").forEach((a) => { a.href = "/download/mac-arm64"; a.textContent = "Apple Silicon"; });
  };
  try { navigator.userAgentData?.getHighEntropyValues(["architecture"]).then((v) => setArch(v.architecture)).catch(() => {}); } catch {}

  // The newest version, and Stable's beside it (fishmagic80 on X): the
  // platform links download either; the hero's Stable link picks Stable.
  const feed = (q) => fetch("/api/latest" + q).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const chan = document.querySelector(".chan");
  const plats = [...document.querySelectorAll(".plats a")].map((a) => [a, a.getAttribute("href").replace("/download/", "")]);
  const pick = (ch) => {
    chan.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.ch === ch)));
    plats.forEach(([a, p]) => (a.href = (ch === "stable" ? "/download/stable/" : "/download/") + p));
  };
  chan.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => pick(b.dataset.ch)));
  Promise.all([feed(""), feed("?channel=stable")]).then(([rel, st]) => {
    if (!rel) return;
    document.querySelectorAll(".ver").forEach((e) => (e.textContent = T("Version ", "版本 ", "バージョン ", "Version ") + rel.version));
    if (!st || !st.version || st.version === rel.version) return;
    chan.querySelector('[data-ch="latest"] .v').textContent = rel.version;
    document.querySelectorAll('[data-ch="stable"] .v, .stable-v').forEach((e) => (e.textContent = st.version));
    chan.hidden = false;
    document.querySelector(".final > .meta").hidden = true; // the choice names both versions
    document.querySelectorAll(".to-stable").forEach((e) => {
      e.hidden = false;
      e.querySelector("a").addEventListener("click", () => pick("stable"));
    });
    if (location.hash === "#stable") { pick("stable"); chan.scrollIntoView({ block: "center" }); }
  });
})();
