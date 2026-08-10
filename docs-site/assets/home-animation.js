(function () {
  const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
  let disposers = [];

  async   function bootHomeWebGL() {
    if (!document.getElementById('hero-canvas')) return;

    if (window.matchMedia(REDUCED_MOTION).matches) {
      document.documentElement.classList.add('rex-webgl-reduced-motion');
      return;
    }

    try {
      const runtime = await import('./redesign/home-webgl-runtime.js');
      disposers = await runtime.initHomeWebGL({ root: document });
      document.documentElement.classList.add('rex-webgl-ready');
    } catch (error) {
      document.documentElement.classList.add('rex-webgl-fallback');
      console.warn('[AIOS] Home WebGL effects disabled.', error);
    }
  }

  // Lazy boot: only start the WebGL runtime once the hero enters the viewport,
  // keeping first-paint and LCP free of the animation cost on slow devices.
  function bootWhenVisible() {
    const canvas = document.getElementById('hero-canvas');
    if (!canvas || !('IntersectionObserver' in window)) {
      bootHomeWebGL();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            observer.disconnect();
            bootHomeWebGL();
            return;
          }
        }
      },
      { rootMargin: '200px 0px' }
    );
    observer.observe(canvas);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootWhenVisible, { once: true });
  } else {
    bootWhenVisible();
  }

  function disposeHomeWebGL() {
    while (disposers.length) {
      const dispose = disposers.pop();
      if (typeof dispose === 'function') dispose();
    }
  }

  window.addEventListener('pagehide', disposeHomeWebGL);
})();
