(function () {
  const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
  let disposers = [];

  async function bootHomeWebGL() {
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
      console.warn('[Harness CLI] Home WebGL effects disabled.', error);
    }
  }

  function disposeHomeWebGL() {
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
