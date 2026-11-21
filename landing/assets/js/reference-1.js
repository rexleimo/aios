
// The chosen theme (light, dark, or the system's) is on <html data-theme>
// before anything paints.
// The page is English, or the language the worker served it in at /zh/,
// /ja/ or /de/; T(en, zh, ja, de) is a script's words in it.
window.LANG = document.documentElement.lang.slice(0, 2);
window.T = (en, zh, ja, de) => ({ zh, ja, de })[LANG] ?? en;
window.themeTitle = (m) => T("Theme: " + m, "主题：" + { system: "跟随系统", light: "浅色", dark: "深色" }[m], "テーマ：" + { system: "システム", light: "ライト", dark: "ダーク" }[m], "Farbschema: " + { system: "System", light: "Hell", dark: "Dunkel" }[m]);
(() => {
  let mode = "system";
  try { mode = localStorage.getItem("theme") || "system"; } catch {}
  const q = matchMedia("(prefers-color-scheme: dark)");
  const apply = () => {
    const t = mode === "system" ? (q.matches ? "dark" : "light") : mode;
    document.documentElement.dataset.theme = t;
    document.querySelector('meta[name="theme-color"]').content = t === "dark" ? "#0b0b0c" : "#fafafa";
    document.querySelectorAll("button.theme:not(.menu):not(.lang)").forEach((b) => { b.dataset.mode = mode; b.title = themeTitle(mode); });
  };
  q.addEventListener("change", () => mode === "system" && apply());
  window.setTheme = (m) => { mode = m; try { m === "system" ? localStorage.removeItem("theme") : localStorage.setItem("theme", m); } catch {} apply(); };
  window.themeMode = () => mode;
  apply();
})();
