(function () {
  const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
  const HOME_DESIGN_WIDTH = 1440;
  let disposers = [];

  function syncHomeDesignScale() {
    const main = document.querySelector('.rex-home-main');
    if (!main) return;

    const viewportWidth = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const scale = Math.min(1, viewportWidth / HOME_DESIGN_WIDTH);
    main.style.setProperty('--rex-home-scale', String(scale));
  }

  async function bootHomeWebGL() {
    if (!document.getElementById('hero-canvas')) return;

    syncHomeDesignScale();
    window.addEventListener('resize', syncHomeDesignScale, { passive: true });

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
      console.warn('[Harness CLI] Home WebGL effects disabled.', error);
    }
  }

  function disposeHomeWebGL() {
    window.removeEventListener('resize', syncHomeDesignScale);
    while (disposers.length) {
      const dispose = disposers.pop();
      if (typeof dispose === 'function') dispose();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootHomeWebGL, { once: true });
  } else {
    bootHomeWebGL();
  }

  window.addEventListener('pagehide', disposeHomeWebGL);
})();
