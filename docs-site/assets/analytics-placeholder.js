/* Analytics bridge for Harness CLI docs.
 * Sends events to gtag when available and falls back to console logs.
 */
(function () {
  if (typeof window === "undefined") return;

  if (window.__rexaiAnalyticsInitialized) return;
  window.__rexaiAnalyticsInitialized = true;

  function detectLocale(pathname) {
    var match =
      pathname.match(/^\/(zh|ja|ko)(\/|$)/) ||
      pathname.match(/^\/blog\/(zh|ja|ko)(\/|$)/);
    return match ? match[1] : "en";
  }

  function ensureAnalyticsClient() {
    window.rexaiAnalytics = window.rexaiAnalytics || {
      track: function (eventName, payload) {
        var eventPayload = payload || {};
        if (typeof window.gtag === "function") {
          window.gtag("event", eventName, eventPayload);
          return;
        }
        console.log("[rexai-analytics]", eventName, eventPayload);
      },
    };
    return window.rexaiAnalytics;
  }

  function localizeCrossSiteLinks() {
    var locale = detectLocale(window.location.pathname);
    if (locale === "en") return;

    var localizedDocsPrefix = "/" + locale;
    var localizedBlogPrefix = "/blog/" + locale + "/";
    var anchors = document.querySelectorAll("a[href]");

    anchors.forEach(function (anchor) {
      var href = anchor.getAttribute("href");
      if (!href) return;

      var url;
      try {
        url = new URL(href, window.location.href);
      } catch (error) {
        return;
      }

      if (url.hostname !== "cli.rexai.top") return;

      if (url.pathname.startsWith("/blog/")) {
        if (/^\/blog\/(zh|ja|ko)(\/|$)/.test(url.pathname)) return;
        var blogRest = url.pathname.slice("/blog/".length);
        url.pathname = (localizedBlogPrefix + blogRest).replace(/\/+/g, "/");
        anchor.setAttribute("href", url.toString());
        return;
      }

      if (/^\/(zh|ja|ko)(\/|$)/.test(url.pathname)) return;
      if (url.pathname.startsWith("/assets/")) return;
      url.pathname = (localizedDocsPrefix + url.pathname).replace(/\/+/g, "/");
      anchor.setAttribute("href", url.toString());
    });
  }

  function trackPageView() {
    var analytics = ensureAnalyticsClient();
    analytics.track("rex_page_view", {
      locale: detectLocale(window.location.pathname),
      path: window.location.pathname,
      title: document.title,
    });
  }

  function normalizeTarget(anchor) {
    var text = (anchor.textContent || "").trim().toLowerCase();
    if (!text) return "unknown";
    return text.replace(/\s+/g, "_").replace(/[^a-z0-9_\u4e00-\u9fa5-]/g, "").slice(0, 64) || "unknown";
  }

  function bindCTATracking() {
    document.addEventListener(
      "click",
      function (event) {
        var target = event.target;
        if (!target || !target.closest) return;

        var anchor = target.closest("a[data-rex-track], a[data-rex-target], a[data-rex-location]");
        if (!anchor) return;

        var analytics = ensureAnalyticsClient();
        analytics.track(anchor.dataset.rexTrack || "cta_click", {
          locale: detectLocale(window.location.pathname),
          path: window.location.pathname,
          location: anchor.dataset.rexLocation || "unknown",
          target: anchor.dataset.rexTarget || normalizeTarget(anchor),
          href: anchor.href || anchor.getAttribute("href") || "",
        });
      },
      true,
    );
  }

  function init() {
    localizeCrossSiteLinks();
    ensureAnalyticsClient();
    trackPageView();
    bindCTATracking();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
