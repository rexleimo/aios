/* Placeholder for analytics integration.
 * Replace with Plausible/GA4 script loader once account is ready.
 */
(function () {
  if (typeof window === "undefined") return;

  function detectLocale(pathname) {
    var match =
      pathname.match(/^\/(zh|ja|ko)(\/|$)/) ||
      pathname.match(/^\/blog\/(zh|ja|ko)(\/|$)/);
    return match ? match[1] : "en";
  }

  function localizeCrossSiteLinks() {
    var locale = detectLocale(window.location.pathname);
    if (locale === "en") return;

    var localizedDocsPrefix = "/" + locale;
    var localizedBlogPrefix = "/blog/" + locale + "/";
    var anchors = document.querySelectorAll("a[href]");

    anchors.forEach(function (anchor) {
      if (anchor.hasAttribute("hreflang") || anchor.closest(".rex-lang-switcher")) return;

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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", localizeCrossSiteLinks);
  } else {
    localizeCrossSiteLinks();
  }

  window.rexaiAnalytics = window.rexaiAnalytics || {
    track: function (eventName, payload) {
      console.log("[rexai-analytics]", eventName, payload || {});
    },
  };
})();
